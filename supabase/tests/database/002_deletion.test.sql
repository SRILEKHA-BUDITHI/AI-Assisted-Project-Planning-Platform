-- pgTAP: deleting organizations and user accounts cleans up correctly.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(5);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000d1', 'solo@example.com',  '{"full_name":"Solo User"}',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d2', 'team@example.com',  '{"full_name":"Team Lead"}',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d3', 'mate@example.com',  '{"full_name":"Team Mate"}',  'authenticated', 'authenticated');

create temp table t as
select
  (select org_id from public.organization_members where user_id = '00000000-0000-0000-0000-0000000000d1') as solo_org,
  (select org_id from public.organization_members where user_id = '00000000-0000-0000-0000-0000000000d2') as team_org;

insert into public.projects (org_id, name, created_by)
select solo_org, 'Solo project', '00000000-0000-0000-0000-0000000000d1' from t;
insert into public.projects (org_id, name, created_by)
select team_org, 'Team project', '00000000-0000-0000-0000-0000000000d2' from t;

-- Team mate joins the team workspace and becomes a second owner
insert into public.organization_members (org_id, user_id, role)
select team_org, '00000000-0000-0000-0000-0000000000d3', 'owner' from t;

-- Regression: deleting an org with audited projects used to fail on the audit FK
select lives_ok(
  $$ delete from public.organizations where id = (select solo_org from t) $$,
  'an organization with projects can be deleted');

select is(
  (select count(*)::int from public.projects where org_id = (select solo_org from t)),
  0, 'deleting an organization removes its projects');

-- Deleting a user removes workspaces where they were the only member...
insert into public.organizations (name, slug, created_by)
values ('Second solo', 'second-solo-ws', '00000000-0000-0000-0000-0000000000d1');

select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1' $$,
  'a user who solely owns workspaces can delete their account');

select is(
  (select count(*)::int from public.organizations where slug = 'second-solo-ws'),
  0, 'sole-member workspaces are removed with the account');

-- ...but keeps shared workspaces that still have other members
delete from auth.users where id = '00000000-0000-0000-0000-0000000000d2';
select is(
  (select count(*)::int from public.projects where org_id = (select team_org from t)),
  1, 'shared workspaces and their projects survive when one member leaves');

select * from finish();
rollback;
