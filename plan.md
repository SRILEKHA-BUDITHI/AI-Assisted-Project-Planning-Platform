# Backend Plan — AI-Assisted Project Planning Platform

> Status: v2 · 2026-09-24
> Scope: Everything needed to turn the current clickable prototype into a working product.

## 0. Locked decisions (override anything below that conflicts)

| Topic | Decision |
|-------|----------|
| Database + Auth + File storage | **Supabase** (Postgres 17, Supabase Auth, Storage). Replaces the custom JWT/argon2 auth, MinIO/S3, and Alembic in §2 and §7. |
| Login | Email + password (verified email, strong password policy), **Google**, **Microsoft (Azure/Entra)** |
| Authorization | Postgres **RLS** is the source of truth. The backend runs each request as `authenticated` with the user's JWT claims. |
| Schema ownership | `supabase/migrations/` (database team). The backend has no Alembic. |
| Hosting | **Railway**: `web` (Caddy serving the Vite build) + `api` (FastAPI), auto-deployed from GitHub `main` |
| Environments | **Production only.** `main` is protected; PRs + CI are required. |
| CI/CD | GitHub Actions: web/api/db checks on every PR. On `main`: `supabase db push`, then Railway deploys ("Wait for CI"). |
| Optimizer | **Google OR-Tools (CP-SAT)**. Gurobi is dropped, so §6.2 and §6.6 licensing notes no longer apply. The MILP formulation in §6.1 carries over. |
| Team split | Frontend (`src/`), Backend (`backend/`), Database (`supabase/`), enforced with CODEOWNERS |
| Background jobs | Start with in-process FastAPI background tasks + job rows in Postgres. Add Redis + arq on Railway when the AI/optimizer load needs it. |

---

## 1. Where the project is today

The repo is a **front-end-only prototype** (React 19 + Vite + Tailwind v4, built in Figma Make). It has 8 screens that make up one planning flow:

| # | Screen | File | What it shows | What's fake right now |
|---|--------|------|---------------|-----------------------|
| 0 | Login | `src/screens/Login.tsx` | Email/password + SSO button | Any click logs you in; no auth |
| – | Dashboard | `src/screens/Dashboard.tsx` | KPIs, project table, notifications, at-risk list | `PROJECTS`, `NOTIFICATIONS` are constants; filter box does nothing |
| 1 | Create Project | `src/screens/CreateProject.tsx` | Name, type, dates, budget, PM, dept, sponsor, priority, methodology, visibility | Inputs aren't controlled; "Save Draft" does nothing |
| 2 | AI Project Intake | `src/screens/AIProjectIntake.tsx` | Free text notes + upload tiles (PDF, DOCX, transcript, audio) | "Analyze" is a `setTimeout(1800)`; uploads don't work; "Previous Intakes" is hardcoded |
| 3 | Scope Review | `src/screens/ScopeReview.tsx` | 6 AI categories (Objectives, Requirements, Deliverables, Constraints, Risks, Missing Info), accept / edit / remove | `INITIAL` constant; changes lost on navigation; "+ Add item" does nothing |
| 4 | WBS Builder | `src/screens/WBSBuilder.tsx` | 3-level WBS tree (code, name, duration, owner) + AI validation panel | `INITIAL_WBS`, `AI_ISSUES` constant; Add/Edit/Export do nothing |
| 5 | Constraints | `src/screens/Constraints.tsx` | Budget, deadline/milestones, employee capacity, skills, task dependencies — each hard/soft | Everything hardcoded; only the hard/soft toggles have state |
| 6 | Optimization Results | `src/screens/OptimizationResults.tsx` | Solver KPIs, reassignments, schedule changes, before/after utilization, apply/export | Everything hardcoded; "Gurobi v11.0.1 · 4.3s" is text |

**Other things I noticed that affect backend design:**

- **No shared state.** `App.tsx` switches screens with `useState`. There's no project ID, no router, and each screen starts from its own constants. The backend has to become the source of truth, and the frontend needs a `projectId` in the URL.
- **Money is stored as strings** (`"375,000"`, `"$240K"`). The backend will use integer cents (or `NUMERIC(14,2)`), and the frontend will format them.
- **Durations are strings** (`"3w"`). Store them as integer working days. The frontend can show weeks.
- **Dependencies reference tasks by label** (`"1.1.1 Salesforce Connector"`). WBS codes change when the tree is reordered, so dependencies must reference stable task IDs. The code is computed for display.
- **Employees are cross-project.** Mark Chen is 100% allocated before this project is even planned, so capacity depends on a resource pool shared across projects. That makes it an org-level entity, not a per-project one.
- **The optimization UI expects explanations** ("Skill gap + overallocation", "SAP dependency cascade"). The solver gives numbers, so a separate explanation layer is needed (see §6.4).
- **The UI already shows an infeasibility message** ("Without this, the budget constraint becomes infeasible"). The backend should support this properly with Gurobi's IIS (irreducible inconsistent subsystem).

