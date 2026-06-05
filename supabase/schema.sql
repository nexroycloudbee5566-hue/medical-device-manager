-- =====================================================
-- 医療機器管理システム データベーススキーマ
-- Supabase (PostgreSQL) 用
-- =====================================================

-- 病院・拠点テーブル
create table if not exists hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- プロフィール（auth.users を拡張）
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  hospital_id uuid references hospitals(id),
  name text not null default '',
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- PIN認証用の内部シークレット（サービスロールのみ参照可能）
create table if not exists profile_auth_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  login_secret text not null,
  created_at timestamptz default now()
);

-- 機器台帳
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid references hospitals(id),
  barcode text unique,
  name text not null,
  model text,
  manufacturer text,
  serial_number text,
  location text,
  department text,
  purchase_date date,
  status text not null default 'active' check (status in ('active', 'moved', 'disposed', 'unknown', 'repair')),
  next_maintenance_due date,
  notes text,
  equipment_category text,
  specific_maintenance text,
  management_category text,
  manufacture_year_month text,
  dealer text,
  maintenance_contract text,
  ownership_type text,
  inventory_confirmation text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 依頼管理（修理・購入）
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('repair', 'purchase')),
  status text not null default '依頼受付',
  hospital_id uuid references hospitals(id),
  device_id uuid references devices(id),
  requester_name text not null,
  requester_dept text,
  description text not null,
  notes text,
  estimate_amount numeric(14, 2),
  requested_equipment text,
  reception_ce_name text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 依頼ステータス変更ログ
create table if not exists request_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users(id),
  notes text,
  handled_by_name text,
  created_at timestamptz default now()
);

-- メンテナンスマスタ（メーカー＋型式ごとの点検チェック項目）
create table if not exists maintenance_model_masters (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null default '',
  model text not null default '',
  checklist_items jsonb not null default '[]'::jsonb,
  maintenance_method text,
  inspection_interval_months integer not null default 12,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint maintenance_model_masters_interval_check
    check (inspection_interval_months >= 1 and inspection_interval_months <= 120)
);

create unique index if not exists maintenance_model_masters_unique_model
  on maintenance_model_masters (
    lower(trim(both from coalesce(manufacturer, ''))),
    lower(trim(both from coalesce(model, '')))
  );

-- 一括テンプレート（マスタ名＋点検項目）
create table if not exists maintenance_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  checklist_items jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists maintenance_checklist_templates_unique_name
  on maintenance_checklist_templates (lower(trim(both from coalesce(name, ''))));

-- メンテナンス記録
create table if not exists maintenance_records (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references devices(id) on delete cascade,
  type text not null,
  scheduled_date date,
  completed_date date,
  result text,
  notes text,
  created_by uuid references auth.users(id),
  maintenance_model_master_id uuid references maintenance_model_masters(id) on delete set null,
  checklist_results jsonb,
  created_at timestamptz default now()
);

-- =====================================================
-- Row Level Security (RLS) ポリシー
-- =====================================================

alter table hospitals enable row level security;
alter table profiles enable row level security;
alter table profile_auth_secrets enable row level security;
alter table devices enable row level security;
alter table requests enable row level security;
alter table request_logs enable row level security;
alter table maintenance_records enable row level security;
alter table maintenance_model_masters enable row level security;
alter table maintenance_checklist_templates enable row level security;

-- hospitals: 認証済みユーザーは全件参照可能
create policy "hospitals_select" on hospitals for select to authenticated using (true);

-- profiles: 自分のプロフィールは全操作可能、他は参照のみ
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_insert" on profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update" on profiles for update to authenticated using (auth.uid() = id);

-- admin によるプロフィール操作
create policy "profiles_admin_update" on profiles for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "profiles_admin_insert" on profiles for insert to authenticated
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- devices: 認証済みユーザーは全操作可能
create policy "devices_all" on devices for all to authenticated using (true) with check (true);

-- requests: 認証済みユーザーは全操作可能
create policy "requests_all" on requests for all to authenticated using (true) with check (true);

-- request_logs: 認証済みユーザーは全操作可能
create policy "request_logs_all" on request_logs for all to authenticated using (true) with check (true);

-- maintenance_records: 認証済みユーザーは全操作可能
create policy "maintenance_records_all" on maintenance_records for all to authenticated using (true) with check (true);

-- maintenance_model_masters: 認証済みユーザーは全操作可能
create policy "maintenance_model_masters_all" on maintenance_model_masters for all to authenticated using (true) with check (true);

-- maintenance_checklist_templates: 認証済みユーザーは全操作可能
create policy "maintenance_checklist_templates_all" on maintenance_checklist_templates for all to authenticated using (true) with check (true);

-- =====================================================
-- Realtime 有効化
-- =====================================================
alter publication supabase_realtime add table requests;
alter publication supabase_realtime add table request_logs;

-- =====================================================
-- 新規ユーザー登録時に自動でプロフィール作成するトリガー
-- =====================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    case
      when (new.raw_user_meta_data->>'role') in ('admin', 'staff') then new.raw_user_meta_data->>'role'
      else 'staff'
    end
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- =====================================================
-- サンプルデータ（初期設定用）
-- =====================================================
insert into hospitals (name) values
  ('本院'),
  ('第一分院'),
  ('第二分院')
on conflict do nothing;

notify pgrst, 'reload schema';
