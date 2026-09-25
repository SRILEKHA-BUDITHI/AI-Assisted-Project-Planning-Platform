"""SQLAlchemy Core mappings of the existing Supabase tables.

The schema is owned by `supabase/migrations`; these definitions only describe
the columns the API reads/writes. Never call `metadata.create_all()`.
"""

from __future__ import annotations

from enum import StrEnum

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID

from app.domain.common import (
    NotificationLevel,
    OrgRole,
    ProjectMethodology,
    ProjectPriority,
    ProjectStatus,
    ProjectStep,
    ProjectType,
    ProjectVisibility,
)

metadata = sa.MetaData(schema="public")


def _pg_enum(enum_cls: type[StrEnum], name: str) -> ENUM:
    return ENUM(
        enum_cls,
        name=name,
        schema="public",
        create_type=False,
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
    )


org_role = _pg_enum(OrgRole, "org_role")
project_type = _pg_enum(ProjectType, "project_type")
project_priority = _pg_enum(ProjectPriority, "project_priority")
project_methodology = _pg_enum(ProjectMethodology, "project_methodology")
project_visibility = _pg_enum(ProjectVisibility, "project_visibility")
project_status = _pg_enum(ProjectStatus, "project_status")
project_step = _pg_enum(ProjectStep, "project_step")
notification_level = _pg_enum(NotificationLevel, "notification_level")

_uuid = UUID(as_uuid=True)
_ts = sa.DateTime(timezone=True)

profiles = sa.Table(
    "profiles",
    metadata,
    sa.Column("id", _uuid, primary_key=True),
    sa.Column("email", sa.Text, nullable=False),  # citext
    sa.Column("full_name", sa.Text),
    sa.Column("avatar_url", sa.Text),
    sa.Column("job_title", sa.Text),
    sa.Column("created_at", _ts, nullable=False),
    sa.Column("updated_at", _ts, nullable=False),
)

organizations = sa.Table(
    "organizations",
    metadata,
    sa.Column("id", _uuid, primary_key=True),
    sa.Column("name", sa.Text, nullable=False),
    sa.Column("slug", sa.Text, nullable=False),  # citext
    sa.Column("created_by", _uuid),
    sa.Column("created_at", _ts, nullable=False),
    sa.Column("updated_at", _ts, nullable=False),
)

organization_members = sa.Table(
    "organization_members",
    metadata,
    sa.Column("org_id", _uuid, primary_key=True),
    sa.Column("user_id", _uuid, primary_key=True),
    sa.Column("role", org_role, nullable=False),
    sa.Column("created_at", _ts, nullable=False),
)

projects = sa.Table(
    "projects",
    metadata,
    sa.Column("id", _uuid, primary_key=True),
    sa.Column("org_id", _uuid, nullable=False),
    sa.Column("code", sa.Text, nullable=False),
    sa.Column("name", sa.Text, nullable=False),
    sa.Column("description", sa.Text),
    sa.Column("type", project_type, nullable=False),
    sa.Column("department", sa.Text),
    sa.Column("sponsor", sa.Text),
    sa.Column("pm_user_id", _uuid),
    sa.Column("priority", project_priority, nullable=False),
    sa.Column("methodology", project_methodology, nullable=False),
    sa.Column("visibility", project_visibility, nullable=False),
    sa.Column("start_date", sa.Date),
    sa.Column("target_end_date", sa.Date),
    sa.Column("budget_cents", sa.BigInteger),
    sa.Column("currency", sa.CHAR(3), nullable=False),
    sa.Column("status", project_status, nullable=False),
    sa.Column("current_step", project_step, nullable=False),
    sa.Column("progress_pct", sa.SmallInteger, nullable=False),
    sa.Column("created_by", _uuid),
    sa.Column("created_at", _ts, nullable=False),
    sa.Column("updated_at", _ts, nullable=False),
    sa.Column("archived_at", _ts),
)

notifications = sa.Table(
    "notifications",
    metadata,
    sa.Column("id", _uuid, primary_key=True),
    sa.Column("user_id", _uuid, nullable=False),
    sa.Column("org_id", _uuid, nullable=False),
    sa.Column("project_id", _uuid),
    sa.Column("level", notification_level, nullable=False),
    sa.Column("message", sa.Text, nullable=False),
    sa.Column("read_at", _ts),
    sa.Column("created_at", _ts, nullable=False),
)
