-- 依頼に見積金額（見積受取時に入力）
alter table requests
  add column if not exists estimate_amount numeric(14, 2);

notify pgrst, 'reload schema';
