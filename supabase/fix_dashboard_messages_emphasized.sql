-- 強調機能: is_emphasized 列の追加と API キャッシュ更新
-- dashboard_messages テーブルが既にある場合はこの 2 行だけ実行してください。

alter table public.dashboard_messages
  add column if not exists is_emphasized boolean not null default false;

notify pgrst, 'reload schema';
