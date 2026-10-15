-- =====================================================================
-- Optimization runs: store the presentation-ready result and allow only
-- one active run per project.
--
--   result       : { kpis, reassignments, scheduleChanges, utilization }
--                  computed by the OR-Tools worker from the run's
--                  input_snapshot. Written only by the backend's service
--                  connection; readable through the existing
--                  "optimization_runs: project readers can read" policy.
--   infeasibility: (existing column) list of { name, explanation } for the
--                  hard constraints that cannot hold together.
-- =====================================================================

alter table public.optimization_runs
  add column if not exists result jsonb;

comment on column public.optimization_runs.result is
  'Solver output for the UI: kpis, reassignments, scheduleChanges, utilization. Null until the run finishes.';
comment on column public.optimization_runs.infeasibility is
  'When status = infeasible: [{ name, explanation }] for the conflicting hard constraints.';

-- At most one queued/running run per project, so double-clicks or two
-- teammates can't start parallel solves.
create unique index if not exists optimization_runs_one_active_per_project
  on public.optimization_runs (project_id)
  where status in ('queued', 'running');