---

## 2. Architecture decisions

### 2.1 Recommended stack

| Concern | Choice | Why |
|---------|--------|-----|
| Language / framework | **Python 3.12 + FastAPI** | Gurobi's main API (`gurobipy`) is Python, and so are the document-parsing and LLM tooling. Using one language avoids a Node↔Python bridge. FastAPI generates OpenAPI, which gives us a typed TS client for free. |
| Database | **PostgreSQL 16** | Relational data (projects → WBS tree → tasks → dependencies → assignments). `JSONB` holds solver snapshots and AI raw output. Recursive CTEs handle the WBS tree. |
| ORM / migrations | SQLAlchemy 2.0 (async) + Alembic | Industry standard with explicit migrations. |
| Validation | Pydantic v2 | Shared by the API schemas and LLM structured output. |
| Background jobs | **Redis + arq** (or Celery if the team knows it) | AI analysis (10–60 s) and optimization (seconds to minutes) must not run inside an HTTP request. |
| File storage | S3-compatible (AWS S3 / MinIO locally) | Uploaded PDFs, DOCX, and audio; generated PDF / MS Project exports. |
| LLM | **Anthropic Claude** — `claude-sonnet-5` by default, `claude-opus-5-5` for the harder WBS generation and validation step | Strong at long-document extraction; tool use with JSON schemas gives reliable structured output. Keep the model ID in config. |
| Speech-to-text | Separate STT provider (e.g. Whisper, or a cloud STT) | Needed only for the Audio tile. Put it behind an interface and ship it last. |
| Optimization | **Gurobi 11+** via `gurobipy` (student academic license), with an **OR-Tools CP-SAT fallback** | Gurobi is what the UI promises. The fallback lets CI and teammates without a license run the solver. See §6.6 for how to use the student license. |
| Auth | Our own JWT (email/password, argon2) + **OIDC** for SSO | The UI has both buttons. OIDC covers Okta, Azure AD, and Google Workspace. |
| Real-time status | Server-Sent Events (SSE) | One-way "job progress" updates. Simpler than WebSockets. |
| Observability | Structured JSON logs, OpenTelemetry traces, Sentry | Needed to debug long async jobs. |
| Packaging | Docker + docker-compose (api, worker, postgres, redis, minio) | One command sets up a local environment. |

### 2.2 Shape: modular monolith with a worker

I'd avoid microservices at this stage: one team, one domain, and a lot of transactional coupling between scope, WBS, and constraints. Start with **one deployable codebase and two process types**:

```
                ┌──────────────┐        ┌───────────────┐
  React SPA ───▶│  FastAPI API │──────▶ │  PostgreSQL   │
   (Vite)       │  (stateless) │        └───────────────┘
      ▲         └──────┬───────┘                ▲
      │ SSE            │ enqueue                │
      │                ▼                        │
      │         ┌──────────────┐   read/write   │
      └─────────│    Redis     │◀──────────────┐│
                └──────┬───────┘               ││
                       ▼                       ││
                ┌──────────────┐               ││
                │  arq worker  │───────────────┘│
                │ • AI intake  │────────────────┘
                │ • WBS gen    │──▶ Claude API
                │ • Optimizer  │──▶ Gurobi
                │ • Exports    │──▶ S3
                └──────────────┘
```

Module boundaries (Python packages) are drawn so any of them can become a separate service later without a rewrite:

```
backend/
  app/
    core/            # config, db session, security, logging, errors
    auth/            # users, sessions, OIDC, RBAC
    orgs/            # organizations, memberships
    projects/        # project CRUD, status, dashboard aggregates
    intake/          # source documents, text extraction, AI analysis jobs
    scope/           # scope items (6 categories), review workflow
    wbs/             # WBS tree, work packages, AI generation + validation
    resources/       # employees, skills, availability, cross-project allocation
    constraints/     # budget, deadlines, milestones, dependencies, hard/soft
    optimization/    # model builder, solver adapters, runs, results, explanations
    exports/         # PDF report, MS Project XML, WBS CSV/XLSX
    notifications/   # notification generation + feed
    audit/           # append-only audit log
    ai/              # LLM client wrapper, prompts, schemas, eval harness
    jobs/            # arq worker entrypoint + job registry
  migrations/        # Alembic
  tests/
  pyproject.toml
  Dockerfile
docker-compose.yml
```

