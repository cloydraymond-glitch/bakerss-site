-- Bakerss OS technician-created work orders.
-- Keeps pricing/admin controls server-side while allowing active field staff
-- to document work discovered on a property.

create or replace function public.get_field_work_order_options()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_role text;
  v_result jsonb;
begin
  select e.id, lower(coalesce(p.role, ''))
    into v_employee_id, v_role
  from public.employees e
  join public.profiles p on p.id = e.profile_id
  where e.profile_id = auth.uid()
    and lower(coalesce(e.employment_status, 'active')) = 'active'
  limit 1;

  if v_employee_id is null then
    raise exception 'Your login is not connected to an active employee record.';
  end if;

  if v_role not in ('technician', 'employee', 'staff', 'admin', 'manager') then
    raise exception 'Your account is not authorized to create field work orders.';
  end if;

  select jsonb_build_object(
    'properties', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pr.id,
          'client_id', pr.client_id,
          'client_name', c.client_name,
          'property_name', pr.property_name,
          'street_address', pr.street_address,
          'city', pr.city,
          'state', pr.state,
          'zip_code', pr.zip_code
        )
        order by coalesce(pr.property_name, pr.street_address, '')
      )
      from public.properties pr
      left join public.clients c on c.id = pr.client_id
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'service_name', s.service_name,
          'default_duration_minutes', s.default_duration_minutes
        )
        order by s.service_name
      )
      from public.services s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.field_create_work_order(
  p_property_id uuid,
  p_service_id uuid default null,
  p_job_title text default null,
  p_location_detail text default null,
  p_description text default null,
  p_priority text default 'normal',
  p_assign_to_me boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_employee_name text;
  v_role text;
  v_client_id uuid;
  v_duration integer;
  v_job_id uuid;
  v_description text;
  v_priority text;
begin
  select e.id, e.full_name, lower(coalesce(p.role, ''))
    into v_employee_id, v_employee_name, v_role
  from public.employees e
  join public.profiles p on p.id = e.profile_id
  where e.profile_id = auth.uid()
    and lower(coalesce(e.employment_status, 'active')) = 'active'
  limit 1;

  if v_employee_id is null then
    raise exception 'Your login is not connected to an active employee record.';
  end if;

  if v_role not in ('technician', 'employee', 'staff', 'admin', 'manager') then
    raise exception 'Your account is not authorized to create field work orders.';
  end if;

  if nullif(trim(coalesce(p_job_title, '')), '') is null then
    raise exception 'A work-order title is required.';
  end if;

  select pr.client_id
    into v_client_id
  from public.properties pr
  where pr.id = p_property_id;

  if not found then
    raise exception 'The selected property was not found.';
  end if;

  if v_client_id is null then
    raise exception 'The selected property is not connected to a customer.';
  end if;

  if p_service_id is not null then
    select s.default_duration_minutes
      into v_duration
    from public.services s
    where s.id = p_service_id;

    if not found then
      raise exception 'The selected service was not found.';
    end if;
  end if;

  v_priority := lower(coalesce(p_priority, 'normal'));
  if v_priority not in ('normal', 'high', 'urgent') then
    v_priority := 'normal';
  end if;

  v_description := nullif(trim(coalesce(p_description, '')), '');
  if nullif(trim(coalesce(p_location_detail, '')), '') is not null then
    v_description := concat(
      'Unit / Location: ', trim(p_location_detail),
      case when v_description is not null then E'\n\n' || v_description else '' end
    );
  end if;

  insert into public.jobs (
    job_title,
    client_id,
    property_id,
    service_id,
    assigned_employee_id,
    job_status,
    priority,
    scheduled_start,
    estimated_price,
    estimated_duration_minutes,
    description
  ) values (
    trim(p_job_title),
    v_client_id,
    p_property_id,
    p_service_id,
    case when p_assign_to_me then v_employee_id else null end,
    'new',
    v_priority,
    null,
    null,
    v_duration,
    v_description
  )
  returning id into v_job_id;

  insert into public.activity_log (
    actor_profile_id,
    action,
    activity_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    auth.uid(),
    'technician_field_work_order_created',
    'work_order_created',
    'job',
    v_job_id,
    jsonb_build_object(
      'message', concat('Field-created by ', coalesce(v_employee_name, 'technician'), '.'),
      'created_in_field', true,
      'employee_id', v_employee_id,
      'employee_name', v_employee_name,
      'location_detail', nullif(trim(coalesce(p_location_detail, '')), ''),
      'assigned_to_creator', p_assign_to_me
    )
  );

  return v_job_id;
end;
$$;

revoke all on function public.get_field_work_order_options() from public;
revoke all on function public.field_create_work_order(uuid, uuid, text, text, text, text, boolean) from public;

grant execute on function public.get_field_work_order_options() to authenticated;
grant execute on function public.field_create_work_order(uuid, uuid, text, text, text, text, boolean) to authenticated;
