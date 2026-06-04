-- 型式マスタに点検期間（月数）を追加
-- Supabase Dashboard → SQL Editor で実行

alter table public.maintenance_model_masters
  add column if not exists inspection_interval_months integer not null default 12;

alter table public.maintenance_model_masters
  drop constraint if exists maintenance_model_masters_interval_check;

alter table public.maintenance_model_masters
  add constraint maintenance_model_masters_interval_check
  check (inspection_interval_months >= 1 and inspection_interval_months <= 120);

notify pgrst, 'reload schema';
