"""Background runner: claim -> extract off-loop -> write items; failures and shutdown."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import anthropic
import pytest

from app.core.config import Settings
from app.jobs.intake import (
    EMPTY_ERROR,
    FAILED_ERROR,
    RESTART_ERROR,
    UNCONFIGURED_ERROR,
    IntakeRunner,
    _ExtractedItem,
    _Extraction,
    engine_store,
)


class FakeJobStore:
    def __init__(self, text: str = "Some notes") -> None:
        self.claimed: tuple[uuid.UUID, str] | None = (uuid.uuid4(), text)
        self.finished: list[tuple[uuid.UUID, uuid.UUID, str, list[dict[str, Any]], int, int]] = []
        self.failed: list[tuple[uuid.UUID, str]] = []
        self.stale = 0
        self.broken = False

    @asynccontextmanager
    async def __call__(self) -> AsyncIterator[FakeJobStore]:
        if self.broken:
            raise RuntimeError("db down")
        yield self

    async def claim(self, run_id: uuid.UUID) -> tuple[uuid.UUID, str] | None:
        claimed, self.claimed = self.claimed, None  # claim once
        return claimed

    async def finish(
        self,
        run_id: uuid.UUID,
        project_id: uuid.UUID,
        model: str,
        items: list[dict[str, Any]],
        input_tokens: int,
        output_tokens: int,
    ) -> None:
        self.finished.append((run_id, project_id, model, items, input_tokens, output_tokens))

    async def fail(self, run_id: uuid.UUID, error: str) -> None:
        self.failed.append((run_id, error))

    async def fail_stale(self, older_than_s: int, error: str) -> int:
        assert error == RESTART_ERROR
        return self.stale


def settings(with_key: bool = True) -> Settings:
    return Settings(  # type: ignore[call-arg]
        _env_file=None, anthropic_api_key="sk-test-key" if with_key else None
    )


async def _drain(runner: IntakeRunner) -> None:
    tasks = list(runner._tasks)
    if tasks:
        await asyncio.wait(tasks)


def _fake_extract(result: _Extraction, tokens: tuple[int, int] = (100, 50)):
    def extract(self: IntakeRunner, text: str) -> tuple[_Extraction, int, int]:
        return result, *tokens

    return extract


async def test_run_extracts_and_writes_items(monkeypatch: pytest.MonkeyPatch) -> None:
    result = _Extraction(
        items=[
            _ExtractedItem(category="objective", text="Ship the thing", confidence=0.9),
            _ExtractedItem(category="not_a_category", text="ignored", confidence=0.5),
            _ExtractedItem(category="risk", text="  ", confidence=0.5),  # blank, dropped
        ]
    )
    monkeypatch.setattr(IntakeRunner, "_extract", _fake_extract(result))
    store = FakeJobStore()
    runner = IntakeRunner(store, settings())  # type: ignore[arg-type]
    run_id = uuid.uuid4()
    await runner.submit(run_id)
    assert runner.active == 1
    await _drain(runner)
    ((rid, _pid, model, items, input_tokens, output_tokens),) = store.finished
    assert rid == run_id
    assert model == "claude-opus-5-5"
    assert items == [{"category": "objective", "text": "Ship the thing", "confidence": 0.9}]
    assert (input_tokens, output_tokens) == (100, 50)
    assert store.failed == []


async def test_run_not_queued_is_skipped() -> None:
    store = FakeJobStore()
    store.claimed = None
    runner = IntakeRunner(store, settings())  # type: ignore[arg-type]
    await runner.submit(uuid.uuid4())
    await _drain(runner)
    assert (store.finished, store.failed) == ([], [])


async def test_blank_notes_fail_without_calling_the_model(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(self: IntakeRunner, text: str) -> tuple[_Extraction, int, int]:
        raise AssertionError("should not be called")

    monkeypatch.setattr(IntakeRunner, "_extract", boom)
    store = FakeJobStore(text="   \n  ")
    runner = IntakeRunner(store, settings())  # type: ignore[arg-type]
    run_id = uuid.uuid4()
    await runner.submit(run_id)
    await _drain(runner)
    assert store.failed == [(run_id, EMPTY_ERROR)]


async def test_missing_api_key_fails_without_calling_the_model() -> None:
    store = FakeJobStore()
    runner = IntakeRunner(store, settings(with_key=False))  # type: ignore[arg-type]
    run_id = uuid.uuid4()
    await runner.submit(run_id)
    await _drain(runner)
    assert store.failed == [(run_id, UNCONFIGURED_ERROR)]


async def test_llm_error_fails_without_leaking(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(self: IntakeRunner, text: str) -> tuple[_Extraction, int, int]:
        raise anthropic.APIConnectionError(message="secret internals", request=object())  # type: ignore[arg-type]

    monkeypatch.setattr(IntakeRunner, "_extract", boom)
    store = FakeJobStore()
    runner = IntakeRunner(store, settings())  # type: ignore[arg-type]
    run_id = uuid.uuid4()
    await runner.submit(run_id)
    await _drain(runner)
    assert store.failed == [(run_id, FAILED_ERROR)]
    assert "secret" not in FAILED_ERROR


async def test_unexpected_crash_fails_without_leaking(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(self: IntakeRunner, text: str) -> tuple[_Extraction, int, int]:
        raise RuntimeError("secret internals")

    monkeypatch.setattr(IntakeRunner, "_extract", boom)
    store = FakeJobStore()
    runner = IntakeRunner(store, settings())  # type: ignore[arg-type]
    run_id = uuid.uuid4()
    await runner.submit(run_id)
    await _drain(runner)
    assert store.failed == [(run_id, FAILED_ERROR)]
    assert "secret" not in FAILED_ERROR


async def test_fail_swallows_db_errors() -> None:
    store = FakeJobStore()
    runner = IntakeRunner(store, settings())  # type: ignore[arg-type]
    store.broken = True
    await runner.submit(uuid.uuid4())
    await _drain(runner)  # the claim fails, then marking failed fails: both logged


async def test_recover_stale() -> None:
    store = FakeJobStore()
    store.stale = 2
    runner = IntakeRunner(store, settings())  # type: ignore[arg-type]
    assert await runner.recover_stale(180) == 2
    store.broken = True
    assert await runner.recover_stale(180) == 0
    assert await IntakeRunner(None, settings()).recover_stale(180) == 0


async def test_without_database_runs_stay_queued() -> None:
    runner = IntakeRunner(None, settings())
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


async def test_background_task_schedules_on_the_event_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    from starlette.background import BackgroundTasks

    result = _Extraction(items=[_ExtractedItem(category="risk", text="X", confidence=0.5)])
    monkeypatch.setattr(IntakeRunner, "_extract", _fake_extract(result))
    store = FakeJobStore()
    runner = IntakeRunner(store, settings())  # type: ignore[arg-type]
    tasks = BackgroundTasks()
    tasks.add_task(runner.submit, uuid.uuid4())
    await tasks()  # what Starlette does after sending the response
    await _drain(runner)
    assert len(store.finished) == 1
