from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env before importing anything that reads env vars at import time
# (ANTHROPIC_API_KEY in ai_analyzer, DATABASE_URL in database.py).
load_dotenv()

from app.database import Base, engine  # noqa: E402
from app import models  # noqa: E402, F401 — registers Profile on Base.metadata
from app.routers import profiles  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Sendos Skill Recommender",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles.router)
