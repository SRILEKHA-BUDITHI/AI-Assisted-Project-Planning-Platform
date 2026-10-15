"""Background runner: claim -> solve off-loop -> write outcome; failures and shutdown."""

from __future__ import annotations

import asyncio
import threading
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import pytest

from app.core.config import Settings
from app.jobs import optimizer as jobs
from app.jobs.optimizer import (
    FAILED_ERROR,
    RESTART_ERROR,
    SNAPSHOT_ERROR,
    OptimizationRunner,
    engine_store,
)
from app.optimization.explain import Report
from app.optimization.solver import SolveControl
from tests.test_optimization_solver import make_input


class FakeJobStore:
    def __init__(self) -> None:
        self.snapshot: dict[str, Any] | None = make_input().to_snapshot()
        self.finished: list[tuple[uuid.UUID, Report]] = []
        self.failed: list[tuple[uuid.UUID, str]] = []
        self.stale = 0
        self.broken = False

    @asynccontextmanager
    async def __call__(self) -> AsyncIterator[FakeJobStore]:
        if self.broken:
            raise RuntimeError("db down")
        yield self

    async def claim(self, run_id: uuid.UUID) -> dict[str, Any] | None:
        snap, self.snapshot = self.snapshot, None  # claim once
        return snap

    async def finish(self, run_id: uuid.UUID, report: Report) -> None:
        self.finished.append((run_id, report))

    async def fail(self, run_id: uuid.UUID, error: str) -> None:
        self.failed.append((run_id, error))

    async def fail_stale(self, older_than_s: int, error: str) -> int:
        assert error == RESTART_ERROR
        return self.stale


def settings() -> Settings:
    return Settings(_env_file=None, optimizer_time_limit_s=5, optimizer_workers=2)  # type: ignore[call-arg]


async def _drain(runner: OptimizationRunner) -> None:
    tasks = list(runner._tasks)
    if tasks:
        await asyncio.wait(tasks)


async def test_run_solves_and_writes_report() -> None:
    store = FakeJobStore()
    runner = OptimizationRunner(store, settings())  # type: ignore[arg-type]
    run_id = uuid.uuid4()
    await runner.submit(run_id)
    assert runner.active == 1
    await _drain(runner)
    ((rid, report),) = store.finished
    assert rid == run_id
    assert report.status == "optimal"
    assert report.result is not None
    assert store.failed == []


async def test_run_not_queued_is_skipped() -> None:
    store = FakeJobStore()
    store.snapshot = None
    runner = OptimizationRunner(store, settings())  # type: ignore[arg-type]
    await runner.submit(uuid.uuid4())
    await _drain(runner)
    assert (store.finished, store.failed) == ([], [])


async def test_bad_snapshot_fails_safely() -> None:
    store = FakeJobStore()
    store.snapshot = {"version": 0}
    runner = OptimizationRunner(store, settings())  # type: ignore[arg-type]
    run_id = uuid.uuid4()
    await runner.submit(run_id)
    await _drain(runner)
    assert store.failed == [(run_id, SNAPSHOT_ERROR)]


async def test_solver_crash_fails_without_leaking(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*args: Any) -> None:
        raise RuntimeError("secret internals")

    monkeypatch.setattr(jobs, "solve", boom)
    store = FakeJobStore()
    runner = OptimizationRunner(store, settings())  # type: ignore[arg-type]
    run_id = uuid.uuid4()
    await runner.submit(run_id)
    await _drain(runner)
    assert store.failed == [(run_id, FAILED_ERROR)]
    assert "secret" not in FAILED_ERROR


async def test_shutdown_stops_solver_and_records_restart(monkeypatch: pytest.MonkeyPatch) -> None:
    started = threading.Event()

    def slow(inp: Any, options: Any, control: SolveControl) -> None:
        started.set()
        while not control.stopped:
            threading.Event().wait(0.01)
        raise RuntimeError("stopped")

    monkeypatch.setattr(jobs, "solve", slow)
    store = FakeJobStore()
    runner = OptimizationRunner(store, settings())  # type: ignore[arg-type]
    run_id = uuid.uuid4()
    await runner.submit(run_id)
    await asyncio.to_thread(started.wait, 5)
    await runner.shutdown(timeout_s=5)
    assert store.failed == [(run_id, RESTART_ERROR)]
    await runner.submit(uuid.uuid4())  # closing: ignored
    assert runner.active == 0


async def test_fail_swallows_db_errors() -> None:
    store = FakeJobStore()
    runner = OptimizationRunner(store, settings())  # type: ignore[arg-type]
    store.broken = True
    await runner.submit(uuid.uuid4())
    await _drain(runner)  # the claim fails, then marking failed fails: both logged


async def test_recover_stale() -> None:
    store = FakeJobStore()
    store.stale = 2
    runner = OptimizationRunner(store, settings())  # type: ignore[arg-type]
    assert await runner.recover_stale() == 2
    store.broken = True
    assert await runner.recover_stale() == 0
    assert await OptimizationRunner(None, settings()).recover_stale() == 0


async def test_without_database_runs_stay_queued() -> None:
    runner = OptimizationRunner(None, settings())
    await runner.submit(uuid.uuid4())
    assert runner.active == 0
    await runner.shutdown()


async def test_engine_store_uses_a_transaction() -> None:
    log: list[str] = []

    class Engine:
        @asynccontextmanager
        async def begin(self) -> AsyncIterator[str]:
            log.append("begin")
            yield "conn"
            log.append("commit")

    async with engine_store(Engine())() as store:  # type: ignore[arg-type]
        assert store._conn == "conn"  # type: ignore[comparison-overlap]
    assert log == ["begin", "commit"]


def test_stale_setting_must_exceed_solve_time() -> None:
    with pytest.raises(ValueError, match="OPTIMIZER_STALE_AFTER_S"):
        Settings(_env_file=None, optimizer_time_limit_s=100, optimizer_stale_after_s=150)  # type: ignore[call-arg]


async def test_background_task_schedules_on_the_event_loop() -> None:
    from starlette.background import BackgroundTasks

    store = FakeJobStore()
    runner = OptimizationRunner(store, settings())  # type: ignore[arg-type]
    tasks = BackgroundTasks()
    tasks.add_task(runner.submit, uuid.uuid4())
    await tasks()  # what Starlette does after sending the response
    await _drain(runner)
    assert len(store.finished) == 1
