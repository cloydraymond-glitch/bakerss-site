import { isIP } from 'node:net';

// Staging-only proxy. Website form is NOT connected until live end-to-end verification.
const reply = (res, status, data) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(data);
};
const allowedOrigin = () => process.env.WEBSITE_LEADS_ALLOWED_ORIGIN;
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return reply(res,405,{error:'Method not allowed'}); }
  const origin = req.headers.origin;
  const target = process.env.WEBSITE_LEADS_OS_URL;
  const secret = process.env.WEBSITE_LEADS_PROXY_SECRET;
  if (process.env.WEBSITE_LEADS_PROXY_ENABLED !== 'true' || !origin || !allowedOrigin() || origin !== allowedOrigin() || !target || !secret || secret.length < 32)
    return reply(res,503,{error:'Website intake unavailable'});
  // Destination must be a configured HTTPS OS endpoint, not a client-supplied URL.
  let url;
  try { url = new URL(target); } catch { return reply(res,503,{error:'Website intake unavailable'}); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/api/public/website-lead'))
    return reply(res,503,{error:'Website intake unavailable'});
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return reply(res,415,{error:'JSON required'});
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(body,'utf8') > 8192) return reply(res,413,{error:'Request too large'});
  // Verify Vercel-provided ingress IP before activation. Do not trust arbitrary browser headers.
  const ip = String(req.headers['x-vercel-forwarded-for'] || '');
  if (!isIP(ip)) return reply(res,503,{error:'IP verification unavailable'});
  try {
    const upstream = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json','Origin':origin,
        'x-bakerss-proxy-secret':secret,'x-bakerss-verified-ip':ip},
      body,
      cache:'no-store',
      signal:AbortSignal.timeout(9000)
    });
    let result;
    try { result = await upstream.json(); } catch { return reply(res,502,{error:'Unexpected intake response'}); }
    if (!result || typeof result !== 'object' || Array.isArray(result)) return reply(res,502,{error:'Unexpected intake response'});
    // Return only approved response fields; never surface backend diagnostics.
    const out = { ...(result.received === true ? {received:true} : {}),
      ...(result.duplicate === true ? {duplicate:true} : {}),
      ...(typeof result.reference === 'string' && /^[0-9a-f-]{36}$/i.test(result.reference) ? {reference:result.reference} : {}),
      ...(typeof result.error === 'string' ? {error:result.error.slice(0,160)} : {}) };
    return reply(res,upstream.status,out);
  } catch { return reply(res,502,{error:'Request could not be confirmed. Please call Bakerss.'}); }
}
