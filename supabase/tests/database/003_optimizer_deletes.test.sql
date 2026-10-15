-- pgTAP: optimizer output never blocks deleting employees, orgs or accounts.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(3);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('00000000-0000-0000-0000-0000000000e1', 'planner@example.com', '{"full_name":"Plan Owner"}', 'authenticated', 'authenticated');

create temp table t as
select (select org_id from public.organization_members where user_id = '00000000-0000-0000-0000-0000000000e1') as org;

insert into public.projects (id, org_id, name, created_by)
select '30000000-0000-0000-0000-000000000001', org, 'Planned', '00000000-0000-0000-0000-0000000000e1' from t;
insert into public.employees (id, org_id, full_name)
select '40000000-0000-0000-0000-000000000001'::uuid, org, 'Assigned Person' from t
union all
select '40000000-0000-0000-0000-000000000002'::uuid, org, 'Other Person' from t;
insert into public.wbs_nodes (id, project_id, level, name) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, 'Root');
insert into public.wbs_nodes (id, project_id, parent_id, level, name, duration_days) values
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 2, 'Task', 5);
insert into public.optimization_runs (id, project_id, status) values
  ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'optimal');
insert into public.planned_assignments (run_id, wbs_node_id, employee_id, start_week, end_week, hours_per_week) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 0, 1, 40),
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 0, 1, 40);

select lives_ok(
  $$ delete from public.employees where id = '40000000-0000-0000-0000-000000000001' $$,
  'an employee who appears in an optimizer plan can be deleted');

select is(
  (select count(*)::int from public.planned_assignments where run_id = '60000000-0000-0000-0000-000000000001'),
  1, 'only that employee''s assignments are removed');

select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'an account whose workspace has optimizer runs can be deleted');

select * from finish();
rollback;
