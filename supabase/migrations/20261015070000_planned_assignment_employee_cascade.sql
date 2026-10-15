-- =====================================================================
-- Fix: deleting an employee (or an organization / user account, which
-- cascades to employees) failed when that employee appeared in an
-- optimizer plan. `planned_assignments.employee_id` was ON DELETE SET NULL,
-- which violated planned_assignments_check1 (employee or contractor label
-- required).
--
-- Planned assignments are derived rows; the run's `result` jsonb and
-- `input_snapshot` keep the historical plan. So assignments for a deleted
-- employee are deleted with them.
-- =====================================================================

alter table public.planned_assignments
  drop constraint planned_assignments_employee_id_fkey,
  add constraint planned_assignments_employee_id_fkey
    foreign key (employee_id) references public.employees (id) on delete cascade;
