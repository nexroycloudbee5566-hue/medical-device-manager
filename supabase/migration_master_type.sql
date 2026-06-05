-- 定期点検マスタ / 日常点検マスタの分離
-- メーカー+型式は master_type ごとに1件まで

alter table public.maintenance_model_masters
  add column if not exists master_type text not null default 'periodic';

alter table public.maintenance_model_masters
  drop constraint if exists maintenance_model_masters_master_type_check;

alter table public.maintenance_model_masters
  add constraint maintenance_model_masters_master_type_check
  check (master_type in ('periodic', 'daily'));

drop index if exists public.maintenance_model_masters_unique_model;

create unique index if not exists maintenance_model_masters_unique_model_type
  on public.maintenance_model_masters (
    lower(trim(both from coalesce(manufacturer, ''))),
    lower(trim(both from coalesce(model, ''))),
    master_type
  );

alter table public.maintenance_checklist_templates
  add column if not exists master_type text not null default 'periodic';

alter table public.maintenance_checklist_templates
  drop constraint if exists maintenance_checklist_templates_master_type_check;

alter table public.maintenance_checklist_templates
  add constraint maintenance_checklist_templates_master_type_check
  check (master_type in ('periodic', 'daily'));

drop index if exists public.maintenance_checklist_templates_unique_name;

create unique index if not exists maintenance_checklist_templates_unique_name_type
  on public.maintenance_checklist_templates (
    lower(trim(both from coalesce(name, ''))),
    master_type
  );

notify pgrst, 'reload schema';
