# Sendos Skill Recommender

## Project Overview

An MVP of an AI-powered skill recommendation system for Sendos. Users create professional profiles (current role, years of experience, bio) and receive a structured AI analysis: detected skills, career interests, and 2–3 ranked career path recommendations with multi-month development plans. Analysis runs as a three-step LangChain prompt chain backed by Claude Haiku (extraction + inference) and Claude Sonnet (strategic synthesis).

## Architecture

```mermaid
flowchart LR
    User([User])
    FE[React + Vite<br/>Vercel]
    BE[FastAPI<br/>Render]
    DB[(PostgreSQL<br/>Supabase)]
    AI[Anthropic API<br/>Haiku + Sonnet]

    User -->|HTTPS| FE
    FE -->|fetch / CORS| BE
    BE -->|SQLAlchemy<br/>psycopg2| DB
    BE -->|LangChain| AI
```

## Tech Stack

- **Backend:** FastAPI, SQLAlchemy 2.0, psycopg2, pytest
- **AI:** LangChain, `langchain-anthropic`, Claude Haiku 4.5 + Sonnet 4.6
- **Database:** PostgreSQL 18 with JSONB columns
- **Frontend:** React 19, Vite 6, TypeScript 5, Tailwind v4, react-router-dom 6
- **Deployment:** Vercel (frontend), Render (backend), Supabase (Postgres)
- **Local orchestration:** Docker + docker-compose

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `ANTHROPIC_API_KEY` | API key for Claude (backend) | `sk-ant-api03-xxxxxxxxxxxx` |
| `DATABASE_URL` | Postgres connection string (backend) | `postgresql+psycopg2://postgres:postgres@localhost:5433/sendos` |
| `VITE_API_URL` | Backend base URL the frontend calls (frontend) | `http://localhost:8000` |

## Local Setup (without Docker)

**Prerequisites:** Python 3.13, Node 20+, PostgreSQL running locally with a `sendos` database.

Clone the repo:

```bash
git clone git@github.com:BoxyPipesnake/sendos.git
cd sendos
```

Backend:

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
cp .env.example .env           # then edit .env with your ANTHROPIC_API_KEY + DATABASE_URL
uvicorn app.main:app --reload
```

Backend runs on `http://localhost:8000`. Swagger UI at `/docs`.

Frontend (in a separate terminal):

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Local Setup (with Docker)

**Prerequisites:** Docker Desktop.

Set the backend `.env`:

```bash
cp backend/.env.example backend/.env
# edit backend/.env and set ANTHROPIC_API_KEY
# DATABASE_URL is overridden by docker-compose, leave or omit
```

Bring the full stack up:

```bash
docker-compose up --build
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Postgres: `localhost:5432` (inside the compose network)

Tear down:

```bash
docker-compose down          # keep data
docker-compose down -v       # also drop the postgres volume
```

## Running Tests

```bash
cd backend
venv\Scripts\activate
pytest                                           # run the integration suite
pytest --cov=app --cov-report=term-missing       # with coverage
```

Tests use a separate `sendos_test` database. Set `TEST_DATABASE_URL` in `backend/.env` (see `backend/tests/conftest.py`). Suite runs in ~1.6s; coverage target is >60% (current: 82%).

## Live Demo

- **Frontend:** https://sendos.vercel.app
- **Backend:** https://sendos.onrender.com (Swagger at `/docs`)
