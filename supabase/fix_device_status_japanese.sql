-- 機器ステータスが日本語で保存されている場合に英語キーへ正規化するマイグレーション
-- Supabase SQL Editor で「Run」ボタンをクリックして実行してください

DO $$
BEGIN
  UPDATE public.devices SET status = 'active'   WHERE status = '利用中';
  UPDATE public.devices SET status = 'moved'    WHERE status = '移動';
  UPDATE public.devices SET status = 'disposed' WHERE status = '廃棄';
  UPDATE public.devices SET status = 'disposed' WHERE status = '破棄';
  UPDATE public.devices SET status = 'disposed' WHERE status = 'inactive';
  UPDATE public.devices SET status = 'unknown'  WHERE status = '不明';
  UPDATE public.devices SET status = 'repair'   WHERE status = '修理中';
END $$;
