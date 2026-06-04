-- devices → hospitals の外部キー（PostgREST のリレーション用・任意）
-- 「Could not find a relationship between devices and hospitals」が出る場合に実行

create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table public.devices
  add column if not exists hospital_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'devices_hospital_id_fkey'
  ) then
    alter table public.devices
      add constraint devices_hospital_id_fkey
      foreign key (hospital_id) references public.hospitals(id);
  end if;
end $$;

notify pgrst, 'reload schema';
