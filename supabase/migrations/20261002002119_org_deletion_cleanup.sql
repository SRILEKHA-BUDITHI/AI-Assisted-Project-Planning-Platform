-- =====================================================================
-- Fix: deleting an organization failed.
--   Deleting an org cascades to its projects; the projects audit trigger
--   then tried to insert an audit row referencing the org being deleted,
--   violating audit_events_org_id_fkey. Audit rows for an org that is
--   itself being deleted are meaningless (they would cascade away), so
--   skip them.
--
-- Also: when a user account is deleted, remove organizations where they
-- were the only member, so personal workspaces don't linger as orphans.
-- =====================================================================

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
  if v_org is null
     or not exists (select 1 from public.organizations o where o.id = v_org) then
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

create or replace function private.delete_sole_member_orgs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.organizations o
  where exists (
          select 1 from public.organization_members m
          where m.org_id = o.id and m.user_id = old.id
        )
    and not exists (
          select 1 from public.organization_members m
          where m.org_id = o.id and m.user_id <> old.id
        );
  return old;
end;
$$;

create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function private.delete_sole_member_orgs();
