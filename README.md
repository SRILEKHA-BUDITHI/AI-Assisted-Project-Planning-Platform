# ProjectAI — AI-Assisted Project Planning Platform

Plan projects intelligently: AI turns raw meeting notes and documents into structured scope, builds a Work Breakdown Structure, and an optimization engine produces a feasible schedule and resource plan under real budget, deadline, capacity and skill constraints.

**Flow:** Create Project → AI Intake → Scope Review → WBS Builder → Constraints → Optimization Results

## Architecture

| Layer | Tech | Folder |
|-------|------|--------|
| Web app | React 19 · Vite · Tailwind v4 · TypeScript | `src/` |
| API | Python 3.12 · FastAPI · OR-Tools | `backend/` |
| Database & Auth | Supabase (Postgres, Auth, Storage, Row Level Security) | `supabase/` |
| Hosting | Railway (auto-deploy from `main`) | `Dockerfile.web`, `backend/Dockerfile` |
| CI/CD | GitHub Actions | `.github/workflows/ci.yml` |

Design and roadmap: [plan.md](plan.md). Team and coding rules: [AGENTS.md](AGENTS.md). Database guide: [supabase/README.md](supabase/README.md).

## Quick start

```bash
# Web
pnpm install
cp .env.example .env.local        # fill in Supabase URL + publishable key, API URL
pnpm dev                          # http://localhost:8443

# API
cd backend
uv sync
cp .env.example .env              # DATABASE_URL, SUPABASE_URL, CORS_ORIGINS
uv run uvicorn app.main:app --reload --port 8000
```

## Contributing

1. Branch from `main`: `git switch -c feat/<area>-<thing>`
2. Open a PR. CI must pass, and the area's CODEOWNER must approve.
3. Merging to `main` deploys to production automatically (DB migrations first, then web + api).
