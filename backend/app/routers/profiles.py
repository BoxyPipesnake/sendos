from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Profile
from app.schemas import (
    AnalyzeResponse,
    ProfileCreate,
    ProfileCreateResponse,
    ProfileResponse,
)
from app.services import ai_analyzer

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


@router.post("", response_model=ProfileCreateResponse, status_code=201)
def create_profile(data: ProfileCreate, db: Session = Depends(get_db)) -> ProfileCreateResponse:
    profile = Profile(
        name=data.name,
        current_role=data.current_role,
        years_experience=data.years_experience,
        bio=data.bio,
        skills=data.skills,
        status="pending_analysis",
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return ProfileCreateResponse(
        id=profile.id,
        name=profile.name,
        status=profile.status,
        created_at=profile.created_at,
    )


@router.post("/{profile_id}/analyze", response_model=AnalyzeResponse)
def analyze_profile(profile_id: UUID, db: Session = Depends(get_db)) -> AnalyzeResponse:
    # Transaction A: flip status to "analyzing" and release the row before
    # the long-running AI call. Holding a row lock across a 15-25s LLM round
    # trip is the kind of habit you want to avoid even on a single-user MVP.
    profile = db.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile_input = ProfileCreate(
        name=profile.name,
        current_role=profile.current_role,
        years_experience=profile.years_experience,
        bio=profile.bio,
        skills=profile.skills,
    )
    profile.status = "analyzing"
    db.commit()

    # No transaction is open here — the AI call runs while the row is unlocked.
    try:
        analysis, recommendations = ai_analyzer.analyze_profile(profile_input)
    except Exception as exc:
        # Transaction B (failure path): roll status back so the client can retry.
        profile.status = "pending_analysis"
        db.commit()
        raise HTTPException(
            status_code=500,
            detail=f"AI analysis failed: {exc}",
        ) from exc

    # Transaction B (success path): persist results + mark completed.
    profile.analysis = analysis.model_dump(mode="json")
    profile.recommendations = [r.model_dump(mode="json") for r in recommendations]
    profile.status = "completed"
    db.commit()

    return AnalyzeResponse(
        status="completed",
        message=f"Analysis complete. Fetch /api/profiles/{profile_id} for results",
    )


@router.get("/{profile_id}", response_model=ProfileResponse)
def get_profile(profile_id: UUID, db: Session = Depends(get_db)) -> ProfileResponse:
    profile = db.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return ProfileResponse(
        id=profile.id,
        name=profile.name,
        current_role=profile.current_role,
        years_experience=profile.years_experience,
        bio=profile.bio,
        status=profile.status,
        analysis=profile.analysis,
        recommendations=profile.recommendations,
    )


@router.get("", response_model=list[ProfileResponse])
def list_profiles(db: Session = Depends(get_db)) -> list[ProfileResponse]:
    profiles = db.query(Profile).all()
    return [
        ProfileResponse(
            id=p.id,
            name=p.name,
            current_role=p.current_role,
            years_experience=p.years_experience,
            bio=p.bio,
            status=p.status,
            analysis=p.analysis,
            recommendations=p.recommendations,
        )
        for p in profiles
    ]
