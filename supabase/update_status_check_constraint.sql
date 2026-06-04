-- devices.status の CHECK 制約を新しいステータス値に合わせて更新
-- Supabase Dashboard > SQL Editor で実行してください

-- 既存の制約を削除
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_status_check;

-- 新しいステータス値で制約を再作成
ALTER TABLE devices
  ADD CONSTRAINT devices_status_check
  CHECK (status IN ('active', 'moved', 'disposed', 'unknown', 'repair'));

-- 旧 'inactive' が残っている行も 'disposed' に移行（任意）
UPDATE devices SET status = 'disposed' WHERE status = 'inactive';
