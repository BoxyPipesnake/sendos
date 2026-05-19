"""pytest fixtures for the Sendos backend integration tests.

Setup contract:
  - DATABASE_URL is redirected to TEST_DATABASE_URL before any app module is
    imported, so app.database's engine is bound to sendos_test.
  - Tables are created once per test session and dropped at the end.
  - Each test runs inside a SAVEPOINT-wrapped transaction that is rolled back
    at teardown, so the app can call session.commit() freely (the analyze
    endpoint commits twice) without polluting other tests.
"""

import os
from datetime import datetime, timezone
from typing import Iterator

import pytest
from dotenv import load_dotenv

# Redirect DATABASE_URL to the test database BEFORE app.* imports.
load_dotenv()
_TEST_URL = os.getenv("TEST_DATABASE_URL")
if not _TEST_URL:
    raise RuntimeError(
        "TEST_DATABASE_URL must be set in backend/.env for the test suite"
    )
os.environ["DATABASE_URL"] = _TEST_URL

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import event  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app import models  # noqa: E402, F401 — registers Profile on Base.metadata
from app.database import Base, engine, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import profiles as profiles_router  # noqa: E402
from app.schemas import (  # noqa: E402
    Analysis,
    DetectedSkill,
    Recommendation,
    RecommendationStep,
)


@pytest.fixture(scope="session", autouse=True)
def _create_test_schema() -> Iterator[None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session() -> Iterator[Session]:
    """Per-test session inside an outer transaction that rolls back at teardown.

    The SAVEPOINT-restart pattern lets the app call session.commit() — those
    commits release the savepoint instead of the outer transaction, so the
    rollback at the end discards everything the test did.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, autoflush=False, autocommit=False)
    nested = connection.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def _restart_savepoint(sess: Session, trans) -> None:
        nonlocal nested
        if trans.nested and not trans._parent.nested:
            nested = connection.begin_nested()

    try:
        yield session
    finally:
        session.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    def _override_get_db() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def fake_analysis() -> Analysis:
    return Analysis(
        detected_skills=[
            DetectedSkill(name="Python", level="advanced", confidence=0.9),
            DetectedSkill(name="FastAPI", level="intermediate", confidence=0.8),
        ],
        interests=["Backend Systems", "API Design"],
        analyzed_at=datetime(2026, 5, 19, 12, 0, 0, tzinfo=timezone.utc),
    )


@pytest.fixture
def fake_recommendations() -> list[Recommendation]:
    return [
        Recommendation(
            title="Backend Engineer Path",
            description="Mock recommendation for tests.",
            duration_months=6,
            steps=[
                RecommendationStep(
                    title="Advanced Python",
                    skills_to_develop=["asyncio", "typing"],
                    duration_weeks=4,
                )
            ],
        )
    ]


@pytest.fixture
def mock_ai_analyzer(
    monkeypatch: pytest.MonkeyPatch,
    fake_analysis: Analysis,
    fake_recommendations: list[Recommendation],
) -> tuple[Analysis, list[Recommendation]]:
    def _fake_analyze(_profile):
        return fake_analysis, fake_recommendations

    monkeypatch.setattr(
        profiles_router.ai_analyzer, "analyze_profile", _fake_analyze
    )
    return fake_analysis, fake_recommendations


@pytest.fixture
def failing_ai_analyzer(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(_profile):
        raise RuntimeError("Simulated AI failure")

    monkeypatch.setattr(profiles_router.ai_analyzer, "analyze_profile", _raise)