**Repo layout:** put `backend/` next to the existing frontend at the repo root. **Don't move the frontend**, because the `.figma/make/*` scripts expect it where it is.

---

## 3. Domain model

### 3.1 Entities (ER overview)

```
Organization 1─* Membership *─1 User
Organization 1─* Employee *─* Skill        (EmployeeSkill: proficiency 1–5)
Organization 1─* Project

Project 1─* SourceDocument          (pasted text, PDF, DOCX, transcript, audio)
Project 1─* IntakeRun               (one AI analysis attempt; status, model, tokens)
IntakeRun 1─* ScopeItem             (category, text, status, source_span)
Project 1─* WbsNode                 (self-ref parent_id; level 1/2/3; sort_order)
WbsNode 1─* TaskSkillRequirement *─1 Skill
WbsNode 1─* Dependency *─1 WbsNode  (FS/SS/FF/SF + lag_days)
WbsNode *─1 Employee                (planned owner, nullable)
Project 1─1 ConstraintSet           (budget, dates, working calendar, hard/soft flags + penalty weights)
ConstraintSet 1─* Milestone
Project 1─* OptimizationRun         (status, solver, input_snapshot JSONB, metrics)
OptimizationRun 1─* PlannedAssignment (task, employee|contractor, start_week, end_week, hours)
OptimizationRun 1─* Recommendation  (type, before, after, reason)
Employee 1─* Allocation             (project, week, hours) — committed capacity across projects
User 1─* Notification
* ─ AuditEvent                      (actor, entity, action, diff JSONB)
```

### 3.2 Key tables (abridged)

```sql
projects (
  id uuid pk, org_id fk, code text unique per org,        -- "P-001"
  name, description, type, department, sponsor,
  pm_user_id fk, priority enum, methodology enum, visibility enum,
  start_date date, target_end_date date,
  budget_cents bigint, currency char(3) default 'USD',
  status enum('draft','planning','active','on_track','at_risk','delayed','completed','archived'),
  progress_pct smallint, current_step enum('create','intake','scope','wbs','constraints','optimize','done'),
  created_at, updated_at, deleted_at
)

scope_items (
  id uuid pk, project_id fk, intake_run_id fk null,  -- null = added manually
  category enum('objective','requirement','deliverable','constraint','risk','missing_info'),
  text text, original_text text,                      -- keep AI text for eval/audit
  status enum('pending','accepted','removed'),
  source_document_id fk null, source_span int4range null,  -- where in the doc it came from
  confidence real null, sort_order int, updated_by fk, updated_at
)

wbs_nodes (
  id uuid pk, project_id fk, parent_id fk null, level smallint check (level between 1 and 3),
  sort_order int, name text, description text,
  duration_days int null, effort_hours int null,
  owner_employee_id fk null, scope_item_id fk null,   -- traceability to deliverable
  origin enum('ai','manual'), created_at, updated_at
)
-- WBS code ("1.2.3") is computed from (parent chain, sort_order), not stored.

dependencies (
  id uuid pk, project_id fk, predecessor_id fk, successor_id fk,
  type enum('FS','SS','FF','SF'), lag_days int default 0,
  unique(predecessor_id, successor_id), check (predecessor_id <> successor_id)
)

constraint_sets (
  project_id pk fk,
  budget_total_cents, contingency_pct, labor_cap_cents, infra_cap_cents,
  budget_mode enum('hard','soft'), budget_penalty real,
  start_date, must_finish_by, deadline_mode, deadline_penalty_per_day real,
  working_days_per_week smallint, capacity_mode, skill_mode,
  allow_contractors bool, contractor_rate_cents
)

optimization_runs (
  id uuid pk, project_id fk, requested_by fk,
  status enum('queued','running','optimal','feasible','infeasible','timeout','failed'),
  solver text, solver_version text, runtime_ms int, mip_gap real,
  objective_value real, expected_cost_cents bigint, completion_date date,
  avg_utilization real, critical_path jsonb,
  input_snapshot jsonb,        -- full frozen input, makes every run reproducible
  iis jsonb null,              -- conflicting constraints when infeasible
  applied_at timestamptz null, created_at
)
```

