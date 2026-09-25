-- Supports the dashboard project list: newest first, cursor-paginated by (created_at, id).
create index if not exists projects_org_created_idx
  on public.projects (org_id, created_at desc, id desc)
  where archived_at is null;
