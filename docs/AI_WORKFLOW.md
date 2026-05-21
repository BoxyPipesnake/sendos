# AI Workflow

This document describes how AI tools were used while building the Sendos Skill Recommender.

Before starting to code, the workflow consisted of: Plan → Implement → Verify. A phase was only declared complete once the code was understood and verified end-to-end.

---

## Phases

The build was split into seven phases, each gated by plan approval and a manual verification pass before moving on:

| Phase | Scope |
|---|---|
| 1 | 4 endpoints + in-memory dict storage + mocked AI |
| 2 | Real LangChain + Anthropic prompt chain (Haiku → Haiku → Sonnet) |
| 3 | PostgreSQL persistence via SQLAlchemy with JSONB columns |
| 4 | pytest integration tests, 82% coverage |
| 5 | React + Vite frontend (create form + details page with polling) |
| 6 | Dockerization — backend + frontend Dockerfiles + docker-compose for local demo |
| 7 | Deployment to Vercel (frontend) + Render (backend) + Supabase (Postgres), plus CORS hardening |

Examples below refer back to these phases. The decisions made inside each phase's plan are recorded in `docs/ARCHITECTURE_DECISIONS.md`.

---

## Tools Used

### Claude Code (Anthropic's CLI) — ~85% of build-time tool usage
Primary pair-programming environment throughout the build. Direct filesystem access, runs shell commands, stages/commits through git, and can be paused into "plan mode" to align on an approach before writing code. Model: Claude Opus 4.7.

### Context7 MCP Server — ~15% of build-time tool usage
Installed at project level via remote HTTP transport (`https://mcp.context7.com/mcp`). Fetches current library documentation on demand — important because Claude's training cutoff means it can drift on fast-moving libraries like LangChain. Two tools:

- `resolve-library-id` — converts a library name (e.g. `langchain-anthropic`) into a Context7-compatible ID.
- `query-docs` — fetches scoped doc snippets for a resolved library ID and a specific question.

Config lives in `.mcp.json` (gitignored, contains the API key). A committable template is at `.mcp.json.example`.

### Anthropic API — runtime only (0% of build-time)
The application itself calls Claude Haiku 4.5 and Claude Sonnet 4.6 via `langchain-anthropic`. Listed here for completeness — it is consumed by the running app at request time, not by the developer during the build.

---

## Effective Usage Examples

### Example 1: Plan-mode alignment before any implementation

Every non-trivial change (Context7 setup, the Phase 2 AI analyzer, the docs themselves) began in **plan mode** — Claude can read and search but cannot edit files or run state-changing commands; the only writable artifact is a plan file.

The flow looked like:

1. State the goal in plain language.
2. Claude explores the codebase and asks 1-3 clarifying questions if needed.
3. Claude drafts a plan with: context, the files it intends to touch, the design approach, and a verification section describing how the work will be tested.
4. I review the plan and either approve it (`ExitPlanMode`) or push back with adjustments.
5. Only after approval does any code get written.

**Why this worked.** It separated *design discussion* from *implementation* — by the time Claude was writing code, we already agreed on what and how. The plan also served as a written record to refer back to mid-implementation, useful when a 200-line analyzer was assembled across several files.

**Concrete payoff.** The Phase 2 plan listed the three pipeline steps, model assignments (Haiku/Haiku/Sonnet), file structure, and verification steps. Implementation had no surprises, and later "why three steps?" / "what does `Field` do?" questions had answers already grounded in the agreed plan.

**Prompt used (representative — Phase 2):**
> Enter plan mode. Replace the mock AI in `POST /api/profiles/{id}/analyze` with a real LangChain + Anthropic prompt chain. Three sequential calls: extract skills → detect interests → generate career paths. Haiku for the first two, Sonnet for the third. Use Pydantic structured output. List files touched, the schema for each step, and the verification steps. Verify version pins through Context7 before pinning.

**Output generated.** A plan file in `~/.claude/plans/` with: context summary, file list (`services/ai_analyzer.py`, `services/__init__.py`, edits to `main.py` and `routers/profiles.py`, additions to `requirements.txt`), per-step schemas, the orchestrator signature, and a 4-step verification recipe ending in a Swagger UI walk-through.

**Modifications made.** Two adjustments before approval: (1) tightened the verification section to call out the empty-bio edge case explicitly, and (2) confirmed `load_dotenv()` would move to `main.py` *before* the router import so `ANTHROPIC_API_KEY` is in env when `ChatAnthropic` instantiates at module load.

### Example 2: Role + Rules + Data structure for every LLM prompt

The three prompts in `ai_analyzer.py` (steps 1, 2, and 3) all follow the same three-part template:

