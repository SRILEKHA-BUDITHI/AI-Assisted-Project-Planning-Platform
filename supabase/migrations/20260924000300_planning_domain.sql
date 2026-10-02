-- =====================================================================
-- Planning domain: intake -> scope -> WBS -> resources/constraints ->
-- optimization. All child tables inherit access from their project via
-- private.can_read_project / private.can_write_project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.document_kind as enum ('text', 'pdf', 'docx', 'transcript', 'audio');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.scope_category as enum
  ('objective', 'requirement', 'deliverable', 'constraint', 'risk', 'missing_info');
create type public.scope_status as enum ('pending', 'accepted', 'removed');
create type public.item_origin as enum ('ai', 'manual');
create type public.dependency_type as enum ('FS', 'SS', 'FF', 'SF');
create type public.constraint_mode as enum ('hard', 'soft');
create type public.solver_status as enum
  ('queued', 'running', 'optimal', 'feasible', 'infeasible', 'timeout', 'failed');
create type public.recommendation_type as enum ('reassignment', 'schedule_change', 'hire', 'note');
create type public.notification_level as enum ('info', 'warn', 'alert');

-- ---------------------------------------------------------------------
-- Intake: source documents and AI analysis runs
-- ---------------------------------------------------------------------
create table public.source_documents (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  kind            public.document_kind not null,
  title           text not null check (char_length(title) between 1 and 300),
  storage_path    text,                                 -- null for pasted text
  mime_type       text,
  size_bytes      bigint check (size_bytes between 0 and 52428800),   -- 50 MB, matches UI
  content_text    text,                                 -- pasted or extracted text
  extraction_status public.job_status not null default 'queued',
  extraction_error text,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  check (kind = 'text' or storage_path is not null)
);
create index source_documents_project_idx on public.source_documents (project_id, created_at desc);

create table public.intake_runs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  status          public.job_status not null default 'queued',
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  items_extracted integer,
  error           text,
  requested_by    uuid references auth.users (id) on delete set null default auth.uid(),
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index intake_runs_project_idx on public.intake_runs (project_id, created_at desc);

