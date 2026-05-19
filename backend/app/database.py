"""SQLAlchemy engine, session factory, and FastAPI dependency.

DATABASE_URL is read from the environment at import time (loaded from .env
by `app.main` before this module is imported transitively via routers).

Engine is built once at module load; `SessionLocal` produces request-scoped
sessions yielded by `get_db()`. Connection liveness is checked per checkout
via `pool_pre_ping=True` to survive Postgres restarts during dev.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


_DATABASE_URL = os.getenv("DATABASE_URL")
if not _DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Add it to backend/.env, e.g. "
        "postgresql+psycopg2://postgres:<password>@localhost:5432/sendos"
    )

engine = create_engine(_DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def get_db():
    """FastAPI dependency yielding a request-scoped SQLAlchemy session."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
