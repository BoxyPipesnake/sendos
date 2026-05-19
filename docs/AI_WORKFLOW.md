# AI Workflow

This document describes how AI tools were used while building the Sendos Skill Recommender.

Before staring to code the workflow consisted in: Plan-Implement-Verify, until the code was well understood we continued to the next phase.

---

## Tools Used

### Claude Code (Anthropic's CLI)
Used throughout the build as the primary pair-programming environment. It has direct access to the filesystem, can run shell commands, can stage and commit through git, and can be paused into "plan mode" to align on an approach before writing code. The model behind it was Claude Opus 4.7.

### Context7 MCP Server
Installed at project level via remote HTTP transport (`https://mcp.context7.com/mcp`). Its job is to fetch current documentation for libraries on demand. This is important because Claude's training-data cutoff means it can drift on fast-moving libraries like LangChain — Context7 covers that gap. The MCP exposes two tools:

- `resolve-library-id` — converts a library name (e.g. `langchain-anthropic`) into a Context7-compatible ID.
- `query-docs` — fetches scoped doc snippets for a resolved library ID and a specific question.

Config lives in `.mcp.json` (gitignored, contains the API key). A committable template is at `.mcp.json.example`.

### Anthropic API
The application itself calls Claude Haiku 4.5 and Claude Sonnet 4.6 via `langchain-anthropic`.

---

## Effective Usage Examples

### Example 1: Plan-mode alignment before any implementation

Every non-trivial change (Context7 setup, the Phase 2 AI analyzer, the docs themselves) began by putting Claude Code into **plan mode**. In plan mode the assistant can read and search but cannot edit files or run state-changing commands — its only writable artifact is a plan file.

The flow looked like:

1. State the goal in plain language.
2. Claude explores the codebase and asks 1-3 clarifying questions if needed.
3. Claude drafts a plan with: context, the files it intends to touch, the design approach, and a verification section describing how the work will be tested.
4. I review the plan and either approve it (`ExitPlanMode`) or push back with adjustments.
5. Only after approval does any code get written.

**Why this worked.** It separated *design discussion* from *implementation*. By the time Claude was actually writing code, both of us already agreed on what was being built and how. The plan also served as a written record I could refer back to mid-implementation — useful when a 200-line analyzer was being assembled across several files.

**Concrete payoff during this project.** The Phase 2 plan explicitly listed the three pipeline steps, the model assignments (Haiku/Haiku/Sonnet), the file structure, and the verification steps. When implementation happened, there were no surprises — and when I asked questions later ("why three steps?", "what does `Field` do?"), the answers were already grounded in the agreed plan.

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

- The **role** primes the model's tone and focus. The model behaves differently as a "technical talent assessor" versus as a "career strategist" — both are appropriate for their respective steps.
- The **rules** constrain content (allowed values, conservatism guidance, range limits). They're not redundant with the Pydantic schema descriptions — they reinforce the same constraints through a second channel, which made the model markedly more consistent during testing.
- The **data** block is clearly labeled (`PROFILE:`, `DETECTED SKILLS:`, etc.) so the model can parse the structure of the input even though it's plain text.

**The two-channel constraint pattern was a deliberate choice.** Pydantic's `Field(description="...")` ships instructions to the model through the structured-output schema, and the prompt's rules section repeats them in natural language. If one channel ever drifted (a model interpreting JSON Schema descriptions loosely, or a model skimming a long prompt), the other channel still anchored the behavior.

### Example 3: Per-step persona shifts as deliberate prompt design

The three pipeline steps use three different personas, even though steps 1 and 2 use the same model (Haiku):

| Step | Persona | Cognitive task |
|---|---|---|
| 1 | "Technical talent assessor" | Enumerate evidence into a list of skills |
| 2 | "Career advisor" | Interpret skills into broader interest areas |
| 3 | "Senior career strategist" | Synthesize skills + interests into multi-month plans |

**Why this worked.** Each persona matches the *kind of thinking* the step requires. An assessor enumerates; an advisor interprets; a strategist plans. A single shared persona (e.g. "career expert") would still produce results, but each step would inherit a tone slightly mismatched to its work — the assessor step might produce vaguer skills, the strategist step might produce less ambitious paths.

**Observable effect in testing.** When the analyzer ran on a real profile, the career-paths output explicitly referenced things like "Alex's combination of backend + ML" and produced specific named paths ("ML Platform Engineer," "Senior Platform / Infrastructure Engineer") with reasoned justifications. That's the kind of output that comes from a "strategist" framing — generic personas tend to produce more boilerplate.

### Example 4: Mocking the LLM at the application boundary for tests

The Phase 4 integration tests do not call Anthropic. The `mock_ai_analyzer` fixture in `backend/tests/conftest.py` monkey-patches `app.routers.profiles.ai_analyzer.analyze_profile` with a function that returns a canned `(Analysis, list[Recommendation])` pair — the same Pydantic types the real analyzer returns.

**Why this worked.** Three things would otherwise have broken the test suite:

- **Cost.** Real analyze calls cost money. A 6-test suite firing analyze on every CI run would charge real dollars per run.
- **Speed.** A real analyze call takes 15-25 seconds. The whole 6-test suite would take 90+ seconds; the feedback loop would die. With the mock the suite runs in ~1.6 seconds.
- **Determinism.** LLM outputs vary. Tests that assert on specific skill names would flake.

The mock replaces the AI at the **router's view of the analyzer** — not deeper. Everything else (Pydantic validation, SQLAlchemy session, JSONB serialization, the status lifecycle, the two-transaction analyze pattern) runs under real test. The integration tests verify *given an Analysis and Recommendations, the endpoint correctly persists and returns them*. The quality of the AI output is a separate concern, evaluated manually during Phase 3 verification.

---

## Prompt Iteration

### Iteration example: catching wrong version pins through verification



### What I learned.


### Prompting patterns that worked

A small list of habits that produced noticeably better outcomes:

- **Section-by-section explanation requests.** When I asked Claude to explain the analyzer code, I asked for it in pieces (first the three schemas, then the orchestrator, then the step functions, then the helper). Each piece was small enough to absorb, and I could verify my understanding before moving on. Wholesale dumps would have washed over me.
