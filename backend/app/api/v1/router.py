from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import dashboard, me, notifications, orgs, projects

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(me.router)
api_router.include_router(orgs.router)
api_router.include_router(projects.router)
api_router.include_router(dashboard.router)
api_router.include_router(notifications.router)
