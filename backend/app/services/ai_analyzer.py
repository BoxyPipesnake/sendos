"""AI-powered profile analyzer using LangChain + Anthropic.

3-step sequential pipeline:
  1. Extract skills           (Haiku  — fast, cheap)
  2. Detect career interests  (Haiku)
  3. Generate career paths    (Sonnet — richer reasoning)

The pipeline is synchronous; total latency is ~10-25 seconds per profile.
ANTHROPIC_API_KEY must be set in the environment (loaded from .env at startup).
"""

from datetime import datetime, timezone

from langchain_anthropic import ChatAnthropic
from pydantic import BaseModel, Field

from app.schemas import (
    Analysis,
    DetectedSkill,
    ProfileCreate,
    Recommendation,
)

# Model split per Phase 2 plan: Haiku for cheap extraction steps,
# Sonnet for the higher-stakes career path reasoning.
_HAIKU_MODEL = "claude-haiku-4-5-20251001"
_SONNET_MODEL = "claude-sonnet-4-6"

_haiku = ChatAnthropic(model=_HAIKU_MODEL, max_tokens=2048, temperature=0.2)
_sonnet = ChatAnthropic(model=_SONNET_MODEL, max_tokens=4096, temperature=0.4)


# --- Internal LLM output schemas ------------------------------------------------
# These wrap the shared `Analysis`/`Recommendation` types from app.schemas so
# the model has an explicit top-level container with a descriptive Field.

class _SkillExtraction(BaseModel):
    """Step 1 output: skills detected from the profile."""

    skills: list[DetectedSkill] = Field(
        description=(
            "All technical and soft skills evident in the profile — both explicitly "
            "mentioned and reasonably inferable from the role and experience. For "
            "each skill: level is one of 'beginner', 'intermediate', 'advanced', "
            "'expert'; confidence is 0.0-1.0 based on how strongly the evidence supports it."
        )
    )


class _InterestDetection(BaseModel):
    """Step 2 output: career interest areas inferred from profile + skills."""

    interests: list[str] = Field(
        description=(
            "3-7 broad career interest areas the person seems naturally suited for "
            "and likely curious about. Examples: 'Backend Systems', 'Machine Learning', "
            "'Data Engineering', 'Developer Tooling'. Use title case, no trailing punctuation."
        )
    )


class _CareerPathGeneration(BaseModel):
    """Step 3 output: ranked career path recommendations."""

    recommendations: list[Recommendation] = Field(
        description=(
            "2-3 ranked career path recommendations. Each path has a clear title, "
            "a description explaining why it fits the person's skills and interests, "
            "a realistic total duration in months (3-24), and 3-5 development steps "
            "with focused titles, specific skills_to_develop lists, and duration_weeks (2-26)."
        )
    )


# --- Public API -----------------------------------------------------------------

def analyze_profile(profile: ProfileCreate) -> tuple[Analysis, list[Recommendation]]:
    """Run the 3-step AI analysis pipeline on a profile.

    Drop-in replacement for the Phase-1 mock. Same return signature.
    Raises any underlying LLM/network exceptions — caller is responsible for
    catching and translating them into HTTP errors.
    """
    context = _format_profile_context(profile)

    skills = _extract_skills(context)
    interests = _detect_interests(context, skills)
    recommendations = _generate_career_paths(context, skills, interests)

    analysis = Analysis(
        detected_skills=skills,
        interests=interests,
        analyzed_at=datetime.now(timezone.utc),
    )
    return analysis, recommendations


# --- Pipeline steps -------------------------------------------------------------

def _extract_skills(context: str) -> list[DetectedSkill]:
    model = _haiku.with_structured_output(_SkillExtraction, method="json_schema")
    prompt = (
        "You are a technical talent assessor. From the profile below, extract every "
        "technical and soft skill that is evident — both explicitly stated and reasonably "
        "inferable from role and experience.\n\n"
        "Rules:\n"
        "- level: 'beginner' | 'intermediate' | 'advanced' | 'expert'\n"
        "- confidence: 0.0 to 1.0 (higher = stronger evidence)\n"
        "- Be conservative with 'expert' — reserve it for skills clearly justified by "
        "  many years of focused experience in that area.\n\n"
        f"PROFILE:\n{context}"
    )
    result: _SkillExtraction = model.invoke(prompt)
    return result.skills


def _detect_interests(context: str, skills: list[DetectedSkill]) -> list[str]:
    model = _haiku.with_structured_output(_InterestDetection, method="json_schema")
    skills_summary = ", ".join(s.name for s in skills) or "(no skills detected)"
    prompt = (
        "You are a career advisor. Based on the profile and detected skills below, "
        "infer 3-7 broad career interest areas the person likely gravitates toward.\n\n"
        f"PROFILE:\n{context}\n\n"
        f"DETECTED SKILLS: {skills_summary}"
    )
    result: _InterestDetection = model.invoke(prompt)
    return result.interests


def _generate_career_paths(
    context: str,
    skills: list[DetectedSkill],
    interests: list[str],
) -> list[Recommendation]:
    model = _sonnet.with_structured_output(_CareerPathGeneration, method="json_schema")
    skills_lines = (
        "\n".join(
            f"- {s.name} ({s.level}, confidence {s.confidence:.2f})" for s in skills
        )
        or "- (no skills detected)"
    )
    interests_summary = ", ".join(interests) or "(none detected)"
    prompt = (
        "You are a senior career strategist. Generate 2-3 ranked career path "
        "recommendations tailored to the person below.\n\n"
        "Each recommendation must include:\n"
        "- title: concise path name (e.g., 'Senior ML Engineer Path')\n"
        "- description: why this path fits, in 2-3 sentences\n"
        "- duration_months: realistic total time, 3-24\n"
        "- steps: 3-5 development steps, each with title, skills_to_develop "
        "  (specific technologies/topics), and duration_weeks (2-26)\n\n"
        f"PROFILE:\n{context}\n\n"
        f"DETECTED SKILLS:\n{skills_lines}\n\n"
        f"CAREER INTERESTS: {interests_summary}"
    )
    result: _CareerPathGeneration = model.invoke(prompt)
    return result.recommendations


# --- Helpers --------------------------------------------------------------------

def _format_profile_context(profile: ProfileCreate) -> str:
    skills_line = ", ".join(profile.skills) if profile.skills else "(none provided)"
    return (
        f"Name: {profile.name}\n"
        f"Current role: {profile.current_role}\n"
        f"Years of experience: {profile.years_experience}\n"
        f"Self-described skills: {skills_line}\n"
        f"Bio: {profile.bio}"
    )
