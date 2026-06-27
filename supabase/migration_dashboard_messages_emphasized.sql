-- ダッシュボードお知らせ：強調表示フラグ
alter table public.dashboard_messages
  add column if not exists is_emphasized boolean not null default false;

notify pgrst, 'reload schema';
