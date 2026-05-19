"""Integration tests for the 4 profile endpoints.

The AI call is mocked at the router boundary (see conftest.mock_ai_analyzer)
so the suite runs fast and deterministically without hitting Anthropic.
"""

from uuid import UUID

from fastapi.testclient import TestClient

from app.schemas import Analysis, Recommendation


SAMPLE_PROFILE = {
    "name": "Test User",
    "current_role": "Backend Developer",
    "years_experience": 3,
    "bio": "Building APIs with Python.",
    "skills": ["Python", "FastAPI"],
}


def _create(client: TestClient, **overrides) -> dict:
    body = {**SAMPLE_PROFILE, **overrides}
    res = client.post("/api/profiles", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_create_profile_persists_and_returns_lean_response(client: TestClient) -> None:
    res = client.post("/api/profiles", json=SAMPLE_PROFILE)
    assert res.status_code == 201
    body = res.json()
    # Lean shape: id, name, status, created_at — no analysis/recommendations
    assert set(body) == {"id", "name", "status", "created_at"}
    UUID(body["id"])  # raises if not a valid UUID
    assert body["name"] == SAMPLE_PROFILE["name"]
    assert body["status"] == "pending_analysis"


def test_get_returns_pending_state_after_create(client: TestClient) -> None:
    created = _create(client)
    res = client.get(f"/api/profiles/{created['id']}")
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == created["id"]
    assert body["status"] == "pending_analysis"
    assert body["analysis"] is None
    assert body["recommendations"] == []


def test_get_returns_404_for_unknown_id(client: TestClient) -> None:
    res = client.get("/api/profiles/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404


def test_analyze_completes_lifecycle(
    client: TestClient,
    mock_ai_analyzer: tuple[Analysis, list[Recommendation]],
) -> None:
    fake_analysis, fake_recs = mock_ai_analyzer
    created = _create(client)

    res = client.post(f"/api/profiles/{created['id']}/analyze")
    assert res.status_code == 200
    assert res.json()["status"] == "completed"

    # Verify the persisted state matches the mocked AI output.
    body = client.get(f"/api/profiles/{created['id']}").json()
    assert body["status"] == "completed"
    assert body["analysis"] is not None
    assert {s["name"] for s in body["analysis"]["detected_skills"]} == {
        s.name for s in fake_analysis.detected_skills
    }
    assert body["analysis"]["interests"] == fake_analysis.interests
    assert len(body["recommendations"]) == len(fake_recs)
    assert body["recommendations"][0]["title"] == fake_recs[0].title


def test_analyze_rolls_back_status_on_ai_failure(
    client: TestClient,
    failing_ai_analyzer: None,
) -> None:
    created = _create(client)

    res = client.post(f"/api/profiles/{created['id']}/analyze")
    assert res.status_code == 500
    assert "AI analysis failed" in res.json()["detail"]

    # Status must have been reset so the client can retry.
    body = client.get(f"/api/profiles/{created['id']}").json()
    assert body["status"] == "pending_analysis"
    assert body["analysis"] is None
    assert body["recommendations"] == []


def test_list_returns_all_profiles(client: TestClient) -> None:
    ids = {_create(client, name=f"User {i}")["id"] for i in range(3)}

    res = client.get("/api/profiles")
    assert res.status_code == 200
    returned_ids = {p["id"] for p in res.json()}
    assert ids <= returned_ids
    assert len(res.json()) >= 3
