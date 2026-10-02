-- pgTAP: tenancy, sign-up automation, and RLS isolation.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(21);

-- ---------------------------------------------------------------------
-- Fixtures: two users in separate workspaces, plus a viewer in A's org
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name":"Alice Adams"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   '{"full_name":"Bob Brown"}',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'vic@example.com',   '{"full_name":"Vic Viewer"}',  'authenticated', 'authenticated');

-- Sign-up trigger
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Alice Adams', 'sign-up creates a profile with the full name');

select is(
  (select count(*)::int from public.organization_members
    where user_id = '00000000-0000-0000-0000-00000000000a' and role = 'owner'),
  1, 'sign-up creates a personal workspace owned by the user');

create temp table ids as
select
  (select org_id from public.organization_members where user_id = '00000000-0000-0000-0000-00000000000a') as org_a,
  (select org_id from public.organization_members where user_id = '00000000-0000-0000-0000-00000000000b') as org_b;
grant select on ids to authenticated;

insert into public.organization_members (org_id, user_id, role)
select org_a, '00000000-0000-0000-0000-00000000000c', 'viewer' from ids;

-- ---------------------------------------------------------------------
-- Alice (owner of org A)
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$ insert into public.projects (id, org_id, name, budget_cents)
     select '10000000-0000-0000-0000-000000000001', org_a, 'Enterprise Data Platform', 37500000 from ids $$,
  'owner can create a project in their org');

select is(
  (select code from public.projects where id = '10000000-0000-0000-0000-000000000001'),
  'P-001', 'first project gets code P-001');

select lives_ok(
  $$ insert into public.projects (id, org_id, name, visibility)
     select '10000000-0000-0000-0000-000000000002', org_a, 'Secret M&A', 'confidential' from ids $$,
  'owner can create a confidential project');

select is(
  (select code from public.projects where id = '10000000-0000-0000-0000-000000000002'),
  'P-002', 'codes are sequential per org');

select throws_ok(
  $$ insert into public.projects (org_id, name) select org_b, 'Intrusion' from ids $$,
  '42501', null, 'cannot create a project in someone else''s org');

-- WBS + dependency rules
insert into public.wbs_nodes (id, project_id, level, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'Enterprise Data Platform');
insert into public.wbs_nodes (id, project_id, parent_id, level, sort_order, name) values
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2, 1, 'Ingestion'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2, 2, 'Warehouse');
insert into public.wbs_nodes (id, project_id, parent_id, level, sort_order, name) values
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 3, 1, 'Salesforce connector'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 3, 1, 'ETL pipeline');

select is(
  (select code from public.wbs_nodes_with_code where id = '20000000-0000-0000-0000-000000000005'),
  '1.2.1', 'WBS codes are derived from tree position');

select throws_ok(
  $$ insert into public.wbs_nodes (project_id, parent_id, level, name)
     values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 3, 'Wrong level') $$,
  'P0001', 'WBS node level must be parent level + 1', 'WBS level must follow the parent');

select lives_ok(
  $$ insert into public.dependencies (project_id, predecessor_id, successor_id)
     values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000005') $$,
  'valid dependency is accepted');

select throws_ok(
  $$ insert into public.dependencies (project_id, predecessor_id, successor_id)
     values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000004') $$,
  'P0001', 'Dependency would create a cycle', 'dependency cycles are rejected');

-- ---------------------------------------------------------------------
-- Bob (different org) sees nothing of Alice's
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*)::int from public.projects), 0, 'other tenants cannot see projects');
select is((select count(*)::int from public.wbs_nodes), 0, 'other tenants cannot see WBS nodes');
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  0, 'other tenants cannot see profiles');

update public.projects set name = 'hacked' where id = '10000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select name from public.projects where id = '10000000-0000-0000-0000-000000000001'),
  'Enterprise Data Platform', 'other tenants cannot update projects');

-- ---------------------------------------------------------------------
-- Vic (viewer in org A): read internal only, no writes
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select is((select count(*)::int from public.projects), 1, 'viewer sees internal projects but not confidential ones');

select throws_ok(
  $$ insert into public.projects (org_id, name) select org_a, 'Viewer project' from ids $$,
  '42501', null, 'viewer cannot create projects');

select throws_ok(
  $$ insert into public.scope_items (project_id, category, text)
     values ('10000000-0000-0000-0000-000000000001', 'risk', 'viewer edit') $$,
  '42501', null, 'viewer cannot add scope items');

-- ---------------------------------------------------------------------
-- Anonymous (public anon key) gets nothing
-- ---------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.projects $$,
  '42501', null, 'anon role cannot read projects');

-- ---------------------------------------------------------------------
-- Last owner protection + audit trail
-- ---------------------------------------------------------------------
reset role;
select throws_ok(
  $$ delete from public.organization_members
     where user_id = '00000000-0000-0000-0000-00000000000a' and org_id = (select org_a from ids) $$,
  'P0001', 'An organization must have at least one owner', 'cannot remove the last owner');

select ok(
  (select count(*) from public.audit_events where table_name = 'projects' and action = 'insert') >= 2,
  'project inserts are written to the audit log');

select * from finish();
rollback;
