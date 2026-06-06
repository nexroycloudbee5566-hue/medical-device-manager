-- 修理依頼: メーカー修理 / 自施設修理の分岐と自施設修理用フィールド
alter table public.requests
  add column if not exists repair_route text not null default 'manufacturer',
  add column if not exists reception_assessment text,
  add column if not exists repair_content text,
  add column if not exists replacement_parts text;

alter table public.requests
  drop constraint if exists requests_repair_route_check;

alter table public.requests
  add constraint requests_repair_route_check
  check (repair_route in ('manufacturer', 'in_house'));

alter table public.requests
  drop constraint if exists requests_reception_assessment_check;

alter table public.requests
  add constraint requests_reception_assessment_check
  check (
    reception_assessment is null
    or reception_assessment in ('normal', 'repair', 'dispose')
  );

notify pgrst, 'reload schema';
