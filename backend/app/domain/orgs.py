from __future__ import annotations

import uuid
from datetime import datetime

from app.domain.common import CamelModel, OrgRole


class OrgMember(CamelModel):
    user_id: uuid.UUID
    role: OrgRole
    email: str | None
    full_name: str | None
    avatar_url: str | None
    job_title: str | None
    joined_at: datetime
