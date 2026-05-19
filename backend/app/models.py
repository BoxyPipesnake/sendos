"""SQLAlchemy ORM models.

The `Profile` row carries the entire lifecycle: input fields captured at
creation, lifecycle `status` flipped by the analyze endpoint, and the AI
output stored as JSONB blobs (`analysis`, `recommendations`).

JSONB over normalized tables is deliberate — we never query inside these
structures, we read them back whole and return them through Pydantic.
"""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    current_role: Mapped[str] = mapped_column(String, nullable=False)
    years_experience: Mapped[int] = mapped_column(Integer, nullable=False)
    bio: Mapped[str] = mapped_column(String, nullable=False)
    skills: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    analysis: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True, default=None)
    recommendations: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