-- ---------------------------------------------------------------------
-- Scope items (Scope Review screen)
-- ---------------------------------------------------------------------
create table public.scope_items (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects (id) on delete cascade,
  intake_run_id       uuid references public.intake_runs (id) on delete set null,
  source_document_id  uuid references public.source_documents (id) on delete set null,
  category            public.scope_category not null,
  text                text not null check (char_length(text) between 1 and 2000),
  original_text       text,                         -- AI's original wording, kept for evals/audit
  source_quote        text,
  confidence          real check (confidence between 0 and 1),
  status              public.scope_status not null default 'pending',
  origin              public.item_origin not null default 'manual',
  sort_order          integer not null default 0,
  updated_by          uuid references auth.users (id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index scope_items_project_category_idx on public.scope_items (project_id, category, sort_order);

create trigger scope_items_set_updated_at
  before update on public.scope_items
  for each row execute function private.set_updated_at();
create trigger scope_items_audit
  after insert or update or delete on public.scope_items
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------
-- Org-level resource pool: skills, employees
-- ---------------------------------------------------------------------
create table public.skills (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        extensions.citext not null check (char_length(name) between 1 and 100),
  created_at  timestamptz not null default now(),
  unique (org_id, name)
);

create table public.employees (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id) on delete cascade,
  user_id               uuid references auth.users (id) on delete set null,   -- optional link to a login
  full_name             text not null check (char_length(full_name) between 1 and 200),
  role_title            text check (char_length(role_title) <= 120),
  weekly_capacity_hours numeric(5,1) not null default 40 check (weekly_capacity_hours between 0 and 80),
  hourly_rate_cents     bigint check (hourly_rate_cents >= 0),
  is_contractor         boolean not null default false,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index employees_org_idx on public.employees (org_id) where active;

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function private.set_updated_at();

create table public.employee_skills (
  employee_id  uuid not null references public.employees (id) on delete cascade,
  skill_id     uuid not null references public.skills (id) on delete cascade,
  proficiency  smallint not null default 3 check (proficiency between 1 and 5),
  primary key (employee_id, skill_id)
);
create index employee_skills_skill_idx on public.employee_skills (skill_id);

-- ---------------------------------------------------------------------
-- WBS (3 levels: project -> deliverable -> work package)
-- ---------------------------------------------------------------------
create table public.wbs_nodes (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  parent_id          uuid references public.wbs_nodes (id) on delete cascade,
  level              smallint not null check (level between 1 and 3),
  sort_order         integer not null default 0,
  name               text not null check (char_length(name) between 1 and 300),
  description        text check (char_length(description) <= 5000),
  duration_days      integer check (duration_days between 0 and 3650),
  effort_hours       numeric(8,1) check (effort_hours >= 0),
  owner_employee_id  uuid references public.employees (id) on delete set null,
  scope_item_id      uuid references public.scope_items (id) on delete set null,
  origin             public.item_origin not null default 'manual',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((level = 1) = (parent_id is null))
);
create index wbs_nodes_project_idx on public.wbs_nodes (project_id, parent_id, sort_order);
create index wbs_nodes_parent_idx on public.wbs_nodes (parent_id);
create index wbs_nodes_owner_idx on public.wbs_nodes (owner_employee_id);
create unique index wbs_nodes_one_root_per_project on public.wbs_nodes (project_id) where level = 1;

create trigger wbs_nodes_set_updated_at
  before update on public.wbs_nodes
  for each row execute function private.set_updated_at();
create trigger wbs_nodes_audit
  after insert or update or delete on public.wbs_nodes
  for each row execute function private.audit_row_change();

-- Parent must be in the same project and exactly one level up.
create or replace function private.validate_wbs_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.wbs_nodes%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;
  select * into v_parent from public.wbs_nodes where id = new.parent_id;
  if v_parent.project_id <> new.project_id then
    raise exception 'WBS parent belongs to a different project' using errcode = 'P0001';
  end if;
  if v_parent.level <> new.level - 1 then
    raise exception 'WBS node level must be parent level + 1' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger wbs_nodes_validate_parent
  before insert or update of parent_id, level, project_id on public.wbs_nodes
  for each row execute function private.validate_wbs_parent();

-- WBS codes ("1", "1.2", "1.2.3") are derived from tree position, never stored,
-- so reordering can't leave stale codes behind.
create view public.wbs_nodes_with_code
with (security_invoker = true)
as
with recursive numbered as (
  select n.*,
         row_number() over (partition by n.parent_id order by n.sort_order, n.created_at, n.id)::int as position
  from public.wbs_nodes n
),
tree as (
  select r.id, r.project_id, r.parent_id, r.level, r.sort_order, r.name, r.description,
         r.duration_days, r.effort_hours, r.owner_employee_id, r.scope_item_id, r.origin,
         r.created_at, r.updated_at,
         '1'::text as code, array[1]::int[] as path
  from numbered r
  where r.parent_id is null
  union all
  select c.id, c.project_id, c.parent_id, c.level, c.sort_order, c.name, c.description,
         c.duration_days, c.effort_hours, c.owner_employee_id, c.scope_item_id, c.origin,
         c.created_at, c.updated_at,
         t.code || '.' || c.position, t.path || c.position
  from numbered c
  join tree t on c.parent_id = t.id
)
select id, project_id, parent_id, level, sort_order, name, description, duration_days,
       effort_hours, owner_employee_id, scope_item_id, origin, created_at, updated_at, code, path
from tree;

create table public.task_skill_requirements (
  wbs_node_id  uuid not null references public.wbs_nodes (id) on delete cascade,
  skill_id     uuid not null references public.skills (id) on delete cascade,
  min_proficiency smallint not null default 1 check (min_proficiency between 1 and 5),
  primary key (wbs_node_id, skill_id)
);
create index task_skill_requirements_skill_idx on public.task_skill_requirements (skill_id);

-- ---------------------------------------------------------------------
-- Dependencies (with same-project + cycle protection)
-- ---------------------------------------------------------------------
create table public.dependencies (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  predecessor_id  uuid not null references public.wbs_nodes (id) on delete cascade,
  successor_id    uuid not null references public.wbs_nodes (id) on delete cascade,
  type            public.dependency_type not null default 'FS',
  lag_days        integer not null default 0 check (lag_days between -365 and 365),
  origin          public.item_origin not null default 'manual',
  created_at      timestamptz not null default now(),
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);
create index dependencies_project_idx on public.dependencies (project_id);
create index dependencies_successor_idx on public.dependencies (successor_id);

create trigger dependencies_audit
  after insert or update or delete on public.dependencies
  for each row execute function private.audit_row_change();

create or replace function private.validate_dependency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.wbs_nodes n
    where n.id in (new.predecessor_id, new.successor_id) and n.project_id <> new.project_id
  ) then
    raise exception 'Dependency tasks must belong to the dependency''s project' using errcode = 'P0001';
  end if;

  -- Adding pred -> succ creates a cycle if succ already reaches pred.
  if exists (
    with recursive reach(node) as (
      select d.successor_id from public.dependencies d
      where d.predecessor_id = new.successor_id and d.id <> new.id
      union
      select d.successor_id from public.dependencies d
      join reach r on d.predecessor_id = r.node
      where d.id <> new.id
    )
    select 1 from reach where node = new.predecessor_id
  ) or new.successor_id = new.predecessor_id then
    raise exception 'Dependency would create a cycle' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger dependencies_validate
  before insert or update on public.dependencies
  for each row execute function private.validate_dependency();

-- ---------------------------------------------------------------------
-- Constraints (1 row per project) + milestones
-- ---------------------------------------------------------------------
create table public.constraint_sets (
  project_id               uuid primary key references public.projects (id) on delete cascade,
  budget_total_cents       bigint check (budget_total_cents >= 0),
  contingency_pct          numeric(5,2) not null default 0 check (contingency_pct between 0 and 100),
  labor_cap_cents          bigint check (labor_cap_cents >= 0),
  infra_cap_cents          bigint check (infra_cap_cents >= 0),
  budget_mode              public.constraint_mode not null default 'hard',
  budget_penalty           real not null default 1000,
  start_date               date,
  must_finish_by           date,
  deadline_mode            public.constraint_mode not null default 'hard',
  deadline_penalty_per_day real not null default 500,
  working_days_per_week    smallint not null default 5 check (working_days_per_week between 1 and 7),
  capacity_mode            public.constraint_mode not null default 'soft',
  capacity_penalty         real not null default 100,
  skill_mode               public.constraint_mode not null default 'hard',
  allow_contractors        boolean not null default true,
  contractor_rate_cents    bigint check (contractor_rate_cents >= 0),
  updated_at               timestamptz not null default now(),
  check (must_finish_by is null or start_date is null or must_finish_by >= start_date)
);

create trigger constraint_sets_set_updated_at
  before update on public.constraint_sets
  for each row execute function private.set_updated_at();
create trigger constraint_sets_audit
  after insert or update or delete on public.constraint_sets
  for each row execute function private.audit_row_change();

create table public.milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  due_date    date not null,
  wbs_node_id uuid references public.wbs_nodes (id) on delete set null,
  mode        public.constraint_mode not null default 'hard',
  created_at  timestamptz not null default now()
);
create index milestones_project_idx on public.milestones (project_id, due_date);