**Design rules**
- Every table is scoped by `org_id` (directly or through `project_id`), and every repository query filters by it. This is the multi-tenant boundary.
- Use soft deletes for projects only. Scope items use `status='removed'`, which the UI needs anyway.
- `input_snapshot` freezes the WBS, constraints, and capacity at run time. Results then stay valid even after the user edits the plan, and any run can be replayed.
- Add optimistic concurrency (`updated_at` / `version` column) on WBS and scope edits so two PMs editing the same project don't overwrite each other.

---

## 4. API design

REST + JSON under `/api/v1`, with OpenAPI generated by FastAPI. Errors follow RFC 7807 (`application/problem+json`). List endpoints use cursor pagination. Long operations return `202 Accepted` + a job resource.

### 4.1 Endpoints mapped to screens

**Auth (Login)**
```
POST   /auth/login                  {email,password} → access + refresh (httpOnly cookie)
POST   /auth/refresh
POST   /auth/logout
GET    /auth/sso/{provider}/start   → redirect to IdP
GET    /auth/sso/{provider}/callback
POST   /auth/password/forgot | /auth/password/reset
GET    /me                          → user, org, role (replaces hardcoded "Jane Doe" in Shell)
```

**Dashboard**
```
GET    /projects?status=&q=&cursor=     (filter box)
GET    /dashboard/summary               → KPI cards (totals, on-track %, at-risk, total budget)
GET    /notifications?unread=true
POST   /notifications/{id}/read
```

**1 · Create Project**
```
POST   /projects                        (status = draft; "Save Draft" = same call)
GET    /projects/{id}
PATCH  /projects/{id}
GET    /lookups                         → project types, departments, PM candidates, enums
```

**2 · AI Intake**
```
POST   /projects/{id}/documents                 multipart upload (≤ 50 MB) or {kind:'text', content}
GET    /projects/{id}/documents
DELETE /projects/{id}/documents/{docId}
POST   /projects/{id}/intake-runs               → 202 {runId}   ("Analyze Project")
GET    /projects/{id}/intake-runs               ("Previous Intakes")
GET    /intake-runs/{runId}                     status + counts per category
GET    /intake-runs/{runId}/events              SSE: extracting_text → analyzing → done
```

**3 · Scope Review**
```
GET    /projects/{id}/scope-items?category=
POST   /projects/{id}/scope-items               ("+ Add item")
PATCH  /scope-items/{itemId}                    {text?, status?}
POST   /projects/{id}/scope-items:bulk-accept   ("Accept All")
```

**4 · WBS Builder**
```
GET    /projects/{id}/wbs                       nested tree with computed codes + summary stats
POST   /projects/{id}/wbs:generate              → 202 job (AI builds WBS from accepted scope)
POST   /projects/{id}/wbs/nodes                 {parentId, name, ...}  ("+ Add Deliverable / Work Package / + Sub")
PATCH  /wbs/nodes/{nodeId}                      ("Edit")
POST   /wbs/nodes/{nodeId}:move                 {newParentId, position}
DELETE /wbs/nodes/{nodeId}
POST   /projects/{id}/wbs:validate              → 202 job ("Re-Validate WBS") → issues[]
GET    /projects/{id}/wbs/export?format=csv|xlsx
```

**5 · Constraints**
```
GET    /projects/{id}/constraints
PUT    /projects/{id}/constraints               budget, dates, milestones, hard/soft modes
GET    /projects/{id}/capacity                  employees + availability + current cross-project allocation
GET    /projects/{id}/skills-coverage           required vs available → "Gap" badges
PUT    /wbs/nodes/{nodeId}/skills
GET    /projects/{id}/dependencies
POST   /projects/{id}/dependencies              (reject if it creates a cycle)
PATCH  /dependencies/{depId}
DELETE /dependencies/{depId}
GET    /employees  | POST /employees | PATCH /employees/{id}   (org-level resource pool)
```

**6 · Optimization**
```
POST   /projects/{id}/optimization-runs         → 202 {runId}  ("Run Gurobi Optimization")
GET    /optimization-runs/{runId}               KPIs, status, IIS/feasibility notes
GET    /optimization-runs/{runId}/events        SSE progress (building model, solving, gap %)
GET    /optimization-runs/{runId}/reassignments
GET    /optimization-runs/{runId}/schedule-changes
GET    /optimization-runs/{runId}/utilization
POST   /optimization-runs/{runId}:apply         ("Apply Optimized Plan") — writes allocations, bumps project status
POST   /optimization-runs/{runId}/exports       {format:'pdf'|'msproject'} → 202 → signed download URL
```

