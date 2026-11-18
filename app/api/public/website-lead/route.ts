import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createSupabaseAdmin } from '../../../../lib/supabase/admin';
import { notifyWebsiteLead } from '../../../../lib/website-leads/notifications';

// Staging-only until Turnstile, rate limits, owner identity and E2E tests pass.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const safeSecret = (actual: string | null, expected: string): boolean => {
 if (!actual || !expected || expected.length < 32) return false;
 const a = Buffer.from(actual); const b = Buffer.from(expected);
 return a.length === b.length && timingSafeEqual(a,b);
};
const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
// A deployment must opt in explicitly after trusted ingress and staging tests.
const enabled = () => process.env.WEBSITE_LEADS_ENABLED === 'true';
const json = (body: object, status: number) => NextResponse.json(body, { status, headers: noStore });
const field = (v: unknown, max: number) => typeof v === 'string' && v === v.trim() && v.length <= max ? v : null;
const validService = new Set(['Interior cleaning','HVAC repair / maintenance','Plumbing','Electrical','Handyman','Lawn care','Landscaping','Airbnb / vacation rental cleaning','Vacation home watch / second-home care','Pool maintenance','Commercial maintenance','Apartment maintenance','HOA maintenance','Painting','Flooring','Pressure washing','Other property service','Fence installation & repair','Irrigation & sprinkler repair','Deck building & repair','Window cleaning','Epoxy flooring','Minor electrical & plumbing']);
const validProperty = new Set(['Residential','Commercial','Apartment / multifamily','HOA / community','Vacation rental / second home']);
const validTimeframe = new Set(['Flexible / request a quote','As soon as available','Within 1 week','Within 2–4 weeks','Recurring service inquiry']);
function playbook(service: string, property: string): string {
 if (['Commercial maintenance','Apartment maintenance','HOA maintenance'].includes(service) || ['Commercial','Apartment / multifamily','HOA / community'].includes(property)) return 'commercial';
 if (['HVAC repair / maintenance','Plumbing','Electrical','Minor electrical & plumbing'].includes(service)) return 'technical';
 if (['Painting','Flooring','Epoxy flooring','Handyman','Landscaping','Pressure washing','Fence installation & repair','Irrigation & sprinkler repair','Deck building & repair'].includes(service)) return 'project';
 return 'quick_quote';
}
async function verifiedTurnstile(token: string, ip: string): Promise<boolean> {
 const secret = process.env.WEBSITE_LEADS_TURNSTILE_SECRET;
 if (!secret || !token) return false; // Fail closed, including staging.
 const body = new URLSearchParams({ secret, response: token, remoteip: ip });
 try {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (!res.ok) return false;
  const result = await res.json() as { success?: boolean; hostname?: string; action?: string };
  const allowedHost = process.env.WEBSITE_LEADS_TURNSTILE_HOSTNAME;
  return result.success === true && !!allowedHost && result.hostname === allowedHost && result.action === 'website_quote';
 } catch { return false; }
}
export async function POST(request: Request) {
 const expectedOrigin = process.env.WEBSITE_LEADS_ALLOWED_ORIGIN;
 const owner = process.env.WEBSITE_LEADS_OWNER_USER_ID;
 const pepper = process.env.WEBSITE_LEADS_IP_HASH_SECRET;
 const proxySecret = process.env.WEBSITE_LEADS_PROXY_SECRET;
 if (!enabled() || !expectedOrigin || !owner || !pepper || !process.env.WEBSITE_LEADS_TURNSTILE_SECRET || !process.env.WEBSITE_LEADS_TURNSTILE_HOSTNAME || !proxySecret || proxySecret.length < 32) return json({ error:'Website intake unavailable' },503);
 // Only the first-party Bakerss website server proxy can call this route. Origin is additional defense, NOT authentication.
 if (!safeSecret(request.headers.get('x-bakerss-proxy-secret'),proxySecret)) return json({error:'Request not allowed'},403);
 // No CORS: browsers must submit to a first-party website serverless function.
 const origin = request.headers.get('origin');
 if (origin !== expectedOrigin || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')) return json({error:'Request not allowed'},403);
 if (Number(request.headers.get('content-length')||'0') > 8192) return json({error:'Request too large'},413);
 let data: Record<string, unknown>;
 try { const raw = await request.text(); if (raw.length > 8192) return json({error:'Request too large'},413); data = JSON.parse(raw); if (!data || Array.isArray(data) || typeof data !== 'object') throw Error('invalid'); } catch { return json({error:'Invalid JSON'},400); }
 const name=field(data.full_name,120),phone=field(data.phone,30),email=field(data.email,150),service=field(data.service,100),property=field(data.property_type,50),location=field(data.location,180),timeframe=field(data.timeframe,70),details=field(data.details,2500),source=field(data.source,140), token=field(data.turnstile_token,2048), key=field(data.request_id,36);
 if (!name || name.length < 2 || !phone || !/^[+\d() .-]{7,30}$/.test(phone) || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !service || !validService.has(service) || !property || !validProperty.has(property) || !location || !timeframe || !validTimeframe.has(timeframe) || !details || details.length < 10 || !source || !/^\/[a-z0-9/-]{1,139}\/$/.test(source) || !key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key) || !token) return json({error:'Please check the required fields'},400);
 // Trusted ONLY because the shared proxy secret was verified above; website proxy must derive IP at its own trusted ingress.
 // Confirm Vercel ingress header cannot be spoofed in deployment before enabling the feature.
 const ip=request.headers.get('x-bakerss-verified-ip');
 if (!ip || !isIP(ip)) return json({error:'IP verification unavailable'},503);
 // Turnstile tokens are single-use. A network retry must use a NEW token and the SAME request_id.
 // This endpoint does not claim an inquiry was received unless the database confirms it.
 if (!await verifiedTurnstile(token,ip)) return json({error:'Verification expired or failed. Please verify again and retry.'},403);
 const ipHash=createHash('sha256').update(pepper+'|'+ip).digest('hex');
 try {
  const db=createSupabaseAdmin();
  const payload={ request_id:key, ip_hash:ipHash, owner_user_id:owner, customer_name:name, customer_email:email.toLowerCase(), customer_phone:phone, service_address:location, service_type:service, service_playbook:playbook(service,property), scope:details, property_type:property, timeframe, source_page:source };
  const {data:result,error}=await db.rpc('crm_ingest_website_lead', {p:payload});
  if (error) { console.error('Website intake database error',error.code); return json({error:'Request could not be processed. Please call Bakerss.'},503); }
  if (result?.status === 'rate_limited') return json({error:'Too many requests. Please try again later.'},429);
  if (result?.status !== 'created' && result?.status !== 'duplicate') return json({error:'Request could not be processed'},503);
  // CRM is authoritative. Notification failures must never turn a saved lead into a failed submission.
  // Both initial and duplicate requests may safely retry pending notification slots.
  try { await notifyWebsiteLead(String(result.reference)); } catch { console.warn('Website lead notifications deferred'); }
  return json({received:true,duplicate:result.status==='duplicate',reference:result.reference},result.status==='created'?201:200);
 } catch { return json({error:'Request could not be processed. Please call Bakerss.'},503); }
}
