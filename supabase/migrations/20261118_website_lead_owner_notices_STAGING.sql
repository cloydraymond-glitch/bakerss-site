-- Bakerss Phase 10: staging-only durable owner notification queue.
-- Prerequisites: 20261107_sales_crm.sql and 20261115_website_intake_staging.sql
-- Apply ONLY to Bakerss OS STAGING Supabase until independently tested.
-- No modification to technician, jobs, agreements, or client-portal tables.

CREATE TABLE IF NOT EXISTS public.crm_website_notice_outbox (
  opportunity_id uuid NOT NULL REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  recipient_slot smallint NOT NULL CHECK (recipient_slot IN (1,2)),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  provider_message_id text,
  accepted_at timestamptz,
  last_http_status integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, recipient_slot)
);
CREATE INDEX IF NOT EXISTS crm_notice_pending_idx
  ON public.crm_website_notice_outbox (next_attempt_at,created_at)
  WHERE status <> 'sent' AND attempts < 8;
ALTER TABLE public.crm_website_notice_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_website_notice_outbox FROM public,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.crm_website_notice_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.crm_enqueue_website_notices()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.crm_website_notice_outbox (opportunity_id,recipient_slot)
  VALUES (NEW.opportunity_id,1),(NEW.opportunity_id,2)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_enqueue_website_notices() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS crm_website_intake_notice_enqueue ON public.crm_website_intake;
CREATE TRIGGER crm_website_intake_notice_enqueue
AFTER INSERT ON public.crm_website_intake
FOR EACH ROW EXECUTE FUNCTION public.crm_enqueue_website_notices();

-- Atomic lease: only one worker may send a given (lead,recipient) at a time.
CREATE OR REPLACE FUNCTION public.crm_claim_website_notice(p_opportunity_id uuid, p_recipient_slot smallint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_notice public.crm_website_notice_outbox%ROWTYPE; v_lease uuid;
BEGIN
  IF p_recipient_slot NOT IN (1,2) THEN RETURN NULL; END IF;
  SELECT * INTO v_notice FROM public.crm_website_notice_outbox
  WHERE opportunity_id=p_opportunity_id AND recipient_slot=p_recipient_slot
    AND attempts < 8
    AND (
      (status='pending' AND next_attempt_at <= now()) OR
      (status='sending' AND lease_until < now())
    )
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_lease=gen_random_uuid();
  UPDATE public.crm_website_notice_outbox
  SET status='sending', attempts=attempts+1, lease_token=v_lease,
      lease_until=now()+interval '2 minutes', updated_at=now()
  WHERE opportunity_id=p_opportunity_id AND recipient_slot=p_recipient_slot;
  RETURN (
    SELECT jsonb_build_object(
      'opportunity_id',o.id,'recipient_slot',p_recipient_slot,'lease_token',v_lease,
      'customer_name',o.customer_name,'customer_email',o.customer_email,
      'customer_phone',o.customer_phone,'service_address',o.service_address,
      'service_type',o.service_type,'scope',o.scope,'notes',o.notes,
      'created_at',o.created_at
    )
    FROM public.crm_opportunities o WHERE o.id=p_opportunity_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.crm_claim_website_notice(uuid,smallint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_claim_website_notice(uuid,smallint) TO service_role;

-- "Sent" means accepted by the email API, NOT inbox delivery.
CREATE OR REPLACE FUNCTION public.crm_finish_website_notice(
  p_opportunity_id uuid, p_recipient_slot smallint, p_lease_token uuid,
  p_success boolean, p_provider_message_id text DEFAULT NULL, p_http_status integer DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.crm_website_notice_outbox
  SET status=CASE WHEN p_success THEN 'sent' ELSE 'pending' END,
      provider_message_id=CASE WHEN p_success THEN left(coalesce(p_provider_message_id,''),120) ELSE NULL END,
      accepted_at=CASE WHEN p_success THEN now() ELSE NULL END,
      last_http_status=p_http_status,
      next_attempt_at=CASE WHEN p_success THEN next_attempt_at
        ELSE now() + make_interval(mins=>least(60, power(2,least(attempts,6))::integer)) END,
      lease_token=NULL,lease_until=NULL,updated_at=now()
  WHERE opportunity_id=p_opportunity_id AND recipient_slot=p_recipient_slot
    AND lease_token=p_lease_token AND status='sending';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count=1;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_finish_website_notice(uuid,smallint,uuid,boolean,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_finish_website_notice(uuid,smallint,uuid,boolean,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_due_website_notices(p_limit integer DEFAULT 10)
RETURNS TABLE(opportunity_id uuid, recipient_slot smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT n.opportunity_id,n.recipient_slot
  FROM public.crm_website_notice_outbox n
  WHERE n.attempts < 8 AND (
    (n.status='pending' AND n.next_attempt_at<=now()) OR
    (n.status='sending' AND n.lease_until<now())
  )
  ORDER BY n.next_attempt_at,n.created_at
  LIMIT least(greatest(p_limit,1),20);
$$;
REVOKE ALL ON FUNCTION public.crm_due_website_notices(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_due_website_notices(integer) TO service_role;

-- Staging inspection query (run manually):
-- SELECT recipient_slot,status,attempts,last_http_status,accepted_at
-- FROM public.crm_website_notice_outbox ORDER BY created_at DESC LIMIT 12;
