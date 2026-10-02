# Database (Supabase)

Owner: database team. Every schema change goes through this folder, never through the Supabase dashboard.

## Layout

| Path | What |
|------|------|
| `config.toml` | Auth, storage and API settings (local, and pushed to the hosted project) |
| `migrations/` | Ordered SQL migrations. The **only** way the schema changes. |
| `tests/database/` | pgTAP tests (RLS isolation, triggers, constraints) |

## Workflow

```bash
# 1. Create a new migration (never edit one that is already merged)
supabase migration new add_something

# 2. Write SQL in the generated file, then open a PR.
#    CI boots a fresh Supabase stack, applies all migrations, lints, and runs pgTAP.

# 3. Merge to main -> CI runs `supabase db push` against production automatically.
```

Local testing needs Docker Desktop (`supabase start`, `supabase test db`). Without Docker, rely on CI: every PR runs the same checks.

## Rules for every new table

1. `alter table ... enable row level security;` and explicit policies `to authenticated`. The anon key is public, so a table without RLS is readable by anyone.
2. Scope it: `org_id`, or `project_id` → use `private.can_read_project()` / `private.can_write_project()`.
3. Index every foreign key and every column used in a policy.
4. Use `(select auth.uid())` inside policies (it's evaluated once per query, not once per row).
5. Functions: `security definer` only when needed, and always `set search_path = ''`.
6. Add or extend a pgTAP test proving another tenant can't read or write it.

## Access model

| Role | Read | Write | Admin |
|------|------|-------|-------|
| owner | all org projects incl. confidential | yes | members, org settings, delete org |
| admin | all org projects incl. confidential | yes | members, org settings |
| pm | non-confidential + projects they manage | yes | resource pool (employees/skills) |
| member | non-confidential + own projects | yes | — |
| viewer | non-confidential | no | — |

The backend runs every user request as the `authenticated` role with the user's JWT claims, so these policies are the real authorization layer.