```
[ROLE]   → "You are a technical talent assessor..."  (or "career advisor", or "senior career strategist")
[RULES]  → "level: 'beginner' | 'intermediate' | ...
            confidence: 0.0 to 1.0
            Be conservative with 'expert'..."
[DATA]   → "PROFILE:\n<formatted profile text>"
           "DETECTED SKILLS: <previous step output>"  (steps 2 and 3)
           "CAREER INTERESTS: ..."                     (step 3 only)
```

**Why this worked.** Each part has a clear job:

- **Role** primes tone and focus — a "technical talent assessor" behaves differently from a "career strategist."
- **Rules** constrain content (allowed values, conservatism, range limits) — not redundant with the Pydantic schemas but reinforcing the same constraints through a second channel, which made outputs markedly more consistent in testing.
- **Data** block is clearly labeled (`PROFILE:`, `DETECTED SKILLS:`, etc.) so the model can parse the plain-text structure.

**Two-channel constraint was deliberate.** Pydantic's `Field(description="...")` ships rules via the structured-output schema; the prompt repeats them in natural language. If one channel drifts (a model skimming a long prompt, or interpreting JSON Schema loosely), the other anchors behavior.

**Prompt used (Step 1, verbatim from `ai_analyzer.py:_extract_skills`):**
> You are a technical talent assessor. From the profile below, extract every technical and soft skill that is evident — both explicitly stated and reasonably inferable from role and experience.
>
> Rules:
> - level: 'beginner' | 'intermediate' | 'advanced' | 'expert'
> - confidence: 0.0 to 1.0 (higher = stronger evidence)
> - Be conservative with 'expert' — reserve it for skills clearly justified by many years of focused experience in that area.
>
> PROFILE:
> {context}

**Output generated (representative shape, parsed into `_SkillExtraction`):**
```json
{"skills": [
  {"name": "Python", "level": "advanced", "confidence": 0.92, "evidence_source": "5 years at backend role, Django + FastAPI listed"},
  {"name": "Machine Learning", "level": "intermediate", "confidence": 0.78, "evidence_source": "self-described ML side projects, no prod deployments cited"}
]}
```

**Modifications made.** Two iterations on the rules block: (1) added the "be conservative with 'expert'" line after early runs over-claimed expert level on every skill the bio mentioned; (2) made the rules section a literal mirror of the `Field(description=...)` text in `_SkillExtraction` so the two channels could not drift apart silently.

### Example 3: Per-step persona shifts as deliberate prompt design

The three pipeline steps use three different personas, even though steps 1 and 2 use the same model (Haiku):

| Step | Persona | Cognitive task |
|---|---|---|
| 1 | "Technical talent assessor" | Enumerate evidence into a list of skills |
| 2 | "Career advisor" | Interpret skills into broader interest areas |
| 3 | "Senior career strategist" | Synthesize skills + interests into multi-month plans |

**Why this worked.** Each persona matches the *kind of thinking* the step requires: assessor enumerates, advisor interprets, strategist plans. A shared persona ("career expert") would still produce results but each step would inherit a slightly mismatched tone — vaguer skills, less ambitious paths.

**Observable effect.** On a real profile, the career-paths output referenced "Alex's combination of backend + ML" and produced named paths ("ML Platform Engineer," "Senior Platform / Infrastructure Engineer") with reasoned justifications — strategist framing. Generic personas tend toward boilerplate.

**Prompt used (Step 3 opening, verbatim from `_generate_career_paths`):**
> You are a senior career strategist. Generate 2-3 ranked career path recommendations tailored to the person below.
>
> Each recommendation must include:
> - title: concise path name (e.g., 'Senior ML Engineer Path')
> - description: why this path fits, in 2-3 sentences
> - duration_months: realistic total time, 3-24
> - steps: 3-5 development steps, each with title, skills_to_develop, and duration_weeks (2-26)
>
> PROFILE: ... DETECTED SKILLS: ... CAREER INTERESTS: ...

**Output generated (representative):**
```json
{"recommendations": [
  {"title": "ML Platform Engineer", "description": "Alex's combination of backend depth and ML side-project experience points to platform work...", "duration_months": 12, "steps": [...]},
  {"title": "Senior Platform / Infrastructure Engineer", "description": "...", "duration_months": 9, "steps": [...]}
]}
```

**Modifications made.** Early drafts used "career advisor" for all three steps. After running on a test profile, step 3's output was visibly more generic than steps 1-2's — the persona was promoted to "senior career strategist" and the named-path quality jumped on the same input.

### Example 4: Mocking the LLM at the application boundary for tests

The Phase 4 integration tests do not call Anthropic. The `mock_ai_analyzer` fixture in `backend/tests/conftest.py` monkey-patches `app.routers.profiles.ai_analyzer.analyze_profile` with a function that returns a canned `(Analysis, list[Recommendation])` pair — the same Pydantic types the real analyzer returns.

