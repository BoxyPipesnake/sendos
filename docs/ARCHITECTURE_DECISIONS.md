# Architecture Decisions

This document records the meaningful technical decisions taken while building the Sendos Skill Recommender MVP, along with the trade-offs accepted and the planned evolution path.

---

## Decision: In-memory dictionary storage in Phase 1, swapped for PostgreSQL in Phase 3

### Chosen option
Persist profiles in a module-level `dict[str, dict]` keyed by string UUID in `backend/app/routers/profiles.py`. Replace with SQLAlchemy + PostgreSQL in Phase 3 without changing any endpoint signatures or response shapes.

### Justification
The 4-endpoint contract is the hard requirement of the project. Storage is an implementation detail behind those endpoints. By starting with a dictionary, Phase 1 could focus exclusively on getting the API surface right (request validation, response shapes, status flow, error handling) without spending time on database modeling, connection pooling, migrations, or local DB setup.

When Phase 3 swaps in PostgreSQL, the endpoints will not change — only the lines inside each endpoint that read from / write to the store. The Pydantic schemas in `backend/app/schemas.py` are already the source of truth for the request and response shapes; the storage layer just has to produce objects that conform to them.

### Accepted trade-offs
- All data is lost on every server restart. There is no persistence at all in Phase 1 or 2.
- The store is not thread-safe. With Uvicorn running a single worker on the dev box this is fine; under any concurrency it would race.
- We cannot do meaningful queries (filters, joins, pagination) — `GET /api/profiles` does a full scan.

### Mitigations
- The endpoint signatures and Pydantic schemas were designed up-front to look identical to what a SQLAlchemy-backed version would return. The router in Phase 2 builds a `ProfileCreate` model from the dict before calling the analyzer, deliberately practicing the "convert storage shape to typed object" boundary the DB version will need.
- Profile IDs are UUIDs (strings) rather than auto-incremented integers, so no IDs need to be regenerated when the DB lands.

### Evolution plan
- **Phase 3**: introduce `backend/app/database.py` (engine + session factory) and `backend/app/models.py` (SQLAlchemy models). Replace the dict reads/writes inside each endpoint with a session-scoped query. Add `alembic` for migrations. Profile IDs remain UUIDs.
- **Future**: add `created_at` / `updated_at` audit columns and basic indexes once query patterns are clear.

---

## Decision: Synchronous LLM processing — no Celery, Redis, or background queues

### Chosen option
The `POST /api/profiles/{id}/analyze` endpoint runs the three LLM calls inline and only returns to the client once analysis is complete (or has failed). Status is mutated on the stored profile during execution so that a parallel `GET` request can observe `pending_analysis → analyzing → completed` (or `pending_analysis` again on failure).

### Justification
The project brief explicitly excluded queues, workers, and background processing. Beyond compliance with the brief, a synchronous design is also the simplest possible implementation that meets the requirement: no broker to run, no consumer process to keep alive, no state machine to reconcile, no distributed-tracing problem.

For an MVP with one user at a time, the cost of a 10-25 second blocking HTTP call is acceptable. The status flow even gives a frontend a way to display progress feedback by polling `GET /api/profiles/{id}` during execution.

### Accepted trade-offs
- The HTTP request blocks for the full duration of the LLM pipeline (~10-25 seconds in practice). Browsers, proxies, and load balancers often time out around 30-60 seconds, so this design will not scale to slower model combinations or longer chains.
- Anthropic API errors propagate directly to the client. There is no retry, no exponential backoff, no dead-letter queue.
- The server cannot trivially run multiple analyses concurrently because the dict store is not thread-safe (related to the previous decision).

### Mitigations
- The status flow (`pending_analysis → analyzing → completed`) is implemented even though the call is synchronous. A frontend or a test can observe the in-progress state by polling.
- On any exception during analysis, the router resets the profile status back to `pending_analysis` so the client can retry cleanly without manual cleanup.
- Model selection (Haiku for two of the three steps) keeps the typical total latency in the 10-15 second range rather than 30+.

