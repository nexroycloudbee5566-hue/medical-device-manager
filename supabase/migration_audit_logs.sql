-- ログイン履歴・操作ログ（管理者閲覧用）

create table if not exists public.login_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  role text check (role is null or role in ('admin', 'staff')),
  success boolean not null default false,
  failure_reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null default '',
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists login_history_created_at_idx on public.login_history (created_at desc);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

alter table public.login_history enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "login_history_admin_select" on public.login_history;
create policy "login_history_admin_select" on public.login_history
  for select to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_admin_select" on public.audit_logs
  for select to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

notify pgrst, 'reload schema';