-- ---------------------------------------------------------------------
-- Optimization runs and results
-- ---------------------------------------------------------------------
create table public.optimization_runs (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  status               public.solver_status not null default 'queued',
  solver               text,
  solver_version       text,
  runtime_ms           integer,
  mip_gap              real,
  objective_value      double precision,
  expected_cost_cents  bigint,
  completion_date      date,
  avg_utilization      real,
  critical_path        jsonb,
  input_snapshot       jsonb not null default '{}'::jsonb,
  infeasibility        jsonb,          -- conflicting constraints when infeasible
  error                text,
  requested_by         uuid references auth.users (id) on delete set null default auth.uid(),
  applied_at           timestamptz,
  applied_by           uuid references auth.users (id) on delete set null,
  started_at           timestamptz,
  finished_at          timestamptz,
  created_at           timestamptz not null default now()
);
create index optimization_runs_project_idx on public.optimization_runs (project_id, created_at desc);

create table public.planned_assignments (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.optimization_runs (id) on delete cascade,
  wbs_node_id        uuid not null references public.wbs_nodes (id) on delete cascade,
  employee_id        uuid references public.employees (id) on delete set null,
  contractor_label   text,
  start_week         integer not null check (start_week >= 0),
  end_week           integer not null,
  hours_per_week     numeric(5,1) not null check (hours_per_week >= 0),
  baseline_start_week integer,
  baseline_end_week   integer,
  baseline_employee_id uuid references public.employees (id) on delete set null,
  check (end_week >= start_week),
  check (employee_id is not null or contractor_label is not null)
);
create index planned_assignments_run_idx on public.planned_assignments (run_id);

