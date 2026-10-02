"""Repository providers. Tests override these to swap in fakes."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Path

from app.core.db import UserDB
from app.repositories.me import ProfileRepository
from app.repositories.notifications import NotificationRepository
from app.repositories.orgs import OrgRepository
from app.repositories.projects import ProjectRepository


def get_profile_repo(db: UserDB) -> ProfileRepository:
    return ProfileRepository(db)


def get_org_repo(db: UserDB) -> OrgRepository:
    return OrgRepository(db)


def get_project_repo(db: UserDB) -> ProjectRepository:
    return ProjectRepository(db)


def get_notification_repo(db: UserDB) -> NotificationRepository:
    return NotificationRepository(db)


Profiles = Annotated[ProfileRepository, Depends(get_profile_repo)]
Orgs = Annotated[OrgRepository, Depends(get_org_repo)]
Projects = Annotated[ProjectRepository, Depends(get_project_repo)]
Notifications = Annotated[NotificationRepository, Depends(get_notification_repo)]

# Path parameters are camelCase on the wire, like everything else.
OrgId = Annotated[uuid.UUID, Path(alias="orgId")]
ProjectId = Annotated[uuid.UUID, Path(alias="projectId")]
NotificationId = Annotated[uuid.UUID, Path(alias="notificationId")]