### Evolution plan
- If we ever need to scale beyond one-at-a-time analyses, the analyzer is already cleanly separated behind `ai_analyzer.analyze_profile()`. A future revision could push the call onto a background task (FastAPI's `BackgroundTasks`, a thread, or eventually an external queue) without touching the analyzer code itself.
- A streaming response would require switching to an async path inside the analyzer (LangChain supports both); for now the synchronous interface is simpler.

---

## Decision: Three-step prompt chain instead of one large prompt

### Chosen option
Profile analysis is split into three sequential LLM calls in `backend/app/services/ai_analyzer.py`:

1. **Extract skills** from the profile.
2. **Detect interests** given the profile + extracted skills.
3. **Generate career paths** given the profile + skills + interests.

Each step has its own focused prompt and its own Pydantic output schema. The output of each step is interpolated into the next step's prompt as plain text (the chain link).

### Justification
A single prompt asking the model to "look at this profile and produce skills, interests, and three career paths with development steps" forces the model to do three different cognitive tasks in one shot:
- Mechanical extraction (skills)
- Inference (interests)
- Strategic synthesis (career paths)

These have different reasoning patterns and benefit from different output schemas. Splitting them produces tighter prompts, smaller schemas per call (less room for the model to drift), and isolates where things go wrong if a result looks off. It also makes each step's output independently inspectable, which mattered during development and would matter again for future evaluation work.

### Accepted trade-offs
- Three API calls instead of one. Total latency is the sum of the three (~10-25 seconds).
- More code surface — three step functions and three Pydantic wrapper schemas rather than one of each.
- The chain pattern is implemented manually (each step's output is formatted into the next step's prompt), rather than using a framework like LangGraph that would make the workflow declarative.

### Mitigations
- The cheap steps run on Haiku (see next decision), keeping per-call latency to a few seconds.
- Each step function has the same skeleton (build prompt → bind schema → invoke → unwrap), making the code regular and easy to read once one step is understood.
- The wrapper schemas (`_SkillExtraction`, `_InterestDetection`, `_CareerPathGeneration`) are tiny — one field each — and exist purely to give the LLM a named root object for structured output. The substantive types (`DetectedSkill`, `Recommendation`) are reused across the analyzer output and the API response.

### Evolution plan
- If the workflow grows beyond a simple linear chain (parallel branches, conditional steps, resumable state, streaming progress), migrate to LangGraph's `@task`/`@entrypoint` API. The current step functions would map cleanly onto tasks because they already accept and return plain values.
- If latency becomes a problem, the first two steps could be merged into one Haiku call producing a combined schema, dropping the chain to two steps.

---

## Decision: Mixed model split — Haiku 4.5 for extraction, Sonnet 4.6 for synthesis

### Chosen option
- Step 1 (extract skills) and Step 2 (detect interests) both use `claude-haiku-4-5-20251001`.
- Step 3 (generate career paths) uses `claude-sonnet-4-6`.

Both `ChatAnthropic` instances are created once at module load with tuned `temperature` and `max_tokens`.

### Justification
The three steps have different cognitive demands and therefore different cost-effective price points:

- **Extraction and inference** are mechanical: read the bio, list skills, infer broad interest areas. Haiku is genuinely sufficient for this kind of work and is much faster and cheaper per call.
- **Career path generation** is strategic synthesis: balance skill strengths, interests, and realistic time horizons to propose ranked multi-month plans with development steps. Sonnet's stronger reasoning pays off here and the difference is visible in the output quality (specific, well-justified recommendations rather than generic ones).

A single-model alternative would either pay Sonnet rates on the mechanical steps (~10× the cost for negligible quality gain) or accept Haiku-quality strategic recommendations (visibly more generic in practice).

### Accepted trade-offs
- The codebase has to manage two model instances and pick which one each step uses. This is a small extra surface compared to a single instance.
- Behavior is asymmetric across steps — debugging step 3 means thinking about Sonnet's behavior, debugging steps 1 and 2 means thinking about Haiku's. In practice they behave similarly enough that this has not been an issue.

### Mitigations
- Both instances are configured at the top of `ai_analyzer.py` with named constants (`_HAIKU_MODEL`, `_SONNET_MODEL`). Swapping models in either slot is a one-line change.
- Temperature is tuned per use case: `0.2` for Haiku steps (we want consistent extraction, not creative interpretation) and `0.4` for Sonnet (slight variation in career paths is welcome).

### Evolution plan
- If quality of step 1 or step 2 ever shows drift on harder profiles, promote that step to Sonnet — single-line change.
- If a future Haiku release closes the gap, the analyzer could move all three steps to Haiku for further cost savings — the swap is symmetric.

---

## Decision: Pydantic structured output via `with_structured_output` instead of free-form text + manual parsing

### Chosen option
Each LLM call uses `model.with_structured_output(SchemaClass, method="json_schema")` to constrain the response to a Pydantic-defined shape. LangChain converts the schema into a JSON Schema document, sends it to Anthropic alongside the prompt, and parses the response back into a typed Python object.

Field descriptions on the schemas (`Field(description="...")`) are shipped to the model as part of the schema and act as inline instructions for what each field should contain.

### Justification
Without structured output, the alternative is to ask the model to "return JSON in this shape" in the prompt, receive text back, parse it with `json.loads`, validate it manually, and handle every malformed-response failure mode. That's a known-bug-producing pattern: missing fields, wrong types, extra prose around the JSON, trailing commas, hallucinated keys.

The structured-output path eliminates all of those failure modes at the protocol level. The model is constrained at generation time to produce valid JSON matching the schema; LangChain parses it for us; we get a typed Python object out the other side. The Pydantic schemas defined in `app/schemas.py` already describe the API response shapes — reusing them as LLM output contracts means the analyzer can produce objects that flow straight to the response with no shape adaptation.

### Accepted trade-offs
- The model is constrained to the exact schema shape — if we ever want it to add a justification it can't fit into a field, we'd have to extend the schema first.
- We depend on LangChain's structured-output implementation. If that abstraction broke or changed in a future version, we'd need to either pin around it or call Anthropic's structured-output APIs directly.

### Mitigations
- The schemas are deliberately small and tightly scoped per step. Each step's schema has a clear single purpose (a list of skills, a list of interest strings, a list of recommendations). They're easy to extend if the shape ever needs to evolve.
- The `with_structured_output` call is colocated with each step function. If we ever wanted to swap implementations (use the Anthropic SDK directly, switch to a different framework, etc.), each step is a small, isolated change.

### Evolution plan
- If the project moves to a richer output (e.g., per-step reasoning traces, optional follow-up questions), the wrapper schemas can grow additional fields without touching the surrounding pipeline.
- If the structured-output mechanism ever bottlenecks, we could move to direct Anthropic SDK calls with JSON Schema tool use, at the cost of a few more lines per step. The shape of the function (build prompt → call model → return typed object) would not change.
