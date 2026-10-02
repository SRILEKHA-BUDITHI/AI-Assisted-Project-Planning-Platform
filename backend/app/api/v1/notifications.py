from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import NotificationId, Notifications
from app.core.errors import NotFoundError
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, Cursor
from app.core.security import CurrentPrincipal
from app.domain.common import Page
from app.domain.notifications import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=Page[Notification], summary="List my notifications")
async def list_notifications(
    principal: CurrentPrincipal,
    notifications: Notifications,
    unread: Annotated[
        bool | None, Query(description="true = unread only, false = read only")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
) -> Page[Notification]:
    items, next_cursor = await notifications.list_page(
        principal.user_id,
        unread=unread,
        limit=limit,
        cursor=Cursor.decode(cursor) if cursor else None,
    )
    return Page[Notification](
        items=items, next_cursor=next_cursor.encode() if next_cursor else None
    )


@router.post(
    "/{notificationId}/read",
    response_model=Notification,
    summary="Mark a notification as read (idempotent)",
)
async def mark_notification_read(
    notification_id: NotificationId, principal: CurrentPrincipal, notifications: Notifications
) -> Notification:
    if not await notifications.mark_read(notification_id, principal.user_id):
        raise NotFoundError("Notification not found")
    notification = await notifications.get(notification_id)
    if notification is None:
        raise NotFoundError("Notification not found")
    return notification
