-- Bakerss OS employee login / RBAC support.
-- The production app already uses public.profiles(id, full_name, email, role)
-- and public.employees.profile_id. This migration keeps the employee/profile
-- relationship fast and prevents accidentally linking one login to two employees.

create unique index if not exists employees_profile_id_unique
  on public.employees(profile_id)
  where profile_id is not null;

create index if not exists profiles_role_idx
  on public.profiles(role);
