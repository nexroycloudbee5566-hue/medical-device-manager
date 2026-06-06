-- スタッフ → 管理者 メッセージ受信箱
create table if not exists public.admin_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  sender_name text not null,
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz default now()
);

alter table public.admin_inbox_messages enable row level security;

drop policy if exists "admin_inbox_insert" on public.admin_inbox_messages;
create policy "admin_inbox_insert" on public.admin_inbox_messages
  for insert to authenticated with check (true);

drop policy if exists "admin_inbox_admin_select" on public.admin_inbox_messages;
create policy "admin_inbox_admin_select" on public.admin_inbox_messages
  for select to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "admin_inbox_admin_update" on public.admin_inbox_messages;
create policy "admin_inbox_admin_update" on public.admin_inbox_messages
  for update to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "admin_inbox_admin_delete" on public.admin_inbox_messages;
create policy "admin_inbox_admin_delete" on public.admin_inbox_messages
  for delete to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

notify pgrst, 'reload schema';
