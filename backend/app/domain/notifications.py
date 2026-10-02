from __future__ import annotations

import uuid
from datetime import datetime

from app.domain.common import CamelModel, NotificationLevel


class Notification(CamelModel):
    id: uuid.UUID
    org_id: uuid.UUID
    project_id: uuid.UUID | None
    level: NotificationLevel
    message: str
    read_at: datetime | None
    created_at: datetime
