from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.schemas import (
    Analysis,
    AnalyzeResponse,
    DetectedSkill,
    ProfileCreate,
    ProfileCreateResponse,
    ProfileResponse,
    Recommendation,
    RecommendationStep,
)

router = APIRouter(prefix="/api/profiles", tags=["profiles"])

# Temporary in-memory store — replaced by DB session in Phase 3
profiles_db: dict[str, dict] = {}


def _mock_analyze() -> tuple[Analysis, list[Recommendation]]:
    """Returns hardcoded analysis results. Replaced by ai_analyzer in Phase 2."""
    analysis = Analysis(
        detected_skills=[
            DetectedSkill(name="Python", level="advanced", confidence=0.9),
            DetectedSkill(name="FastAPI", level="intermediate", confidence=0.8),
        ],
        interests=["Machine Learning", "AI", "Backend Development"],
        analyzed_at=datetime.now(timezone.utc),
    )
    recommendations = [
        Recommendation(
            title="ML Engineer Path",
            description="Leverage your Python expertise to transition into ML",
            duration_months=6,
            steps=[
                RecommendationStep(
                    title="Foundation in ML",
                    skills_to_develop=["scikit-learn", "pandas"],
                    duration_weeks=8,
                )
            ],
        )
    ]
    return analysis, recommendations


@router.post("", response_model=ProfileCreateResponse, status_code=201)
def create_profile(data: ProfileCreate) -> ProfileCreateResponse:
    profile_id = str(uuid4())
    profiles_db[profile_id] = {
        "id": profile_id,
        "name": data.name,
        "current_role": data.current_role,
        "years_experience": data.years_experience,
        "bio": data.bio,
        "skills": data.skills,
        "status": "pending_analysis",
        "created_at": datetime.now(timezone.utc),
        "analysis": None,
        "recommendations": [],
    }
    return ProfileCreateResponse(
        id=profile_id,
        name=data.name,
        status="pending_analysis",
        created_at=profiles_db[profile_id]["created_at"],
    )


@router.post("/{profile_id}/analyze", response_model=AnalyzeResponse)
def analyze_profile(profile_id: str) -> AnalyzeResponse:
    if profile_id not in profiles_db:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profiles_db[profile_id]
    profile["status"] = "analyzing"

    analysis, recommendations = _mock_analyze()

    profile["analysis"] = analysis
    profile["recommendations"] = recommendations
    profile["status"] = "completed"

    return AnalyzeResponse(
        status="processing",
        message=f"Analysis started. Check /api/profiles/{profile_id} for results",
    )


@router.get("/{profile_id}", response_model=ProfileResponse)
def get_profile(profile_id: str) -> ProfileResponse:
    if profile_id not in profiles_db:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profiles_db[profile_id]
    return ProfileResponse(
        id=profile["id"],
        name=profile["name"],
        status=profile["status"],
        analysis=profile["analysis"],
        recommendations=profile["recommendations"],
    )


@router.get("", response_model=list[ProfileResponse])
def list_profiles() -> list[ProfileResponse]:
    return [
        ProfileResponse(
            id=p["id"],
            name=p["name"],
            status=p["status"],
            analysis=p["analysis"],
            recommendations=p["recommendations"],
        )
        for p in profiles_db.values()
    ]
