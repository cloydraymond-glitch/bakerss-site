-- Bakerss OS service-specific job photo requirements.
-- Lawn Care uses front / left side / rear / right side positions for both
-- before and completion photos. Other services can continue storing an
-- unlimited number of general before / progress / completion photos.

alter table public.job_photos
  add column if not exists photo_position text;

-- Keep the allowed values predictable while still permitting NULL for
-- general-service photos and existing historical records.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_photos_photo_position_check'
      and conrelid = 'public.job_photos'::regclass
  ) then
    alter table public.job_photos
      add constraint job_photos_photo_position_check
      check (
        photo_position is null
        or photo_position in ('front', 'left_side', 'rear', 'right_side')
      );
  end if;
end $$;

create index if not exists job_photos_job_type_position_idx
  on public.job_photos (job_id, photo_type, photo_position);
