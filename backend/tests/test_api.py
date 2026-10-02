"""Endpoint behaviour with real JWT verification and in-memory repositories."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.domain.common import NotificationLevel, OrgRole
from app.domain.notifications import Notification
from tests.conftest import Store, TokenFactory

Auth = Callable[[uuid.UUID], dict[str, str]]


def _setup(store: Store) -> tuple[uuid.UUID, uuid.UUID]:
    user = store.add_user("Jane Doe")
    org = store.add_org(user, "Acme")
    return user, org


def _create(client: TestClient, auth: Auth, user: uuid.UUID, org: uuid.UUID, **body: object):  # type: ignore[no-untyped-def]
    payload = {"name": "CRM Migration", **body}
    return client.post(f"/api/v1/orgs/{org}/projects", json=payload, headers=auth(user))


# --------------------------------------------------------------------------- auth
def test_requires_bearer_token(client: TestClient) -> None:
    r = client.get("/api/v1/me")
    assert r.status_code == 401
    assert r.headers["www-authenticate"].startswith("Bearer")
    assert r.headers["content-type"] == "application/problem+json"


def test_rejects_invalid_token(client: TestClient, make_token: TokenFactory) -> None:
    r = client.get("/api/v1/me", headers={"Authorization": f"Bearer {make_token(aud='anon')}"})
    assert r.status_code == 401
    assert "Bearer" not in r.text  # token never echoed


# --------------------------------------------------------------------------- me
def test_get_me(client: TestClient, store: Store, auth: Auth) -> None:
    user, org = _setup(store)
    r = client.get("/api/v1/me", headers=auth(user))
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == str(user)
    assert body["fullName"] == "Jane Doe"
    assert set(body) == {"id", "email", "fullName", "avatarUrl", "jobTitle", "organizations"}
    assert body["organizations"] == [
        {"id": str(org), "name": "Acme", "slug": "acme", "role": "owner"}
    ]


def test_get_me_without_profile_is_404(client: TestClient, auth: Auth) -> None:
    assert client.get("/api/v1/me", headers=auth(uuid.uuid4())).status_code == 404


def test_patch_me(client: TestClient, store: Store, auth: Auth) -> None:
    user, _ = _setup(store)
    r = client.patch(
        "/api/v1/me", json={"fullName": "  Jane Q. Doe ", "jobTitle": "PMO"}, headers=auth(user)
    )
    assert r.status_code == 200
    assert r.json()["fullName"] == "Jane Q. Doe"
    assert r.json()["jobTitle"] == "PMO"


def test_patch_me_validation(client: TestClient, store: Store, auth: Auth) -> None:
    user, _ = _setup(store)
    assert client.patch("/api/v1/me", json={}, headers=auth(user)).status_code == 422
    r = client.patch("/api/v1/me", json={"email": "x@y.z"}, headers=auth(user))
    assert r.status_code == 422
    body = r.json()
    assert body["type"] == "urn:problem-type:validation-error"
    assert body["errors"][0]["loc"] == ["body", "email"]
    assert "input" not in body["errors"][0]
    r = client.patch("/api/v1/me", json={"jobTitle": "x" * 121}, headers=auth(user))
    assert r.status_code == 422


# --------------------------------------------------------------------------- projects
def test_create_and_get_project(client: TestClient, store: Store, auth: Auth) -> None:
    user, org = _setup(store)
    r = _create(
        client,
        auth,
        user,
        org,
        type="product_development",
        pmUserId=str(user),
        priority="high",
        methodology="agile",
        visibility="confidential",
        startDate="2026-10-01",
        targetEndDate="2027-03-31",
        budgetCents=37_500_000,
        currency="usd",
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert r.headers["location"] == f"/api/v1/projects/{body['id']}"
    assert body["code"] == "P-001"
    assert body["pmName"] == "Jane Doe"
    assert body["status"] == "draft"
    assert body["currentStep"] == "create"
    assert body["currency"] == "USD"
    assert body["budgetCents"] == 37_500_000
    assert body["createdBy"] == str(user)

    r = client.get(f"/api/v1/projects/{body['id']}", headers=auth(user))
    assert r.status_code == 200
    assert r.json()["name"] == "CRM Migration"


def test_create_project_validation(client: TestClient, store: Store, auth: Auth) -> None:
    user, org = _setup(store)
    bad = [
        {"startDate": "2026-10-01", "targetEndDate": "2026-09-01"},
        {"budgetCents": -1},
        {"type": "unknown"},
        {"currency": "US"},
        {"name": ""},
        {"status": "on_track"},  # not settable on create
    ]
    for body in bad:
        r = _create(client, auth, user, org, **body)
        assert r.status_code == 422, body


def test_create_project_pm_must_be_member(client: TestClient, store: Store, auth: Auth) -> None:
    user, org = _setup(store)
    r = _create(client, auth, user, org, pmUserId=str(uuid.uuid4()))
    assert r.status_code == 422
    assert "pmUserId" in r.json()["detail"]


def test_create_project_in_foreign_org_is_404(client: TestClient, store: Store, auth: Auth) -> None:
    user, _ = _setup(store)
    other_org = store.add_org(store.add_user("Bob Smith"), "Other")
    assert _create(client, auth, user, other_org).status_code == 404


def test_viewer_cannot_create(client: TestClient, store: Store, auth: Auth) -> None:
    _owner, org = _setup(store)
    viewer = store.add_user("Vic Viewer")
    store.members[(org, viewer)] = OrgRole.VIEWER
    r = _create(client, auth, viewer, org)
    assert r.status_code == 403  # RLS violation (42501) mapped


def test_list_projects_pagination_and_filters(client: TestClient, store: Store, auth: Auth) -> None:
    user, org = _setup(store)
    ids = [_create(client, auth, user, org, name=f"Project {i}").json()["id"] for i in range(5)]
    archived = ids[0]
    client.patch(f"/api/v1/projects/{archived}", json={"status": "archived"}, headers=auth(user))

    url = f"/api/v1/orgs/{org}/projects"
    r = client.get(url, params={"limit": 2}, headers=auth(user))
    page1 = r.json()
    assert [p["id"] for p in page1["items"]] == [ids[4], ids[3]]
    assert page1["nextCursor"]
    page2 = client.get(
        url, params={"limit": 2, "cursor": page1["nextCursor"]}, headers=auth(user)
    ).json()
    assert [p["id"] for p in page2["items"]] == [ids[2], ids[1]]
    assert page2["nextCursor"] is None  # archived one hidden by default

    r = client.get(url, params={"status": "archived"}, headers=auth(user))
    assert [p["id"] for p in r.json()["items"]] == [archived]

    r = client.get(url, params={"q": "project 3"}, headers=auth(user))
    assert [p["name"] for p in r.json()["items"]] == ["Project 3"]

    assert client.get(url, params={"cursor": "garbage"}, headers=auth(user)).status_code == 400
    assert client.get(url, params={"limit": 0}, headers=auth(user)).status_code == 422
    assert client.get(url, params={"status": "active"}, headers=auth(user)).status_code == 422


def test_list_projects_foreign_org_is_404(client: TestClient, store: Store, auth: Auth) -> None:
    user, _ = _setup(store)
    r = client.get(f"/api/v1/orgs/{uuid.uuid4()}/projects", headers=auth(user))
    assert r.status_code == 404


def test_patch_project(client: TestClient, store: Store, auth: Auth) -> None:
    user, org = _setup(store)
    pid = _create(client, auth, user, org, startDate="2026-10-01").json()["id"]
    r = client.patch(
        f"/api/v1/projects/{pid}",
        json={"status": "on_track", "currentStep": "scope", "progressPct": 40, "sponsor": None},
        headers=auth(user),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["status"], body["currentStep"], body["progressPct"]) == ("on_track", "scope", 40)

    # merged date validation against the stored startDate
    r = client.patch(
        f"/api/v1/projects/{pid}", json={"targetEndDate": "2026-01-01"}, headers=auth(user)
    )
    assert r.status_code == 422
    for bad in ({}, {"name": None}, {"progressPct": 101}, {"code": "P-999"}):
        r = client.patch(f"/api/v1/projects/{pid}", json=bad, headers=auth(user))
        assert r.status_code == 422, bad


def test_viewer_cannot_patch_or_delete(client: TestClient, store: Store, auth: Auth) -> None:
    owner, org = _setup(store)
    pid = _create(client, auth, owner, org).json()["id"]
    viewer = store.add_user("Vic Viewer")
    store.members[(org, viewer)] = OrgRole.VIEWER
    assert client.get(f"/api/v1/projects/{pid}", headers=auth(viewer)).status_code == 200
    r = client.patch(f"/api/v1/projects/{pid}", json={"name": "X"}, headers=auth(viewer))
    assert r.status_code == 403
    assert client.delete(f"/api/v1/projects/{pid}", headers=auth(viewer)).status_code == 403


def test_delete_project(client: TestClient, store: Store, auth: Auth) -> None:
    user, org = _setup(store)
    pid = _create(client, auth, user, org).json()["id"]
    r = client.delete(f"/api/v1/projects/{pid}", headers=auth(user))
    assert r.status_code == 204
    assert r.content == b""
    assert client.get(f"/api/v1/projects/{pid}", headers=auth(user)).status_code == 404
    assert client.delete(f"/api/v1/projects/{pid}", headers=auth(user)).status_code == 404


def test_project_invisible_to_outsider(client: TestClient, store: Store, auth: Auth) -> None:
    user, org = _setup(store)
    pid = _create(client, auth, user, org).json()["id"]
    outsider = store.add_user("Eve Outsider")
    assert client.get(f"/api/v1/projects/{pid}", headers=auth(outsider)).status_code == 404
    assert client.get("/api/v1/projects/not-a-uuid", headers=auth(user)).status_code == 422


# --------------------------------------------------------------------------- dashboard/members
def test_dashboard(client: TestClient, store: Store, auth: Auth) -> None:
    user, org = _setup(store)
    a = _create(client, auth, user, org, budgetCents=100).json()["id"]
    b = _create(client, auth, user, org, budgetCents=200).json()["id"]
    c = _create(client, auth, user, org, budgetCents=400).json()["id"]
    for pid, status in ((a, "on_track"), (b, "at_risk"), (c, "archived")):
        client.patch(f"/api/v1/projects/{pid}", json={"status": status}, headers=auth(user))
    r = client.get(f"/api/v1/orgs/{org}/dashboard", headers=auth(user))
    assert r.status_code == 200
    assert r.json() == {
        "totalProjects": 2,
        "onTrack": 1,
        "atRiskOrDelayed": 1,
        "totalBudgetCents": 300,
        "createdThisMonth": 2,
    }


def test_members(client: TestClient, store: Store, auth: Auth) -> None:
    user, org = _setup(store)
    pm = store.add_user("Mark Chen")
    store.members[(org, pm)] = OrgRole.PM
    r = client.get(f"/api/v1/orgs/{org}/members", headers=auth(user))
    assert r.status_code == 200
    roles = {m["fullName"]: m["role"] for m in r.json()}
    assert roles == {"Jane Doe": "owner", "Mark Chen": "pm"}
    assert "joinedAt" in r.json()[0]
    assert client.get(f"/api/v1/orgs/{org}/members", headers=auth(pm)).status_code == 200
    stranger = store.add_user("Eve")
    assert client.get(f"/api/v1/orgs/{org}/members", headers=auth(stranger)).status_code == 404


# --------------------------------------------------------------------------- notifications
def _notify(store: Store, user: uuid.UUID, org: uuid.UUID, minutes_ago: int, read: bool) -> str:
    nid = uuid.uuid4()
    now = datetime.now(UTC)
    store.notifications[nid] = (
        user,
        Notification(
            id=nid,
            org_id=org,
            project_id=None,
            level=NotificationLevel.WARN,
            message=f"n{minutes_ago}",
            read_at=now if read else None,
            created_at=now - timedelta(minutes=minutes_ago),
        ),
    )
    return str(nid)


def test_notifications(client: TestClient, store: Store, auth: Auth) -> None:
    user, org = _setup(store)
    n1 = _notify(store, user, org, 1, read=False)
    _notify(store, user, org, 2, read=True)
    other = store.add_user("Bob")
    foreign = _notify(store, other, org, 3, read=False)

    r = client.get("/api/v1/notifications", headers=auth(user))
    assert [n["message"] for n in r.json()["items"]] == ["n1", "n2"]
    r = client.get("/api/v1/notifications", params={"unread": "true"}, headers=auth(user))
    assert [n["id"] for n in r.json()["items"]] == [n1]
    assert r.json()["items"][0]["level"] == "warn"

    r = client.post(f"/api/v1/notifications/{n1}/read", headers=auth(user))
    assert r.status_code == 200
    first_read = r.json()["readAt"]
    assert first_read
    # idempotent
    r = client.post(f"/api/v1/notifications/{n1}/read", headers=auth(user))
    assert r.json()["readAt"] == first_read

    r = client.post(f"/api/v1/notifications/{foreign}/read", headers=auth(user))
    assert r.status_code == 404
