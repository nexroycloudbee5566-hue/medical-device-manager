-- profile_auth_secrets が無い場合に Supabase SQL Editor で実行してください
-- （schema.sql 実行後でも、このテーブルだけ抜けているとき用）

create table if not exists public.profile_auth_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  login_secret text not null,
  created_at timestamptz default now()
);

alter table public.profile_auth_secrets enable row level security;

notify pgrst, 'reload schema';
