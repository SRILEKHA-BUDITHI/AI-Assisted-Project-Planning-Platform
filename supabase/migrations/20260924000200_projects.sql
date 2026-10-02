-- =====================================================================
-- Projects + project access helpers.
--
-- Access rules
--   read  : org member, and for confidential projects only owner/admin,
--           the project PM, or the creator
--   write : org role owner/admin/pm/member (not viewer) who can read it
--   delete: org owner/admin or the creator
-- =====================================================================

create type public.project_type as enum
  ('technology', 'construction', 'product_development', 'business_process', 'compliance');
create type public.project_priority as enum ('high', 'medium', 'low');
create type public.project_methodology as enum ('waterfall', 'agile', 'hybrid', 'kanban');
create type public.project_visibility as enum ('internal', 'client_facing', 'confidential');
create type public.project_status as enum
  ('draft', 'planning', 'on_track', 'at_risk', 'delayed', 'completed', 'archived');
create type public.project_step as enum
  ('create', 'intake', 'scope', 'wbs', 'constraints', 'optimize', 'done');

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  code             text not null,                                   -- "P-001", assigned by trigger
  name             text not null check (char_length(name) between 1 and 200),
  description      text check (char_length(description) <= 5000),
  type             public.project_type not null default 'technology',
  department       text check (char_length(department) <= 120),
  sponsor          text check (char_length(sponsor) <= 200),
  pm_user_id       uuid references auth.users (id) on delete set null,
  priority         public.project_priority not null default 'medium',
  methodology      public.project_methodology not null default 'waterfall',
  visibility       public.project_visibility not null default 'internal',
  start_date       date,
  target_end_date  date,
  budget_cents     bigint check (budget_cents >= 0),
  currency         char(3) not null default 'USD',
  status           public.project_status not null default 'draft',
  current_step     public.project_step not null default 'create',
  progress_pct     smallint not null default 0 check (progress_pct between 0 and 100),
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz,
  unique (org_id, code),
  check (target_end_date is null or start_date is null or target_end_date >= start_date)
);
create index projects_org_status_idx on public.projects (org_id, status) where archived_at is null;
create index projects_pm_user_idx on public.projects (pm_user_id);
create index projects_created_by_idx on public.projects (created_by);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function private.set_updated_at();

-- Assign sequential per-org codes (P-001, P-002, ...) without races:
-- the UPDATE ... RETURNING takes a row lock on the organization.
create or replace function private.assign_project_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
begin
  update public.organizations
     set next_project_number = next_project_number + 1
   where id = new.org_id
  returning next_project_number - 1 into v_number;

  new.code := 'P-' || lpad(v_number::text, 3, '0');
  return new;
end;
$$;

create trigger projects_assign_code
  before insert on public.projects
  for each row execute function private.assign_project_code();

create trigger projects_audit
  after insert or update or delete on public.projects
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------
-- Project access helpers
-- ---------------------------------------------------------------------
create or replace function private.can_read_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    join public.organization_members m
      on m.org_id = p.org_id and m.user_id = (select auth.uid())
    where p.id = p_project_id
      and (
        p.visibility <> 'confidential'
        or m.role in ('owner', 'admin')
        or p.pm_user_id = m.user_id
        or p.created_by = m.user_id
      )
  );
$$;

create or replace function private.can_write_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    join public.organization_members m
      on m.org_id = p.org_id and m.user_id = (select auth.uid())
    where p.id = p_project_id
      and m.role <> 'viewer'
      and (
        p.visibility <> 'confidential'
        or m.role in ('owner', 'admin')
        or p.pm_user_id = m.user_id
        or p.created_by = m.user_id
      )
  );
$$;

revoke all on function private.can_read_project(uuid) from public;
revoke all on function private.can_write_project(uuid) from public;
grant execute on function private.can_read_project(uuid) to authenticated, service_role;
grant execute on function private.can_write_project(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.projects enable row level security;

create policy "projects: readable per visibility rules"
  on public.projects for select to authenticated
  using ((select private.can_read_project(id)));

create policy "projects: non-viewers can create in their org"
  on public.projects for insert to authenticated
  with check (
    (select private.has_org_role(org_id, array['owner', 'admin', 'pm', 'member']::public.org_role[]))
    and created_by = (select auth.uid())
  );

create policy "projects: writers can update"
  on public.projects for update to authenticated
  using ((select private.can_write_project(id)))
  with check ((select private.is_org_member(org_id)));

create policy "projects: admins or creator can delete"
  on public.projects for delete to authenticated
  using (
    (select private.has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
    or created_by = (select auth.uid())
  );

-- Moving a project to another org is never allowed.
create or replace function private.prevent_project_org_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id <> old.org_id then
    raise exception 'projects.org_id is immutable' using errcode = 'P0001';
  end if;
  if new.code <> old.code then
    raise exception 'projects.code is immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger projects_immutable_columns
  before update on public.projects
  for each row execute function private.prevent_project_org_change();

revoke all on public.projects from anon;