### 4.2 Cross-cutting API conventions
- An `Idempotency-Key` header is required on `POST` requests that start jobs, so double-clicking "Analyze" or "Run" creates only one job.
- `ETag` / `If-Match` on WBS and scope mutations (optimistic concurrency).
- `X-Request-ID` is propagated through API → worker → LLM/solver logs.
- Rate limits per user on AI and optimization endpoints, because they cost money and CPU.

---

## 5. AI pipeline (Intake → Scope → WBS)

### 5.1 Document ingestion
1. Upload → virus scan (ClamAV) → store in S3 under `org/{orgId}/project/{projectId}/…`.
2. Text extraction by type:
   - PDF → `pypdf` / `pdfplumber`; scanned PDFs get OCR as a later add-on.
   - DOCX → `python-docx`.
   - Transcript (`.txt`, `.vtt`, `.srt`) → normalize, keep speaker labels.
   - Audio → STT provider → transcript (async, slowest path, ship last).
3. Save the extracted text with character offsets so each `ScopeItem.source_span` can highlight its source.

### 5.2 Scope extraction
- One LLM call per intake run. Pass the project metadata from screen 1 plus all document texts.
- Use **tool use with a strict JSON schema** that mirrors `ScopeItem` (category, text, source quote, confidence). Validate with Pydantic, and on validation failure retry once with the error message.
- Long inputs: chunk by document, extract per chunk, then run a merge/dedupe pass.
- Use prompt caching on the static system prompt and schema to cut cost and latency.

### 5.3 WBS generation and validation
- **Generate:** input = accepted scope items (deliverables become level-2 nodes, requirements drive level-3 work packages). Output = tree + duration estimates + required skills + suggested dependencies. Suggested dependencies are written as *suggestions* that the user confirms on screen 5.
- **Validate:** run deterministic checks first (cheap, reliable), then an LLM pass for semantic checks:
  - Deterministic: max depth 3, no empty deliverables, work packages without duration or owner, dependency cycles, orphans, duration sum vs timeline.
  - LLM: missing work (e.g. "no UAT before release", "no DR / backup"), likely duplicates, a scope item with no WBS coverage.
  - Output maps to the UI's `missing | duplicate | warning` issue types.

### 5.4 AI safety and quality
- **Prompt injection:** uploaded documents are untrusted. Wrap them in clear delimiters and tell the model they are data, not instructions. The model only ever returns structured data and has no tools with side effects.
- **PII / confidentiality:** projects marked `Confidential` may need a policy switch (e.g. no third-party LLM, or redaction first). Decide this with stakeholders.
- **Evals:** a `tests/ai_eval/` folder with ~20 golden intake documents plus expected scope items, scored on precision/recall per category. Run it in CI when prompts change. Without this, prompt edits are guesswork.
- **Cost tracking:** store input/output tokens and model per `IntakeRun`. Show usage per org.

---

## 6. Optimization engine

This part is hardest to get right, so it gets the most design attention.

### 6.1 Problem framing
It is a **resource-constrained project scheduling problem (RCPSP) with multi-skill assignment**, solved as a time-indexed MILP on a **weekly grid** (38 weeks ≈ 40 buckets keeps it small and fast).

**Sets:** tasks *T* (level-3 WBS nodes), resources *R* (employees + optional contractor "slots"), weeks *W*, skills *S*.

**Decision variables**
- `x[t,w] ∈ {0,1}`: task *t* starts in week *w*
- `y[t,r] ∈ {0,1}`: resource *r* is assigned to task *t* (allow 1..k resources per task for parallelization)
- `h[t,r,w] ≥ 0`: hours *r* works on *t* in week *w*
- `hire[c] ∈ {0,1}`: contractor slot *c* is used
- Slack variables for every soft constraint: `late_days`, `over_budget`, `over_capacity[r,w]`

**Constraints**
- Each task starts exactly once. Its total effort gets covered over its duration.
- Precedence for FS/SS/FF/SF with lag, from the `dependencies` table.
- Capacity: Σ hours of *r* in week *w* ≤ availability − **existing cross-project allocation** (+ `over_capacity` slack if soft).
- Skills: an assigned resource must have every required skill for the task (hard) or pay a penalty (soft).
- Budget: labor Σ(hours × rate) + contractor cost + infra ≤ cap (+ slack if soft). Enforce the labor and infra sub-caps separately.
- Deadline and milestones: task finish ≤ milestone week (+ `late_days` slack if soft).

