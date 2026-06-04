-- 一括テンプレート（マスタ名＋点検項目。型式マスタ作成時に適用）
-- Supabase Dashboard → SQL Editor で実行

create table if not exists public.maintenance_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  checklist_items jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists maintenance_checklist_templates_unique_name
  on public.maintenance_checklist_templates (lower(trim(both from coalesce(name, ''))));

alter table public.maintenance_checklist_templates enable row level security;

drop policy if exists "maintenance_checklist_templates_all" on public.maintenance_checklist_templates;
create policy "maintenance_checklist_templates_all" on public.maintenance_checklist_templates
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
