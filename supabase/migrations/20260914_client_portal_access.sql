-- Bakerss OS client portal access support.
-- Keeps existing staff roles and adds the client role required by /portal.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'technician', 'employee', 'staff', 'client', 'disabled'));

-- The portal code expects these estimate conversion fields.
alter table public.estimate_requests
  add column if not exists converted_job_id uuid,
  add column if not exists converted_at timestamp with time zone;

-- Add the FK only when it does not already exist.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimate_requests_converted_job_id_fkey'
      and conrelid = 'public.estimate_requests'::regclass
  ) then
    alter table public.estimate_requests
      add constraint estimate_requests_converted_job_id_fkey
      foreign key (converted_job_id)
      references public.jobs(id)
      on delete set null;
  end if;
end $$;
