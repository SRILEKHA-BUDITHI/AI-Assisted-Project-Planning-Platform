"""Schema behaviour: camelCase on the wire, snake_case towards the database."""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.domain.me import MeUpdate
from app.domain.projects import ProjectCreate, ProjectUpdate
from app.repositories.tables import projects


def test_create_values_use_column_names() -> None:
    body = ProjectCreate.model_validate(
        {"name": "X", "pmUserId": str(uuid.uuid4()), "budgetCents": 5, "targetEndDate": None}
    )
    values = body.values()
    assert set(values) <= set(projects.c.keys())
    assert values["budget_cents"] == 5


def test_update_changes_use_column_names_and_only_set_fields() -> None:
    body = ProjectUpdate.model_validate({"currentStep": "wbs", "progressPct": 10, "sponsor": ""})
    assert body.changes() == {"current_step": "wbs", "progress_pct": 10, "sponsor": None}
    assert set(body.changes()) <= set(projects.c.keys())


def test_update_rejects_null_for_required_columns() -> None:
    with pytest.raises(ValidationError, match="cannot be null"):
        ProjectUpdate.model_validate({"status": None})


def test_me_update_changes() -> None:
    assert MeUpdate.model_validate({"fullName": "A", "jobTitle": ""}).changes() == {
        "full_name": "A",
        "job_title": None,
    }
