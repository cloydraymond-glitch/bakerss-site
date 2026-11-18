import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '../../../../lib/supabase/admin';
import { notifyWebsiteLead } from '../../../../lib/website-leads/notifications';
import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
function authenticated(request: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  const auth = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(auth); const b = Buffer.from(expected);
  return secret.length >= 32 && a.length === b.length && timingSafeEqual(a,b);
}
export async function GET(request: Request) {
  if (!authenticated(request)) return NextResponse.json({error:'Not allowed'}, {status:401});
  if (process.env.WEBSITE_LEADS_NOTIFY_ENABLED !== 'true')
    return NextResponse.json({skipped:true}, {headers:{'Cache-Control':'no-store'}});
  try {
    const db = createSupabaseAdmin();
    const { data, error } = await db.rpc('crm_due_website_notices', {p_limit: 8});
    if (error) return NextResponse.json({error:'Queue unavailable'}, {status:503});
    const refs = [...new Set((data || []).map((r: {opportunity_id: string}) => r.opportunity_id))];
    for (const id of refs) await notifyWebsiteLead(id);
    return NextResponse.json({processed:refs.length}, {headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Worker error'}, {status:503}); }
}
