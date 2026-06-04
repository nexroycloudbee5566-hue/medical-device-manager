-- 機器台帳をExcelフォーマット（温泉HP機器台帳）に揃える拡張カラム
alter table devices add column if not exists equipment_category text;
alter table devices add column if not exists specific_maintenance text;
alter table devices add column if not exists management_category text;
alter table devices add column if not exists manufacture_year_month text;
alter table devices add column if not exists dealer text;
alter table devices add column if not exists maintenance_contract text;
alter table devices add column if not exists ownership_type text;
alter table devices add column if not exists inventory_confirmation text;

notify pgrst, 'reload schema';
