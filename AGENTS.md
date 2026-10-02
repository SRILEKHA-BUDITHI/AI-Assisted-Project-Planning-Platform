# ProjectAI — AI-Assisted Project Planning Platform

Production SaaS used by real users. Treat every change as going to production: `main` auto-deploys.
Architecture and roadmap: [plan.md](plan.md).

## Stack

| Layer | Tech | Folder | Owner |
|-------|------|--------|-------|
| Frontend | React 19, Vite 8, Tailwind v4, TypeScript, React Router 7, TanStack Query, supabase-js | `src/` + root config | frontend team |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 async + asyncpg, OR-Tools (optimizer) | `backend/` | backend team |
| Database | Supabase: Postgres 17, Auth, Storage, RLS | `supabase/` | database team |
| Hosting | Railway (services `web` and `api`), auto-deploy from GitHub `main` | `Dockerfile.web`, `backend/Dockerfile`, `railway*.json` | — |
| CI/CD | GitHub Actions `.github/workflows/ci.yml` | `.github/` | — |

Package managers: **pnpm** for frontend (never npm/yarn lockfiles), **uv** for backend (never pip freeze).

## Delivery flow (fully automatic)

```
feature branch → PR → CI (web · api · db checks) → review by CODEOWNERS → merge to main
  → CI on main → supabase db push (migrations) → Railway redeploys web + api ("Wait for CI")
```

- Never push directly to `main`. It is protected; use PRs.
- Only production exists. Test locally or in PR CI, never against production data.
- Don't change production settings in the Supabase or Railway dashboards by hand. Put the change in code (migration, `config.toml`, `railway*.json`) so it's reviewed and reproducible.

## Non-negotiable rules

### Security
- Never commit secrets. `.env*` is git-ignored; document variables in `.env.example`.
- Browser code may use only the Supabase **publishable/anon** key. The service-role key and DB password live only in Railway / GitHub secrets.
- Every table in `public` has RLS enabled with explicit policies. No exceptions. See `supabase/README.md`.
- Backend user requests run as the `authenticated` role with the caller's JWT claims (RLS enforced). The service-role DB session is for trusted background jobs only.
- Validate input at every boundary (zod/TS on the client, Pydantic on the server, CHECK constraints in the DB).

### Database (`supabase/`)
- The schema changes only through new files in `supabase/migrations/` (`supabase migration new <name>`). Never edit a merged migration, and never use the dashboard SQL editor for schema changes.
- Every new table needs RLS + policies + FK indexes + a pgTAP test in `supabase/tests/database/`.
- Money is `bigint` cents, durations are integer days, and timestamps are `timestamptz`.

### Backend (`backend/`)
- No schema ownership: no Alembic and no DDL. Map to tables defined by migrations.
- Errors are RFC 7807 problem+json. JSON is camelCase on the wire.
- Must pass: `uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`.

### Frontend (`src/`)
- Talk to data through `src/lib/api.ts` (backend) or `src/lib/supabase.ts` (auth only). Keep API types in `src/lib/types.ts` in sync with the backend.
- Every data view has loading, empty and error states. It must be keyboard-accessible with visible focus.
- Must pass: `pnpm exec tsc --noEmit -p . && pnpm build`.

### General
- Small, focused PRs, each touching one area where possible. Conventional commit messages (`feat(db): …`, `fix(api): …`).
- Match the surrounding code's style. No dead code, no commented-out blocks.

## Local development

```bash
pnpm install && cp .env.example .env.local && pnpm dev            # web on :8443
cd backend && uv sync && cp .env.example .env && uv run uvicorn app.main:app --reload --port 8000
```

CLIs used by the team: `gh`, `supabase`, `railway`, `uv`, `pnpm`.

## Figma Make notes

This project started in Figma Make. `.figma/make/*` scripts and the Figma plugins in `vite.config.ts` must stay intact. When running inside Figma Make, a Vite dev server is already running on `$PORT` (default 8443). `src/index.css` imports Tailwind v4 (`@import 'tailwindcss';`): keep CSS `@import`s first, and put theme tokens there, not in a Tailwind config file.
