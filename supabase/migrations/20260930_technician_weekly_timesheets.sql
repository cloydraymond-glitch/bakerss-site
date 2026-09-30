-- Read-only personal timesheets. No employee ID can be supplied by the caller.
begin;
create or replace function public.get_my_weekly_timesheet(p_week_start date)
returns table (
  entry_id uuid,
  work_date date,
  clock_in_time timestamptz,
  clock_out_time timestamptz,
  recorded_seconds numeric,
  running_seconds numeric,
  approved boolean,
  entry_status text,
  clock_in_note text,
  clock_out_note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_week_start is null or extract(dow from p_week_start) <> 0 then
    raise exception 'Select a Sunday to start the timesheet week.';
  end if;
  select e.id into v_employee_id
  from public.employees e join public.profiles p on p.id = e.profile_id
  where e.profile_id = auth.uid()
    and lower(coalesce(e.employment_status, 'active')) = 'active'
    and lower(coalesce(p.role, '')) in ('employee', 'technician', 'staff', 'admin', 'manager')
  limit 1;
  if v_employee_id is null then
    raise exception 'Your login is not connected to an authorized active employee record.';
  end if;
  v_start := p_week_start::timestamp at time zone 'America/New_York';
  v_end := (p_week_start + 7)::timestamp at time zone 'America/New_York';
  return query
  with days as (
    select p_week_start + n as day from generate_series(0, 6) as n
  ), bounds as (
    select day,
      day::timestamp at time zone 'America/New_York' as day_start,
      (day + 1)::timestamp at time zone 'America/New_York' as day_end
    from days
  )
  select t.id, b.day, t.clock_in_time, t.clock_out_time,
    case when t.clock_out_time is not null then
      greatest(0::numeric, extract(epoch from
        least(t.clock_out_time, b.day_end) - greatest(t.clock_in_time, b.day_start)))
      else 0::numeric end,
    case when t.clock_out_time is null then
      greatest(0::numeric, extract(epoch from
        least(now(), b.day_end) - greatest(t.clock_in_time, b.day_start)))
      else 0::numeric end,
    t.approved_at is not null, t.status::text, t.clock_in_note, t.clock_out_note
  from public.employee_timeclock t
  join bounds b on t.clock_in_time < b.day_end
    and coalesce(t.clock_out_time, now()) > b.day_start
  where t.employee_id = v_employee_id and t.entry_type = 'shift'
    and t.clock_in_time < v_end
    and coalesce(t.clock_out_time, now()) > v_start
  order by b.day, t.clock_in_time, t.id;
end;
$$;
revoke all on function public.get_my_weekly_timesheet(date) from public, anon;
grant execute on function public.get_my_weekly_timesheet(date) to authenticated;
commit;