**Objective** (weighted, with weights from `constraint_sets`)
```
min  cost
   + λ_deadline · late_days
   + λ_budget   · over_budget
   + λ_capacity · Σ over_capacity
   + λ_change   · Σ deviation from baseline plan     ← keeps recommendations minimal and explainable
```
The last term matters: without it, the solver may reshuffle every task for a 0.1% gain, and PMs will reject the plan.

### 6.2 Solver adapter
```python
class SolverAdapter(Protocol):
    def solve(self, model: PlanningModel, time_limit_s: int, mip_gap: float) -> SolveResult: ...

class GurobiAdapter(SolverAdapter): ...   # production
class CpSatAdapter(SolverAdapter): ...    # dev/CI fallback, same PlanningModel input
```
`PlanningModel` is a pure dataclass built from the `input_snapshot`, so model building is unit-testable without a solver.

Defaults: `TimeLimit=60s`, `MIPGap=1%`, `Threads` capped per worker. Report progress via Gurobi's callback → Redis → SSE.

Pick the solver with config: `SOLVER=gurobi|cpsat|auto`. `auto` tries Gurobi and falls back to CP-SAT if no license is found. It logs a warning and records the solver used on the `OptimizationRun`, so results always show which engine produced them.

### 6.3 Infeasibility handling
When the model has no solution:
1. Run `model.computeIIS()` and map the conflicting constraints back to human terms ("Budget cap $375K", "SAP skill required on 1.1.2", "Deadline Sep 30").
2. Automatically re-solve a **relaxed** version in which hard constraints become soft with high penalties. This gives the "what it would take" answer the UI shows ("contract one SAP specialist, est. $28K, otherwise +6 weeks").
3. Store both results. The UI shows the relaxed plan with a clear "infeasible as specified" banner.

### 6.4 Explanations ("Reason" column)
Compute them rule-based first, from the diff between baseline and optimized plans:
- Moved later because a predecessor moved → "Dependency cascade from {pred}"
- Reassigned from a resource with >100% utilization → "Over-allocation"
- Assigned to a contractor because no employee has the skill → "Skill gap"
- Task split across 2 resources → "Parallelization reduces duration by N weeks"

Optionally, an LLM pass rewrites these into friendlier sentences. It **never** invents reasons, it only rephrases the structured facts.

### 6.5 Baseline plan
"Before optimization" numbers need a baseline. Compute one with a simple forward-pass schedule (earliest start, current owners, no leveling) whenever WBS + constraints are saved. It also provides the critical path (CPM) for the "Critical Path" KPI.

### 6.6 Using the student (academic) Gurobi license

The academic license removes Gurobi's size limits, but it has conditions that affect how the backend runs:

| License type | Where it works | Use it for |
|--------------|----------------|------------|
| **Named-user academic** (`grbgetkey`) | Only your own machine; activation must happen on the university network or VPN | Local development and running the worker directly on your laptop (not in Docker) |
| **Academic WLS** (Web License Service), requested separately from the Gurobi portal | Containers and cloud VMs, through a `gurobi.lic` with `WLSACCESSID` / `WLSSECRET` / `LICENSEID` | Running the worker in docker-compose or a hosted demo |
| Restricted pip license (built into `pip install gurobipy`) | Anywhere | **Not enough.** It caps models at 2,000 variables/constraints, and the demo project alone needs ~4,000 (14 tasks × 6 resources × ~40 weeks for `h[t,r,w]`) |

