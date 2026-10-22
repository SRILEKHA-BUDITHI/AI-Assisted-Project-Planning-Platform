from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Request, Response, status

from app.api.deps import Intaker, Intakes, ItemId, ProjectId
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.domain.intake import IntakeRun, IntakeRunCreate, ScopeItem, ScopeItemUpdate
from app.jobs.intake import RESTART_ERROR

router = APIRouter(tags=["intake"])

ACTIVE_RUN_DETAIL = "AI intake is already running for this project."


@router.post(
    "/projects/{projectId}/intake/runs",
    response_model=IntakeRun,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Analyze pasted project notes (extracted in the background)",
)
async def create_run(
    project_id: ProjectId,
    body: IntakeRunCreate,
    request: Request,
    response: Response,
    background: BackgroundTasks,
    runs: Intakes,
    intaker: Intaker,
) -> IntakeRun:
    if not await runs.project_exists(project_id):
        raise NotFoundError("Project not found")
    if not await runs.can_write(project_id):
        raise ForbiddenError("You do not have permission to analyze this project")

    stale_after_s = request.app.state.settings.intake_stale_after_s
    active = await runs.active_run(project_id, stale_after_s)
    if active is not None:
        if not active.stale:
            raise ConflictError(ACTIVE_RUN_DETAIL)
        await runs.fail_run(active.id, RESTART_ERROR)  # orphaned by a restart

    run_id = await runs.create(project_id, body.text)
    run = await runs.get(project_id, run_id)
    if run is None:
        raise ForbiddenError("The run was created but is not visible to you")

    # Background tasks run after the response, i.e. after the transaction has
    # committed, so the worker always finds the queued row.
    background.add_task(intaker.submit, run_id)
    response.headers["Location"] = f"/api/v1/projects/{project_id}/intake/runs/{run_id}"
    return run


# Declared before /{runId} so "latest" isn't parsed as a run id.
@router.get(
    "/projects/{projectId}/intake/runs/latest",
    response_model=IntakeRun,
    summary="Latest intake run (404 when the project has none)",
)
async def latest_run(project_id: ProjectId, runs: Intakes) -> IntakeRun:
    run = await runs.latest(project_id)
    if run is None:
        raise NotFoundError("No intake runs yet")
    return run


@router.get(
    "/projects/{projectId}/scope-items",
    response_model=list[ScopeItem],
    summary="Scope items extracted (or added) for a project",
)
async def list_scope_items(project_id: ProjectId, runs: Intakes) -> list[ScopeItem]:
    if not await runs.project_exists(project_id):
        raise NotFoundError("Project not found")
    return await runs.list_scope_items(project_id)


@router.patch(
    "/scope-items/{itemId}",
    response_model=ScopeItem,
    summary="Accept, edit, or remove a scope item",
)
async def update_scope_item(item_id: ItemId, body: ScopeItemUpdate, runs: Intakes) -> ScopeItem:
    patch = body.model_dump(exclude_unset=True)
    item = await runs.update_item(item_id, patch)
    if item is None:
        raise NotFoundError("Scope item not found")
    return item
