"""Shared schema primitives and Postgres enum mirrors.

Enum values must match the `public.*` enum types in `supabase/migrations`
exactly — the database is the source of truth.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base schema: camelCase on the wire, snake_case in Python."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
        from_attributes=True,
    )


class InputModel(CamelModel):
    """Request bodies: reject unknown fields and trim strings."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# --- public.org_role
class OrgRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    PM = "pm"
    MEMBER = "member"
    VIEWER = "viewer"


# --- public.project_type
class ProjectType(StrEnum):
    TECHNOLOGY = "technology"
    CONSTRUCTION = "construction"
    PRODUCT_DEVELOPMENT = "product_development"
    BUSINESS_PROCESS = "business_process"
    COMPLIANCE = "compliance"


# --- public.project_priority
class ProjectPriority(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# --- public.project_methodology
class ProjectMethodology(StrEnum):
    WATERFALL = "waterfall"
    AGILE = "agile"
    HYBRID = "hybrid"
    KANBAN = "kanban"


# --- public.project_visibility
class ProjectVisibility(StrEnum):
    INTERNAL = "internal"
    CLIENT_FACING = "client_facing"
    CONFIDENTIAL = "confidential"


# --- public.project_status
class ProjectStatus(StrEnum):
    DRAFT = "draft"
    PLANNING = "planning"
    ON_TRACK = "on_track"
    AT_RISK = "at_risk"
    DELAYED = "delayed"
    COMPLETED = "completed"
    ARCHIVED = "archived"


# --- public.project_step
class ProjectStep(StrEnum):
    CREATE = "create"
    INTAKE = "intake"
    SCOPE = "scope"
    WBS = "wbs"
    CONSTRAINTS = "constraints"
    OPTIMIZE = "optimize"
    DONE = "done"


# --- public.notification_level
class NotificationLevel(StrEnum):
    INFO = "info"
    WARN = "warn"
    ALERT = "alert"


class Page[T](CamelModel):
    items: list[T]
    next_cursor: str | None = None
