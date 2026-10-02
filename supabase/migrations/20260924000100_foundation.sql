-- =====================================================================
-- Foundation: profiles, organizations, memberships, audit log.
--
-- Security model
--   * Every table in `public` has RLS enabled. The anon key is public, so
--     a table without RLS would be readable by anyone on the internet.
--   * Policies target the `authenticated` role only; `anon` gets nothing.
--   * Helper functions live in the non-exposed `private` schema and are
--     SECURITY DEFINER so policies can check membership without recursion.
--   * `(select auth.uid())` is used instead of `auth.uid()` so Postgres
--     evaluates it once per statement, not once per row.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'pm', 'member', 'viewer');

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       extensions.citext not null,
  full_name   text check (char_length(full_name) <= 200),
  avatar_url  text check (char_length(avatar_url) <= 2048),
  job_title   text check (char_length(job_title) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Public profile for each auth user. Created automatically on sign-up.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Organizations (tenant boundary)
-- ---------------------------------------------------------------------
create table public.organizations (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(name) between 1 and 120),
  slug                 extensions.citext not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  next_project_number  integer not null default 1,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table public.organizations is 'Tenant. Every business row belongs to exactly one organization.';

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

create table public.organization_members (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.org_role not null default 'member',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user_id_idx on public.organization_members (user_id);

-- ---------------------------------------------------------------------
-- Membership helpers (used by every policy)
-- ---------------------------------------------------------------------
create or replace function private.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_org_role(p_org_id uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_role(uuid, public.org_role[]) from public;
grant execute on function private.is_org_member(uuid) to authenticated, service_role;
grant execute on function private.has_org_role(uuid, public.org_role[]) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Creator of an organization automatically becomes its owner
-- ---------------------------------------------------------------------
create or replace function private.add_org_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.organization_members (org_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger organizations_add_creator_as_owner
  after insert on public.organizations
  for each row execute function private.add_org_creator_as_owner();

-- ---------------------------------------------------------------------
-- New auth user -> profile + personal workspace
-- ---------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(new.email, '@', 1)
  );
  v_slug text;
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    left(v_name, 200),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  -- slug: sanitized name + short random suffix, always unique and valid
  v_slug := left(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), 40);
  v_slug := trim(both '-' from v_slug);
  if char_length(v_slug) < 2 then v_slug := 'workspace'; end if;
  v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.organizations (name, slug, created_by)
  values (left(v_name, 100) || '''s Workspace', v_slug, new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Audit log (append-only; written by triggers, read by org admins)
-- ---------------------------------------------------------------------
create table public.audit_events (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  actor_id     uuid references auth.users (id) on delete set null,
  table_name   text not null,
  record_id    uuid,
  action       text not null check (action in ('insert', 'update', 'delete')),
  old_data     jsonb,
  new_data     jsonb,
  created_at   timestamptz not null default now()
);
create index audit_events_org_created_idx on public.audit_events (org_id, created_at desc);
create index audit_events_record_idx on public.audit_events (table_name, record_id);

-- Generic audit trigger. Expects the audited row to carry `org_id`, or a
-- `project_id` that resolves to one (projects table is created later, so the
-- lookup is dynamic).
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    jsonb := to_jsonb(coalesce(new, old));
  v_org    uuid  := (v_row ->> 'org_id')::uuid;
  v_action text  := lower(tg_op);
begin
  if v_org is null and v_row ? 'project_id' then
    execute 'select org_id from public.projects where id = $1'
      into v_org using (v_row ->> 'project_id')::uuid;
  end if;
  if v_org is null then
    return null;
  end if;

  insert into public.audit_events (org_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (
    v_org,
    (select auth.uid()),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_action,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.organizations         enable row level security;
alter table public.organization_members  enable row level security;
alter table public.audit_events          enable row level security;

-- profiles: see yourself and people who share an org with you; edit only yourself
create policy "profiles: read self and org peers"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.organization_members me
      join public.organization_members peer on peer.org_id = me.org_id
      where me.user_id = (select auth.uid()) and peer.user_id = profiles.id
    )
  );

create policy "profiles: update self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- organizations
create policy "organizations: members can read"
  on public.organizations for select to authenticated
  using ((select private.is_org_member(id)));

create policy "organizations: any user can create"
  on public.organizations for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "organizations: owners and admins can update"
  on public.organizations for update to authenticated
  using ((select private.has_org_role(id, array['owner', 'admin']::public.org_role[])))
  with check ((select private.has_org_role(id, array['owner', 'admin']::public.org_role[])));

create policy "organizations: owners can delete"
  on public.organizations for delete to authenticated
  using ((select private.has_org_role(id, array['owner']::public.org_role[])));

-- organization_members
create policy "members: members can read their org roster"
  on public.organization_members for select to authenticated
  using ((select private.is_org_member(org_id)));

create policy "members: owners and admins can add"
  on public.organization_members for insert to authenticated
  with check (
    (select private.has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
    and (role <> 'owner' or (select private.has_org_role(org_id, array['owner']::public.org_role[])))
  );

create policy "members: owners and admins can change roles"
  on public.organization_members for update to authenticated
  using ((select private.has_org_role(org_id, array['owner', 'admin']::public.org_role[])))
  with check (
    (select private.has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
    and (role <> 'owner' or (select private.has_org_role(org_id, array['owner']::public.org_role[])))
  );

create policy "members: admins remove others, anyone can leave"
  on public.organization_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
  );

-- An organization must always keep at least one owner. Cascades from deleting
-- the organization itself or the user's account are allowed through.
create or replace function private.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.organizations o where o.id = old.org_id)
     and exists (select 1 from auth.users u where u.id = old.user_id)
     and not exists (
       select 1 from public.organization_members m
       where m.org_id = old.org_id and m.role = 'owner' and m.user_id <> old.user_id
     )
  then
    raise exception 'An organization must have at least one owner'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger organization_members_keep_one_owner
  before update or delete on public.organization_members
  for each row execute function private.prevent_last_owner_removal();

-- audit_events: read-only for org owners/admins; writes only via trigger
create policy "audit: owners and admins can read"
  on public.audit_events for select to authenticated
  using ((select private.has_org_role(org_id, array['owner', 'admin']::public.org_role[])));

-- ---------------------------------------------------------------------
-- Grants: authenticated users go through RLS; anon gets nothing.
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.organizations, public.organization_members, public.audit_events from anon;
