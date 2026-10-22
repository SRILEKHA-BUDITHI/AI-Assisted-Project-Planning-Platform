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


# --- public.solver_status
class SolverStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    OPTIMAL = "optimal"
    FEASIBLE = "feasible"
    INFEASIBLE = "infeasible"
    TIMEOUT = "timeout"
    FAILED = "failed"


# --- public.dependency_type
class DependencyType(StrEnum):
    FS = "FS"
    SS = "SS"
    FF = "FF"
    SF = "SF"


# --- public.constraint_mode
class ConstraintMode(StrEnum):
    HARD = "hard"
    SOFT = "soft"


# --- public.recommendation_type
class RecommendationType(StrEnum):
    REASSIGNMENT = "reassignment"
    SCHEDULE_CHANGE = "schedule_change"
    HIRE = "hire"
    NOTE = "note"


# --- public.document_kind
class DocumentKind(StrEnum):
    TEXT = "text"
    PDF = "pdf"
    DOCX = "docx"
    TRANSCRIPT = "transcript"
    AUDIO = "audio"


# --- public.job_status
class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


# --- public.scope_category
class ScopeCategory(StrEnum):
    OBJECTIVE = "objective"
    REQUIREMENT = "requirement"
    DELIVERABLE = "deliverable"
    CONSTRAINT = "constraint"
    RISK = "risk"
    MISSING_INFO = "missing_info"


# --- public.scope_status
class ScopeStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REMOVED = "removed"


# --- public.item_origin
class ItemOrigin(StrEnum):
    AI = "ai"
    MANUAL = "manual"


class Page[T](CamelModel):
    items: list[T]
    next_cursor: str | None = None
