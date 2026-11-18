import { createSupabaseAdmin } from '../supabase/admin';

// Staging-only owner alerts: database receipt is the source of truth.
// Never log submitted customer details or provider keys.
const slots = [1, 2] as const;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Claim = {
  opportunity_id: string;
  recipient_slot: number;
  lease_token: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  service_address: string | null;
  service_type: string;
  scope: string;
  notes: string;
  created_at: string;
};

function recipients(): [string, string] | null {
  const a = (process.env.WEBSITE_LEADS_NOTIFY_EMAIL_1 || '').trim().toLowerCase();
  const b = (process.env.WEBSITE_LEADS_NOTIFY_EMAIL_2 || '').trim().toLowerCase();
  if (!emailPattern.test(a) || !emailPattern.test(b) || a === b) return null;
  return [a, b];
}

function configured() {
  const api = process.env.RESEND_API_KEY || '';
  const from = (process.env.WEBSITE_LEADS_NOTIFY_FROM || '').trim();
  const to = recipients();
  if (process.env.WEBSITE_LEADS_NOTIFY_ENABLED !== 'true' || !api || !emailPattern.test(from) || !to) return null;
  return { api, from, to };
}

async function sendSlot(opportunityId: string, slot: 1 | 2, cfg: NonNullable<ReturnType<typeof configured>>): Promise<void> {
  const db = createSupabaseAdmin();
  const { data: claim, error } = await db.rpc('crm_claim_website_notice', {
    p_opportunity_id: opportunityId, p_recipient_slot: slot,
  });
  if (error) { console.warn('Website notice claim failed', { code: error.code, slot }); return; }
  if (!claim) return; // Already accepted, deferred for retry, or leased by another worker.
  const c = claim as Claim;
  let succeeded = false;
  let providerId: string | null = null;
  let status: number | null = null;
  try {
    const message = [
      'New Bakerss website service inquiry',
      `CRM reference: ${opportunityId}`,
      `Name: ${c.customer_name || ''}`,
      `Phone: ${c.customer_phone || ''}`,
      `Email: ${c.customer_email || ''}`,
      `Service: ${c.service_type || ''}`,
      `Location: ${c.service_address || ''}`,
      '', 'Customer request:', String(c.scope || '').slice(0, 2500),
      '', 'Other intake details:', String(c.notes || '').slice(0, 1000),
      '', 'Sign in to Bakerss OS staging Sales CRM to follow up.',
    ].join('\n');
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.api}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `bakerss-website-lead/${opportunityId}/${slot}`,
      },
      body: JSON.stringify({
        from: cfg.from,
        to: [cfg.to[slot - 1]],
        subject: `Bakerss new website lead — ${String(c.service_type || 'Service').slice(0, 90)}`,
        text: message,
        reply_to: 'info@bakerss.com',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    });
    status = resp.status;
    if (resp.ok) {
      const payload = await resp.json().catch(() => ({})) as { id?: unknown };
      providerId = typeof payload.id === 'string' ? payload.id : null;
      succeeded = !!providerId;
    }
  } catch { console.warn('Website notice request failed', { slot }); }
  const { error: doneError } = await db.rpc('crm_finish_website_notice', {
    p_opportunity_id: opportunityId,
    p_recipient_slot: slot,
    p_lease_token: c.lease_token,
    p_success: succeeded,
    p_provider_message_id: providerId,
    p_http_status: status,
  });
  if (doneError) console.error('Website notice state update failed', { code: doneError.code, slot });
  else console.info('Website notice processed', { slot, accepted: succeeded, status });
}

export async function notifyWebsiteLead(opportunityId: string): Promise<void> {
  const cfg = configured();
  if (!cfg || !/^[0-9a-f-]{36}$/i.test(opportunityId)) {
    if (process.env.WEBSITE_LEADS_NOTIFY_ENABLED === 'true') console.warn('Website notice configuration incomplete');
    return;
  }
  // Independent per-recipient records: one provider failure never masks the other.
  await Promise.allSettled(slots.map(slot => sendSlot(opportunityId, slot, cfg)));
}
