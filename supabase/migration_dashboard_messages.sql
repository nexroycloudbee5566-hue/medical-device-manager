-- ダッシュボードお知らせ（管理者 → 全スタッフ）
-- profiles テーブルが無い場合は先に作成（管理者判定に必要）
create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  hospital_id uuid references public.hospitals(id),
  name text not null default '',
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated using (auth.uid() = id);

create table if not exists public.dashboard_messages (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text not null,
  author_name text not null default '',
  is_emphasized boolean not null default false,
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
