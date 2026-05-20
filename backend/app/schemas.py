from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


# --- Input ---

class ProfileCreate(BaseModel):
    name: str
    current_role: str
    years_experience: int
    bio: str
    skills: list[str] = []


# --- Nested output sub-schemas ---

class DetectedSkill(BaseModel):
    name: str
    level: str
    confidence: float


class Analysis(BaseModel):
    detected_skills: list[DetectedSkill]
    interests: list[str]
    analyzed_at: datetime


class RecommendationStep(BaseModel):
    title: str
    skills_to_develop: list[str]
    duration_weeks: int


class Recommendation(BaseModel):
    title: str
    description: str
    duration_months: int
    steps: list[RecommendationStep]


# --- Endpoint response schemas ---

class ProfileCreateResponse(BaseModel):
    """Lean response returned only on profile creation."""
    id: UUID
    name: str
    status: str
    created_at: datetime


class ProfileResponse(BaseModel):
    """Full profile response returned by GET endpoints."""
    id: UUID
    name: str
    current_role: str
    years_experience: int
    bio: str
    status: str
    analysis: Analysis | None = None
    recommendations: list[Recommendation] = []


class AnalyzeResponse(BaseModel):
    """Acknowledgment returned by the analyze endpoint."""
    status: str
    message: str
