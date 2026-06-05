-- 型式マスタにメンテナンス方法（手順・注意事項など）を追加
-- Supabase Dashboard → SQL Editor で実行

alter table public.maintenance_model_masters
  add column if not exists maintenance_method text;

notify pgrst, 'reload schema';