**Setup plan**
1. Local dev: install the named-user license on your laptop (`grbgetkey <key>` while on Northeastern's network/VPN). Run the worker natively (`python -m app.jobs.worker`), and keep Postgres/Redis in docker-compose.
2. Docker/hosted demo: request an **Academic WLS** license. Mount `gurobi.lic` into the worker container through a Docker secret (`GRB_LICENSE_FILE=/run/secrets/gurobi.lic`). Never commit it.
3. Teammates and CI: use `SOLVER=cpsat`. Each teammate who is a student can also get their own academic license, since these licenses are per person and can't be shared.
4. Renew yearly: academic licenses expire. Add a startup health check that logs the license expiry date.

**Usage limits (important)**
- The academic license covers **coursework, research, and non-commercial demos only**. If this becomes a commercial product, you'll need a commercial Gurobi license, or you'll have to switch the default to CP-SAT (the adapter makes this a config change).
- Don't run a public multi-user SaaS on your personal license. A hosted demo for classes, advisors, or a portfolio is fine. Paying customers are not.

---

## 7. Security and compliance

- **Passwords:** argon2id; lockout + rate limiting on `/auth/login`.
- **Tokens:** short-lived access JWT (15 min) + rotating refresh token in an `httpOnly; Secure; SameSite=Lax` cookie. No tokens in `localStorage`.
- **RBAC:** roles `org_admin`, `pm`, `contributor`, `viewer`. Permission checks sit in a single dependency layer, not scattered through handlers. Project `visibility=Confidential` limits reads to explicit members.
- **Tenant isolation:** every query is scoped by `org_id`. Add a test that tries cross-org access on every endpoint.
- **Uploads:** size and MIME validation, virus scan, private bucket, short-lived signed URLs.
- **Audit log:** append-only `audit_events` for scope accept/edit/remove, WBS edits, constraint changes, and plan applied. This is also a selling point for enterprise customers.
- **Secrets:** env vars locally, a secrets manager in production. Keep the Gurobi license and LLM API key out of the repo.
- **OWASP basics:** CORS allow-list, security headers, parameterized SQL (ORM), dependency scanning (pip-audit, Dependabot).

---

## 8. Non-functional requirements

| Area | Target |
|------|--------|
| API latency (CRUD) | p95 < 200 ms |
| Intake analysis | < 60 s for ~20 pages of text; progress visible via SSE |
| Optimization | < 60 s for ≤ 200 tasks / 30 resources / 52 weeks; configurable time limit |
| Availability | 99.5% (single region is fine to start) |
| Backups | Daily Postgres snapshots + PITR; S3 versioning |
| Observability | Every job has a trace ID; dashboards for queue depth, job duration, LLM tokens, solver status mix |

---

## 9. Testing strategy

- **Unit:** WBS code computation, cycle detection, CPM / baseline schedule, `PlanningModel` builder, explanation rules, permission checks.
- **Solver tests:** small hand-built instances with known optimal answers, run on CP-SAT in CI (no license on GitHub runners) and on Gurobi locally with `pytest -m gurobi` before merging solver changes. Include a known-infeasible case to check IIS mapping.
- **Integration:** pytest + Testcontainers (real Postgres + Redis). The LLM is mocked with recorded fixtures.
- **Contract:** generate the TS client from OpenAPI in CI; the frontend build fails if the contract breaks.
- **AI evals:** golden-set scoring (§5.4), run when prompts change.
- **E2E:** Playwright through the full 6-step flow against docker-compose.

**CI (GitHub Actions):** lint (ruff) → type check (mypy/pyright) → unit → integration → build image → OpenAPI diff check.

---

## 10. Frontend changes the backend requires

The backend alone won't make the screens work. These frontend changes come with it:

1. **Routing:** replace `useState<Screen>` with `react-router`: `/projects/:id/intake`, `/projects/:id/scope`, and so on. The project ID then survives reloads and can be shared.
2. **Data layer:** TanStack Query + an API client generated from OpenAPI (`openapi-typescript` or `orval`).
3. **Auth context:** a `/me`-driven user in `Shell.tsx` (replaces "Jane Doe / JD"), plus a route guard.
4. **Controlled forms:** CreateProject and Constraints currently use `defaultValue`. Switch to controlled inputs or `react-hook-form` + zod, validated against the same rules as the backend.
5. **Job UX:** a shared `useJob(runId)` hook that listens to SSE and falls back to polling. Used by Analyze, WBS generate/validate, Optimize, and Export.
6. **Remove the mock constants** (`PROJECTS`, `INITIAL`, `INITIAL_WBS`, `EMPLOYEES`, `DEPS`, `REASSIGNMENTS`, …). Move them into a **backend seed script** so the demo data still exists.
7. Dev proxy: add `server.proxy['/api'] → http://localhost:8000` in `vite.config.ts`.

---

## 11. Delivery roadmap

Estimates assume 1–2 backend developers. Every phase ends with something demoable.

### Phase 0 — Foundations (week 1)
- `backend/` scaffold, docker-compose (api, worker, postgres, redis, minio), config, logging, error model
- Alembic baseline, CI pipeline, pre-commit (ruff, mypy)
- Seed script with the prototype's demo data
- ✅ *Exit:* `docker compose up` → `/health` green, and CI green

### Phase 1 — Auth, projects, dashboard (weeks 2–3)
- Users, orgs, memberships, email/password login, JWT + refresh, RBAC skeleton
- Project CRUD + draft, dashboard summary, project list with filter, notifications table (manual for now)
- Frontend: router, API client, auth guard, Dashboard + Create Project wired
- ✅ *Exit:* real login → create a project → see it on the dashboard

### Phase 2 — Intake and scope review (weeks 4–6)
- Document upload (text, PDF, DOCX), text extraction, S3
- AI intake job + SSE progress, scope items persisted
- Scope review endpoints (accept / edit / remove / add / bulk accept) + audit log
- AI eval harness with the first 10 golden documents
- ✅ *Exit:* paste the sample meeting notes → real extracted scope → edits persist across reloads

### Phase 3 — WBS (weeks 7–8)
- WBS tree CRUD, move/reorder, computed codes, summary stats
- AI WBS generation from accepted scope, deterministic + AI validation
- CSV/XLSX export
- ✅ *Exit:* generate a WBS from scope, edit it, and validation issues reflect the real tree

### Phase 4 — Resources and constraints (weeks 9–10)
- Employee pool, skills, availability, cross-project allocations
- Constraint set + milestones + dependencies (with cycle detection), skills coverage
- Baseline schedule + critical path computation
- ✅ *Exit:* the Constraints screen is fully live, and the baseline "before" numbers are computed

### Phase 5 — Optimization (weeks 11–14) — *largest risk; start the spike in Phase 3*
- `PlanningModel` builder, CP-SAT adapter first (no license dependency), then the Gurobi adapter
- Hard/soft handling, IIS + relaxed re-solve, explanation rules, baseline diff
- Results endpoints, SSE progress, "Apply plan" writes allocations and updates project status/risk
- ✅ *Exit:* the demo project produces a real optimal plan, and an infeasible configuration returns a clear explanation

### Phase 6 — Exports, SSO, notifications, hardening (weeks 15–16)
- PDF report (WeasyPrint) and MS Project XML export
- OIDC SSO, password reset email
- Auto-generated notifications (resource conflict, deadline at risk, optimization done, milestone due)
- Load test, security review, backup/restore drill, production deploy
- ✅ *Exit:* production-ready v1

### Later (v1.1+)
Audio STT intake · OCR for scanned PDFs · real-time collaboration on the WBS · what-if scenarios (compare multiple optimization runs side by side) · Jira/Asana sync · actual-vs-plan progress tracking.

---

## 12. Risks and open questions

| # | Risk / question | Impact | Mitigation / decision needed |
|---|-----------------|--------|------------------------------|
| 1 | **Gurobi licensing:** we have a student academic license. It works for development and non-commercial demos, but not for commercial production or Docker (named-user) | Medium | Named-user license for local dev, Academic WLS for containers (§6.6), CP-SAT for CI/teammates. Revisit if the project goes commercial. |
| 2 | Optimization model too slow or too large for real projects | High | Weekly buckets, time limits, a warm start from the baseline, and an early spike on a 200-task instance |
| 3 | LLM extraction quality varies by document style | Medium | Golden-set evals, the human review step (screen 3 exists for this), confidence scores |
| 4 | Confidential project data sent to a third-party LLM | Medium | Policy per visibility level; review the data-processing agreement; redaction option |
| 5 | Where do employee rates and availability come from? HRIS integration or manual entry? | Medium | **Needs a product decision.** v1 = manual + CSV import |
| 6 | Should `progress_pct` / On Track / At Risk be computed or entered manually? | Medium | **Needs a product decision.** Proposal: computed from applied plan vs. today + manual override |
| 7 | Multi-tenant SaaS or single-company deployment? | Medium | Design is multi-tenant from day 1 (cheap now, expensive to add later) |
| 8 | Hosting target (AWS / Azure / GCP / Render / Fly) | Low | Containers keep this open. Pick before Phase 6. |

---

## 13. Immediate next steps

1. Answer the open questions in §12 (especially #5, #6). Install the Gurobi named-user license locally and request an Academic WLS license if you want Docker/hosted runs (§6.6).
2. Approve the stack in §2.1, or tell me what to change (e.g. if the team prefers Node/NestJS, the plan still holds, but the optimizer becomes a separate Python service).
3. Start Phase 0: scaffold `backend/`, docker-compose, CI, and the seed data.
4. In parallel, run a **2–3 day optimization spike** with the prototype's demo data (14 work packages, 5 employees, the 5 dependencies) to validate the MILP formulation before building the rest around it.
