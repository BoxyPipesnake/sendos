from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import profiles

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