**Why this worked.** Three things would otherwise break the test suite:

- **Cost.** Real analyze calls charge real dollars on every CI run.
- **Speed.** Each real call is 15–25s — a 6-test suite would take 90+ seconds. With the mock, ~1.6s.
- **Determinism.** LLM outputs vary; asserting on specific skill names would flake.

The mock replaces the AI at the **router's view of the analyzer** — not deeper. Everything else (Pydantic validation, SQLAlchemy session, JSONB serialization, status lifecycle, two-transaction analyze pattern) runs under real test. Integration tests verify *given an Analysis and Recommendations, the endpoint persists and returns them correctly*. AI output quality is a separate concern, evaluated manually during Phase 3.

**Prompt used (representative — Phase 4):**
> Add a pytest fixture in `tests/conftest.py` that monkey-patches `app.routers.profiles.ai_analyzer.analyze_profile` to return a canned `(Analysis, list[Recommendation])` pair. Real Pydantic types, not dicts. Also add a sibling `failing_ai_analyzer` fixture that raises, so we can test the rollback path in the two-transaction analyze pattern.

**Output generated.** Two fixtures: `mock_ai_analyzer` returning fixed `fake_analysis` + `fake_recommendations` Pydantic objects, and `failing_ai_analyzer` raising `RuntimeError("simulated AI failure")`. Both patch `app.routers.profiles.ai_analyzer.analyze_profile` via `monkeypatch.setattr`.

**Modifications made.** Initially the mock returned dicts shaped like the JSONB payload; that worked but bypassed Pydantic validation inside the router. Adjusted to return the real `Analysis` and `Recommendation` instances so the router's `model_dump(mode="json")` call sits on the same code path as production.

---

## Prompt Iteration

### Iteration example: catching wrong version pins through verification

This iteration walks through how the dependency-install workflow evolved across three attempts during Phase 2.

**Attempt 1 — trust the model's pin.**
- *Prompt:* "Add `langchain` and `langchain-anthropic` to `backend/requirements.txt` at the latest stable versions."
- *What came back:* Claude pinned versions drawn from its training data — `langchain` and `langchain-anthropic` at minors that were several releases behind current PyPI, including a major-version bump it didn't know about.
- *What was wrong:* the pins looked plausible, but `pip install` would have installed actually-current versions while the lockfile claimed otherwise. A reviewer cloning the repo six months later would have hit an inconsistency the file silently lied about.

**Attempt 2 — ask Claude to verify before pinning.**
- *Prompt:* "Before writing the pin, query Context7 for the current stable version of `langchain` and `langchain-anthropic`. Use the version Context7 reports, not the one from your training data."
- *What came back:* Claude called `resolve-library-id` then `query-docs` on each package and pinned `langchain==1.3.1`, `langchain-anthropic==1.0.0`, `anthropic==0.102.0`.
- *What improved:* the pins matched live PyPI. `pip install -r requirements.txt` produced the same versions a fresh `pip install langchain` would.

**Final pattern — Context7 first, install second.**
For every subsequent dependency (`sqlalchemy==2.0.49`, `psycopg2-binary==2.9.12`, `pytest-cov==7.1.0`), the rule became: query Context7, *then* pin, *then* run pip. The verification step is cheap (one tool call), so it became the default rather than the exception.

**What I learned.** Don't trust an LLM's knowledge of fast-moving package versions — wire a documentation source into the workflow and make checking it the default, not an afterthought. The MCP server pattern is what made this practical: Context7 is one tool call away during a coding session, so the cost of verifying is near-zero.

### Prompting patterns that worked

A small list of habits that produced noticeably better outcomes:

- **Section-by-section explanation requests.** When I asked Claude to explain the analyzer code, I asked for it in pieces (first the three schemas, then the orchestrator, then the step functions, then the helper). Each piece was small enough to absorb, and I could verify my understanding before moving on.
- **After-the-fact "why" prompts.** Once a change landed, I'd ask Claude to articulate *why* it picked that approach over the alternatives. Forcing it to explain surfaced trade-offs that would otherwise have stayed implicit — and occasionally exposed a better path than the one originally taken.
- **Verify dependency versions through Context7 before pinning.** (See the iteration example above.) Made checking the live source a default step, not a recovery step.
- **Restate critical constraints in two channels.** (See Example 2.) Putting the same rule in both the prompt's `Rules:` block and the Pydantic `Field(description=...)` produced markedly more consistent outputs than relying on either channel alone.
- **Match persona to cognitive task, not to the broad domain.** (See Example 3.) Promoting step 3 from "career advisor" to "senior career strategist" visibly raised output quality on the same input — generic personas produced boilerplate even when the model was capable.
