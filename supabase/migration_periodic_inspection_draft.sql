-- 定期点検の一時保存（下書き）
alter table public.maintenance_records
  add column if not exists is_draft boolean not null default false;

create index if not exists maintenance_records_periodic_draft_idx
  on public.maintenance_records (device_id)
  where is_draft = true and type = '定期点検';

-- 機器あたり定期点検の一時保存は1件まで（任意・既存重複がある場合は先に整理）
-- create unique index if not exists maintenance_records_one_periodic_draft_per_device
--   on public.maintenance_records (device_id)
--   where is_draft = true and type = '定期点検';

notify pgrst, 'reload schema';