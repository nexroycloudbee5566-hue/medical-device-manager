-- PINログイン対応（既に schema.sql を実行済みのプロジェクト向け）
-- Supabase SQL Editor で実行してください

create table if not exists public.profile_auth_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  login_secret text not null,
  created_at timestamptz default now()
);

alter table public.profile_auth_secrets enable row level security;

-- API（PostgREST）のスキーマキャッシュを即時更新
-- 「Could not find the table ... in the schema cache」が出たときにも有効です
notify pgrst, 'reload schema';

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
