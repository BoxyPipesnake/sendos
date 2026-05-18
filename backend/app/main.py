from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env before importing anything that reads ANTHROPIC_API_KEY at import time
# (e.g. app.routers.profiles → app.services.ai_analyzer instantiates ChatAnthropic).
load_dotenv()

from app.routers import profiles  # noqa: E402

app = FastAPI(
    title="Sendos Skill Recommender",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles.router)
