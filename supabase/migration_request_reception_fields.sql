-- 依頼: 依頼機器テキスト・受付CE名 / ログ: ステップ対応者の記名
alter table requests
  add column if not exists requested_equipment text,
  add column if not exists reception_ce_name text;

alter table request_logs
  add column if not exists notes text,
  add column if not exists handled_by_name text;

notify pgrst, 'reload schema';
