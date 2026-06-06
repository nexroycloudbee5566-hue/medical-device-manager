-- ダッシュボードお知らせ（管理者 → 全スタッフ）
create table if not exists public.dashboard_messages (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text not null,
  author_name text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.dashboard_messages enable row level security;

drop policy if exists "dashboard_messages_select" on public.dashboard_messages;
create policy "dashboard_messages_select" on public.dashboard_messages
  for select to authenticated using (true);

drop policy if exists "dashboard_messages_admin_insert" on public.dashboard_messages;
create policy "dashboard_messages_admin_insert" on public.dashboard_messages
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "dashboard_messages_admin_update" on public.dashboard_messages;
create policy "dashboard_messages_admin_update" on public.dashboard_messages
  for update to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "dashboard_messages_admin_delete" on public.dashboard_messages;
create policy "dashboard_messages_admin_delete" on public.dashboard_messages
  for delete to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

notify pgrst, 'reload schema';
