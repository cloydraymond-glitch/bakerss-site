
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';

// STAGING BRANCH ONLY. Never deploy to the live main branch.
// A public, fixed endpoint eliminates the opaque WEBSITE_LEADS_OS_URL variable
// and guarantees this proxy cannot accidentally send leads to production OS.
const OS_ENDPOINT = new URL('https://bakerss-os-staging.vercel.app/api/public/website-lead');
const logTag = '[bakerss-website-lead-staging]';
const reply = (res, status, data) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(data);
};
const reject = (res, code, message = 'Website intake unavailable') => {
  console.warn(logTag, 'rejected', code);
  return reply(res, 503, { error: message });
};

function sendToOs(body, origin, secret, ip) {
  return new Promise((resolve, rejectRequest) => {
    let phase = 'connect';
    const req = httpsRequest(OS_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body, 'utf8'),
        'origin': origin,
        'x-bakerss-proxy-secret': secret,
        'x-bakerss-verified-ip': ip
      },
      timeout: 9000,
      agent: false
    }, (response) => {
      phase = 'response';
      let chunks = [];
      let total = 0;
      response.on('data', chunk => {
        total += chunk.length;
        if (total > 65536) {
          response.destroy(Object.assign(new Error('Response too large'), { code: 'RESPONSE_TOO_LARGE' }));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode || 502,
        type: String(response.headers['content-type'] || '').toLowerCase(),
        text: Buffer.concat(chunks).toString('utf8')
      }));
      response.on('error', err => rejectRequest({ err, phase }));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('Timeout'), { code: 'UPSTREAM_TIMEOUT' })));
    req.on('error', err => rejectRequest({ err, phase }));
    req.end(body);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Method not allowed' });
  }
  const origin = req.headers.origin;
  const secret = process.env.WEBSITE_LEADS_PROXY_SECRET;
  const expectedOrigin = process.env.WEBSITE_LEADS_ALLOWED_ORIGIN;
  if (process.env.WEBSITE_LEADS_PROXY_ENABLED !== 'true') return reject(res, 'proxy_disabled');
  if (!origin || !expectedOrigin || origin !== expectedOrigin) return reject(res, 'origin_mismatch');
  if (!secret || secret.length < 32) return reject(res, 'proxy_secret_missing_or_short');
  // Node's HTTPS client rejects line breaks and other control characters in
  // header values before any connection is attempted. Do not print the secret.
  if (/[\x00-\x1F\x7F]/.test(secret)) return reject(res, 'proxy_secret_invalid_header_char');
  if (secret !== secret.trim()) return reject(res, 'proxy_secret_surrounding_whitespace');
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return reply(res, 415, { error: 'JSON required' });
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(body, 'utf8') > 8192) return reply(res, 413, { error: 'Request too large' });
  const ip = String(req.headers['x-vercel-forwarded-for'] || '');
  if (!isIP(ip)) return reject(res, 'invalid_vercel_ingress_ip', 'IP verification unavailable');

  let upstream;
  try {
    upstream = await sendToOs(body, origin, secret, ip);
  } catch (failure) {
    // httpsRequest() can throw synchronously inside the Promise constructor.
    // Such errors reject the Promise as Error directly, not {err,phase}.
    // The old handler labeled every direct exception OTHER_NETWORK_ERROR.
    const err = failure?.err || failure;
    const raw = typeof err?.code === 'string' ? err.code : '';
    const safeCodes = new Set([
      'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH',
      'ENETUNREACH', 'ETIMEDOUT', 'UPSTREAM_TIMEOUT', 'EPROTO',
      'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED', 'RESPONSE_TOO_LARGE', 'ERR_INVALID_CHAR',
      'ERR_HTTP_INVALID_HEADER_VALUE', 'ERR_INVALID_ARG_TYPE',
      'ERR_INVALID_PROTOCOL', 'ERR_INVALID_URL', 'ERR_SSL_WRONG_VERSION_NUMBER'
    ]);
    const code = safeCodes.has(raw) ? raw : 'OTHER_NETWORK_ERROR';
    const phase = failure?.phase === 'response' ? 'response' : 'connect';
    const errorType = err instanceof TypeError ? 'TYPE_ERROR' : err instanceof Error ? 'ERROR' : 'NON_ERROR';
    console.warn(logTag, 'https_request_failure', `phase=${phase}`, `code=${code}`, `type=${errorType}`);
    return reply(res, 502, { error: 'Request could not be confirmed. Please call Bakerss.' });
  }

  if (!upstream.type.includes('application/json')) {
    console.warn(logTag, 'upstream_non_json', `status=${upstream.status}`);
    return reply(res, 502, { error: 'Unexpected intake response' });
  }
  let result;
  try { result = JSON.parse(upstream.text); }
  catch {
    console.warn(logTag, 'upstream_invalid_json', `status=${upstream.status}`);
    return reply(res, 502, { error: 'Unexpected intake response' });
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return reply(res, 502, { error: 'Unexpected intake response' });
  }
  const out = {
    ...(result.received === true ? { received: true } : {}),
    ...(result.duplicate === true ? { duplicate: true } : {}),
    ...(typeof result.reference === 'string' && /^[0-9a-f-]{36}$/i.test(result.reference) ? { reference: result.reference } : {}),
    ...(typeof result.error === 'string' ? { error: result.error.slice(0, 160) } : {})
  };
  console.info(logTag, 'upstream_http', `status=${upstream.status}`, `received=${result.received === true}`);
  return reply(res, upstream.status, out);
}
