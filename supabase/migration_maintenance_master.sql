-- =============================================================================
-- メンテナンスマスタ（メーカー＋型式ごとの定期点検チェック項目）
-- =============================================================================
-- エラー「Could not find the table 'public.maintenance_model_masters'」が出る場合:
--   Supabase Dashboard → SQL Editor でこのファイル全文を貼り付け → Run
-- 実行後、数秒待ってアプリを再読み込みしてください。
-- =============================================================================

create table if not exists public.maintenance_model_masters (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null default '',
  model text not null default '',
  checklist_items jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists maintenance_model_masters_unique_model
  on public.maintenance_model_masters (
    lower(trim(both from coalesce(manufacturer, ''))),
    lower(trim(both from coalesce(model, '')))
  );

-- maintenance_records が既にある場合のみカラム追加（無い環境でもエラーにしない）
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'maintenance_records'
  ) then
    alter table public.maintenance_records
      add column if not exists maintenance_model_master_id uuid references public.maintenance_model_masters(id) on delete set null;
    alter table public.maintenance_records
      add column if not exists checklist_results jsonb;
  end if;
end $$;

alter table public.maintenance_model_masters enable row level security;

drop policy if exists "maintenance_model_masters_all" on public.maintenance_model_masters;
create policy "maintenance_model_masters_all" on public.maintenance_model_masters
  for all to authenticated using (true) with check (true);

-- PostgREST のスキーマキャッシュ更新（API がテーブルを認識するために必要）
notify pgrst, 'reload schema';
