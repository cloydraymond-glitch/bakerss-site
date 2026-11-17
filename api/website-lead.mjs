import { isIP } from 'node:net';

// Staging-only proxy. Website form is NOT connected until live end-to-end verification.
const reply = (res, status, data) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(data);
};
const allowedOrigin = () => process.env.WEBSITE_LEADS_ALLOWED_ORIGIN;
// Log only a fixed diagnostic code. Never log tokens, IPs, headers, URLs or payloads.
const reject = (res, reason, error = 'Website intake unavailable') => {
  console.warn('[bakerss-website-lead-staging] rejected:', reason);
  return reply(res, 503, { error });
};
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return reply(res,405,{error:'Method not allowed'}); }
  const origin = req.headers.origin;
  const target = process.env.WEBSITE_LEADS_OS_URL;
  const secret = process.env.WEBSITE_LEADS_PROXY_SECRET;
  if (process.env.WEBSITE_LEADS_PROXY_ENABLED !== 'true') return reject(res,'proxy_disabled');
  if (!origin) return reject(res,'origin_header_absent');
  if (!allowedOrigin()) return reject(res,'allowed_origin_not_configured');
  if (origin !== allowedOrigin()) return reject(res,'origin_mismatch');
  if (!target) return reject(res,'os_url_not_configured');
  if (!secret || secret.length < 32) return reject(res,'proxy_secret_missing_or_short');
  // Destination must be a configured HTTPS OS endpoint, not a client-supplied URL.
  let url;
  try { url = new URL(target); } catch { return reject(res,'os_url_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/api/public/website-lead'))
    return reject(res,'os_url_rejected');
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return reply(res,415,{error:'JSON required'});
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(body,'utf8') > 8192) return reply(res,413,{error:'Request too large'});
  // Verify Vercel-provided ingress IP before activation. Do not trust arbitrary browser headers.
  const ip = String(req.headers['x-vercel-forwarded-for'] || '');
  if (!isIP(ip)) return reject(res, !ip ? 'vercel_ip_missing' : ip.includes(',') ? 'vercel_ip_multiple' : 'vercel_ip_invalid', 'IP verification unavailable');
  try {
    const upstream = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json','Origin':origin,
        'x-bakerss-proxy-secret':secret,'x-bakerss-verified-ip':ip},
      body,
      cache:'no-store',
      signal:AbortSignal.timeout(9000)
    });
    // Diagnose only response metadata; never log credentials, tokens, IPs, URLs, or payloads.
    const upstreamType = (upstream.headers.get('content-type') || '').toLowerCase();
    if (!upstreamType.includes('application/json')) {
      console.warn('[bakerss-website-lead-staging] upstream_non_json', upstream.status);
      return reply(res,502,{error:'Unexpected intake response'});
    }
    let result;
    try { result = await upstream.json(); } catch {
      console.warn('[bakerss-website-lead-staging] upstream_invalid_json', upstream.status);
      return reply(res,502,{error:'Unexpected intake response'});
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) return reply(res,502,{error:'Unexpected intake response'});
    // Return only approved response fields; never surface backend diagnostics.
    const out = { ...(result.received === true ? {received:true} : {}),
      ...(result.duplicate === true ? {duplicate:true} : {}),
      ...(typeof result.reference === 'string' && /^[0-9a-f-]{36}$/i.test(result.reference) ? {reference:result.reference} : {}),
      ...(typeof result.error === 'string' ? {error:result.error.slice(0,160)} : {}) };
    return reply(res,upstream.status,out);
  } catch (err) {
    // Diagnostic classification is allowlisted: never log exception messages,
    // destination URLs, request bodies, headers, IPs, secrets or Turnstile tokens.
    const name = err instanceof Error ? err.name : '';
    const cause = err && typeof err === 'object' ? err.cause : null;
    const rawCode = cause && typeof cause === 'object' && typeof cause.code === 'string' ? cause.code : '';
    const codes = new Set([
      'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
      'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_SOCKET', 'ERR_TLS_CERT_ALTNAME_INVALID',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED'
    ]);
    const code = codes.has(rawCode) ? rawCode : 'UNKNOWN';
    const kind = name === 'TimeoutError' || name === 'AbortError'
      ? 'upstream_timeout' : 'upstream_fetch_failure';
    console.warn('[bakerss-website-lead-staging]', kind, 'cause_code=' + code);
    return reply(res,502,{error:'Request could not be confirmed. Please call Bakerss.'});
  }
}
