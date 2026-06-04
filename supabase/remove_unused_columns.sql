-- Excel「榊原温泉病院　医療機器台帳　完成版」にない項目を devices テーブルから削除
-- Supabase Dashboard > SQL Editor で実行してください
-- ※ 削除前にデータのバックアップを推奨します

ALTER TABLE devices
  DROP COLUMN IF EXISTS department,
  DROP COLUMN IF EXISTS maintenance_contract,
  DROP COLUMN IF EXISTS ownership_type,
  DROP COLUMN IF EXISTS inventory_confirmation;

-- next_maintenance_due は定期点検スケジュールシステムが内部で使うため残します