create table public.recommendations (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.optimization_runs (id) on delete cascade,
  type         public.recommendation_type not null,
  wbs_node_id  uuid references public.wbs_nodes (id) on delete cascade,
  before_value text,
  after_value  text,
  reason       text not null,
  sort_order   integer not null default 0
);
create index recommendations_run_idx on public.recommendations (run_id, type, sort_order);

-- Committed weekly hours across projects (written when a plan is applied).
create table public.allocations (
  employee_id  uuid not null references public.employees (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  week_start   date not null check (extract(isodow from week_start) = 1),
  hours        numeric(5,1) not null check (hours between 0 and 80),
  run_id       uuid references public.optimization_runs (id) on delete set null,
  primary key (employee_id, project_id, week_start)
);
create index allocations_project_idx on public.allocations (project_id);
create index allocations_employee_week_idx on public.allocations (employee_id, week_start);

-- ---------------------------------------------------------------------
-- Notifications (per user)
-- ---------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete cascade,
  level       public.notification_level not null default 'info',
  message     text not null check (char_length(message) <= 500),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.source_documents        enable row level security;
alter table public.intake_runs             enable row level security;
alter table public.scope_items             enable row level security;
alter table public.skills                  enable row level security;
alter table public.employees               enable row level security;
alter table public.employee_skills         enable row level security;
alter table public.wbs_nodes               enable row level security;
alter table public.task_skill_requirements enable row level security;
alter table public.dependencies            enable row level security;
alter table public.constraint_sets         enable row level security;
alter table public.milestones              enable row level security;
alter table public.optimization_runs       enable row level security;
alter table public.planned_assignments     enable row level security;
alter table public.recommendations         enable row level security;
alter table public.allocations             enable row level security;
alter table public.notifications           enable row level security;

-- Project-scoped tables: same four policies each, generated to avoid drift.
do $$
declare
  t text;
begin
  foreach t in array array[
    'source_documents', 'intake_runs', 'scope_items', 'wbs_nodes',
    'dependencies', 'constraint_sets', 'milestones', 'optimization_runs'
  ] loop
    execute format(
      'create policy "%1$s: project readers can read" on public.%1$I for select to authenticated
         using ((select private.can_read_project(project_id)))', t);
    execute format(
      'create policy "%1$s: project writers can insert" on public.%1$I for insert to authenticated
         with check ((select private.can_write_project(project_id)))', t);
    execute format(
      'create policy "%1$s: project writers can update" on public.%1$I for update to authenticated
         using ((select private.can_write_project(project_id)))
         with check ((select private.can_write_project(project_id)))', t);
    execute format(
      'create policy "%1$s: project writers can delete" on public.%1$I for delete to authenticated
         using ((select private.can_write_project(project_id)))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Tables scoped through a parent row.
create policy "task_skill_requirements: via wbs node"
  on public.task_skill_requirements for all to authenticated
  using (exists (select 1 from public.wbs_nodes n
                 where n.id = wbs_node_id and (select private.can_read_project(n.project_id))))
  with check (exists (select 1 from public.wbs_nodes n
                      where n.id = wbs_node_id and (select private.can_write_project(n.project_id))));

create policy "planned_assignments: readable via run"
  on public.planned_assignments for select to authenticated
  using (exists (select 1 from public.optimization_runs r
                 where r.id = run_id and (select private.can_read_project(r.project_id))));

create policy "recommendations: readable via run"
  on public.recommendations for select to authenticated
  using (exists (select 1 from public.optimization_runs r
                 where r.id = run_id and (select private.can_read_project(r.project_id))));
-- planned_assignments / recommendations are written only by the optimizer (service role).

create policy "allocations: org members can read"
  on public.allocations for select to authenticated
  using (exists (select 1 from public.employees e
                 where e.id = employee_id and (select private.is_org_member(e.org_id))));
-- allocations are written only when a plan is applied (service role).

-- Org-scoped resource pool: members read, owner/admin/pm write.
create policy "skills: members can read"
  on public.skills for select to authenticated
  using ((select private.is_org_member(org_id)));
create policy "skills: managers can write"
  on public.skills for all to authenticated
  using ((select private.has_org_role(org_id, array['owner', 'admin', 'pm']::public.org_role[])))
  with check ((select private.has_org_role(org_id, array['owner', 'admin', 'pm']::public.org_role[])));

create policy "employees: members can read"
  on public.employees for select to authenticated
  using ((select private.is_org_member(org_id)));
create policy "employees: managers can write"
  on public.employees for all to authenticated
  using ((select private.has_org_role(org_id, array['owner', 'admin', 'pm']::public.org_role[])))
  with check ((select private.has_org_role(org_id, array['owner', 'admin', 'pm']::public.org_role[])));

create policy "employee_skills: members can read"
  on public.employee_skills for select to authenticated
  using (exists (select 1 from public.employees e
                 where e.id = employee_id and (select private.is_org_member(e.org_id))));
create policy "employee_skills: managers can write"
  on public.employee_skills for all to authenticated
  using (exists (select 1 from public.employees e
                 where e.id = employee_id
                   and (select private.has_org_role(e.org_id, array['owner', 'admin', 'pm']::public.org_role[]))))
  with check (exists (select 1 from public.employees e
                      where e.id = employee_id
                        and (select private.has_org_role(e.org_id, array['owner', 'admin', 'pm']::public.org_role[]))));

create policy "notifications: owner can read"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications: owner can mark read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "notifications: owner can delete"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.skills, public.employees, public.employee_skills,
              public.task_skill_requirements, public.planned_assignments,
              public.recommendations, public.allocations, public.notifications
  from anon;
revoke all on public.wbs_nodes_with_code from anon;

-- =====================================================================
-- Storage: private bucket for uploaded project documents.
-- Path convention: {project_id}/{document_id}/{filename}
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-documents', 'project-documents', false, 52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/vtt', 'application/x-subrip',
    'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a'
  ]
)
on conflict (id) do nothing;

create policy "project-documents: readers can download"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-documents'
    and (select private.can_read_project(((storage.foldername(name))[1])::uuid))
  );

create policy "project-documents: writers can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-documents'
    and (select private.can_write_project(((storage.foldername(name))[1])::uuid))
  );

create policy "project-documents: writers can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-documents'
    and (select private.can_write_project(((storage.foldername(name))[1])::uuid))
  );
