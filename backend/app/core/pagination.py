"""Opaque keyset cursors over (created_at desc, id desc)."""

from __future__ import annotations

import base64
import binascii
import json
import uuid
from dataclasses import dataclass
from datetime import datetime

from app.core.errors import BadRequestError

DEFAULT_LIMIT = 25
MAX_LIMIT = 100


@dataclass(frozen=True, slots=True)
class Cursor:
    created_at: datetime
    id: uuid.UUID

    def encode(self) -> str:
        raw = json.dumps(
            {"c": self.created_at.isoformat(), "i": str(self.id)}, separators=(",", ":")
        )
        return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")

    @classmethod
    def decode(cls, value: str) -> Cursor:
        try:
            padded = value + "=" * (-len(value) % 4)
            data = json.loads(base64.urlsafe_b64decode(padded.encode()))
            created_at = datetime.fromisoformat(data["c"])
            if created_at.tzinfo is None:
                raise ValueError("naive timestamp")
            return cls(created_at=created_at, id=uuid.UUID(data["i"]))
        except (ValueError, KeyError, TypeError, binascii.Error, json.JSONDecodeError) as exc:
            raise BadRequestError("Invalid pagination cursor") from exc
