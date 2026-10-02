from __future__ import annotations

import uuid

from pydantic import Field, model_validator

from app.domain.common import CamelModel, InputModel, OrgRole


class OrganizationMembership(CamelModel):
    id: uuid.UUID
    name: str
    slug: str
    role: OrgRole


class Profile(CamelModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    avatar_url: str | None
    job_title: str | None


class Me(Profile):
    organizations: list[OrganizationMembership]


class MeUpdate(InputModel):
    full_name: str | None = Field(default=None, max_length=200)
    job_title: str | None = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def _not_empty(self) -> MeUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update")
        return self

    def changes(self) -> dict[str, str | None]:
        # Empty strings clear the field.
        return {
            k: (v or None) for k, v in self.model_dump(exclude_unset=True, by_alias=False).items()
        }
