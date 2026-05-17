# Sendos Skill Recommender

## Project context
MVP of an AI-Powered Skill Recommendations system for Sendos.
Users can create professional profiles and receive AI-generated
career path recommendations.

## Tech stack
- Backend: FastAPI + SQLAlchemy + PostgreSQL
- AI: Langchain + Anthropic API
- Frontend: React + Vite

## Project structure (do not modify)
```
sendos-skill-recommender/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── routers/
│   │   └── services/
│   │       └── ai_analyzer.py
│   ├── tests/
│   ├── requirements.txt
│   ├── .env.example
│ 
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── api/
│   └── package.json
├── docs/
│   ├── ARCHITECTURE_DECISIONS.md
│   └── AI_WORKFLOW.md
├── .gitignore
└── README.md
```

## Conventions
- IDs always UUID, never integers
- Profile status flow: pending_analysis → analyzing → completed
- Synchronous processing (no Celery, no Redis, no queues)
- Full type hints on all Python code
- Docstrings on critical functions

## Environment variables
- ANTHROPIC_API_KEY
- DATABASE_URL

## Testing
- Framework: pytest
- Priority: integration tests for all 4 endpoints
- Target: coverage >60%
- Location: backend/tests/

## Git flow
Strategy: GitHub Flow — `main` is always deployable, all work happens in short-lived branches.

### Branch naming
| Prefix | Use for |
|---|---|
| `feature/` | New functionality (endpoints, UI pages, AI logic) |
| `fix/` | Bug fixes |
| `chore/` | Deps, config, tests, infra |
| `docs/` | Documentation only |

Examples: `feature/profile-endpoint`, `fix/ai-analyzer-timeout`, `chore/add-integration-tests`

### Commit messages (Conventional Commits)
Format: `<type>: <short description>`

| Type | Use for |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Maintenance, deps, config |
| `test` | Adding or fixing tests |
| `docs` | Documentation only |
| `refactor` | Code change with no behavior change |

Examples: `feat: add profile creation endpoint`, `fix: handle missing skills field in analyzer`

### Rules
- Always branch off `main`
- Open a PR to merge back into `main`
- Delete the branch after merging
- Never commit directly to `main`
