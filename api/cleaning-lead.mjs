import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

const DATASET = '2505195356625462';
const PAGE = 'https://www.bakerss.com/cleaning-quote/';
const services = new Set(['Recurring cleaning', 'Deep cleaning', 'Move-in / move-out', 'Vacation rental turnover', 'Office / business cleaning', 'Apartment / HOA common areas', 'Other cleaning']);
const hash = value => createHash('sha256').update(value).digest('hex');
const string = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const header = (req, key) => string(req.headers[key], 1000);
const reply = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(body);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, {success:false}); }
  const allowed = new Set(['https://www.bakerss.com', 'https://bakerss.com']);
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) if (host) allowed.add(`https://${host}`);
  if (process.env.NODE_ENV !== 'production') allowed.add('http://localhost:4173');
  if (!allowed.has(header(req, 'origin'))) return reply(res, 403, {success:false});
  if (!header(req, 'content-type').startsWith('application/json')) return reply(res, 415, {success:false});
  let body;
  try {
    if (Number(req.headers['content-length']) > 12000) return reply(res, 413, {success:false});
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 12000) return reply(res, 400, {success:false});
  } catch { return reply(res, 400, {success:false}); }
  if (body.website) return reply(res, 400, {success:false});
  const name = string(body.name, 100), email = string(body.email, 254).toLowerCase();
  let phone = string(body.phone, 40).replace(/\D/g, '');
  if (phone.length === 10) phone = `1${phone}`;
  const zip = string(body.zip, 5), type = string(body.type, 30), service = string(body.service, 80);
  if (name.length < 2 || !/^1[2-9]\d{2}[2-9]\d{6}$/.test(phone) || !/^\d{5}$/.test(zip) || !['residential','commercial'].includes(type) || !services.has(service) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return reply(res, 400, {success:false, message:'Please check your name, US phone number, ZIP code and cleaning selections.'});
  }
  const eventId = randomUUID();
  const fields = {
    name, phone, ...(email ? {email} : {}), 'ZIP code':zip,
    'Cleaning type':type, 'Service needed':service,
    'Property / timing details':string(body.details, 1500) || 'Not provided',
    'Campaign source':string(body.utm_source, 100), 'Campaign medium':string(body.utm_medium, 100),
    'Campaign name':string(body.utm_campaign, 100), 'Ad content':string(body.utm_content, 100),
    'Request reference':eventId, 'Ad measurement permission':body.measurement === true ? 'Yes' : 'No',
    _subject:`Bakerss cleaning quote: ${type} / ${zip}`, _template:'table', _captcha:'false',
    _url:PAGE, ...(email ? {_replyto:email} : {})
  };
  const emailDiagnostic = { stage:'connecting' };
  try {
    const response = await fetch('https://formsubmit.co/ajax/info@bakerss.com', {
      method:'POST', headers:{'Content-Type':'application/json', Accept:'application/json', Referer:PAGE},
      body:JSON.stringify(fields), signal:AbortSignal.timeout(12000)
    });
    emailDiagnostic.status = response.status;
    emailDiagnostic.contentType = (response.headers.get('content-type') || '').split(';')[0];
    emailDiagnostic.stage = 'reading_response';
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch {
      emailDiagnostic.stage = 'non_json_response';
      emailDiagnostic.reason = /cloudflare|access denied|forbidden|challenge|captcha/i.test(text) ? 'provider_block_or_challenge' : 'unexpected_response_format';
      throw new Error('non_json');
    }
    if (!response.ok || !(result.success === true || result.success === 'true')) {
      emailDiagnostic.stage = 'provider_rejected';
      // Classify the provider message; never log its raw body or customer fields.
      const message = typeof result.message === 'string' ? result.message : JSON.stringify(result.message || '');
      emailDiagnostic.reason = /activat|confirm.*email|verif/i.test(message) ? 'activation_required' :
        /referer|referrer|origin|domain|website/i.test(message) ? 'website_origin_requirement' :
        /captcha|bot|spam|block|forbidden/i.test(message) ? 'provider_block_or_challenge' :
        /email.*invalid|invalid.*email/i.test(message) ? 'invalid_email' :
        /limit|too many/i.test(message) ? 'provider_rate_limit' : 'provider_rejection_other';
      throw new Error('not_accepted');
    }
  } catch (error) {
    if (emailDiagnostic.stage === 'connecting') {
      emailDiagnostic.reason = error.name === 'TimeoutError' ? 'upstream_timeout' : 'upstream_connection_failed';
      const code = error.cause?.code;
      if (typeof code === 'string' && /^[A-Z0-9_]{1,60}$/.test(code)) emailDiagnostic.transportCode = code;
    }
    console.error('cleaning_email_not_confirmed', {eventId, ...emailDiagnostic});
    return reply(res, 502, {success:false, message:'We could not confirm your request. Please call 843-467-7136 so we can help.'});
  }
  // Email acceptance is independent of advertising measurement; never lose a lead because Meta fails.
  if (body.measurement === true && process.env.META_CAPI_ACCESS_TOKEN) {
    const user = {ph:[hash(phone)], zp:[hash(zip)], country:[hash('us')]};
    if (email) user.em = [hash(email)];
    const ip = header(req, 'x-vercel-forwarded-for').split(',')[0].trim() || header(req, 'x-forwarded-for').split(',')[0].trim();
    if (isIP(ip)) user.client_ip_address = ip;
    const ua = header(req, 'user-agent'); if (ua) user.client_user_agent = ua;
    for (const key of ['fbp','fbc']) {
      const value = string(body[key], 512);
      if (/^fb\.\d+\.\d+\.[A-Za-z0-9_-]+$/.test(value)) user[key] = value;
    }
    const payload = {data:[{event_name:'Lead', event_time:Math.floor(Date.now()/1000), event_id:eventId, action_source:'website', event_source_url:PAGE, user_data:user, custom_data:{content_name:'Cleaning quote', content_category:type}}]};
    if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;
    const configuredVersion = process.env.META_GRAPH_API_VERSION || 'v25.0';
    const version = /^v\d+\.0$/.test(configuredVersion) ? configuredVersion : 'v25.0';
    for (let attempt=0; attempt<2; attempt++) {
      try {
        const result = await fetch(`https://graph.facebook.com/${version}/${DATASET}/events`, {
          method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${process.env.META_CAPI_ACCESS_TOKEN}`},
          body:JSON.stringify(payload), signal:AbortSignal.timeout(3000)
        });
        const data = await result.json();
        if (result.ok && data.events_received >= 1) break;
        const retry = result.status === 429 || result.status >= 500;
        if (!retry || attempt === 1) { console.error('cleaning_meta_not_confirmed', {eventId, status:result.status, code:data.error?.code}); break; }
      } catch { if (attempt === 1) console.error('cleaning_meta_timeout', {eventId}); }
    }
  } else if (body.measurement === true) console.error('cleaning_meta_token_missing', {eventId});
  return reply(res, 200, {success:true, event_id:eventId});
}
