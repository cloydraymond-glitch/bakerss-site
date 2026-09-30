-- Bakerss OS
-- Allow authenticated sessions to reach dispatch_assignments.
-- Row Level Security policies continue to control which authenticated
-- users may SELECT/INSERT/UPDATE/DELETE specific rows.

grant select, insert, update, delete
on table public.dispatch_assignments
to authenticated;
