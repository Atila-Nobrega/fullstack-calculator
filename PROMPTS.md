# Prompt Log

A chronological, verbatim record of every prompt given to Claude Code during this
assessment, each followed by a three-line summary of what that run produced.

---

## Run 1 — 2026-09-03 — Project review & documentation scaffold

**Prompt:**

> We are building a full-stack calculator (using React + FastAPI) for an assessment using this existing template.
> First, review the current directory. You will see I have already configured: Axios on the frontend, Tailwind v4 via the Vite plugin, CORS on the backend. We have dedicated directory for Pytest + HTTPX for testing, and foundational Pydantic models for the requests/responses.
> Before writing application code, create a PROMPTS.md file to log all my prompts, then do a three line summary of each results of that run, this is important for the assessment validation. Then, create docs/ARCHITECTURE.md (detailing the separation of concerns and the setup) and docs/API_CONTRACT.md (documenting the endpoints based on the existing Pydantic models).
> These Docs should contain information that we will introduce on the go. I'll give you futher instructions on the next steps and what is required for us to implement. You can leave the Docs empty for this step.

**Result summary:**

1. Audited the template and confirmed the frontend (React 19 + Vite 8, Tailwind v4 via `@tailwindcss/vite`, Axios) and the backend (FastAPI + CORS allowing `http://localhost:5173`, single `GET /api/health` endpoint, pytest + httpx pinned in `requirements.txt`).
2. Found that `backend/models/schemas.py`, `backend/tests/logic_tests.py` and `backend/tests/integration_tests.py` are all empty files, and `backend/models/` has no `__init__.py` — so no Pydantic models or tests exist yet to document.
3. Created `PROMPTS.md` plus scaffolded `docs/ARCHITECTURE.md` and `docs/API_CONTRACT.md` with section headings and only the facts verifiable today; contract details are marked TBD to be filled in as endpoints are implemented.

---

## Run 2 — 2026-09-03 — Development roadmap agreed

**Prompt:**

> Let's outline our strict development roadmap. Do not generate the code for all these steps yet. Just acknowledge this plan, log it in PROMPTS.md, and wait for my command to begin Step 1.
>
> 1. All the logic functions must be tested. We will created unit tests first for each and run them to make sure everything is validated. The calculator must be able to do the following operations: Addition, Subtraction, Multiplication, Division, Exponentiation, Square Root, Percentage. Raise a custom exception for divison by zero and invalid data.
>
> 2. We must implement a logic function for each operation, aswell each model.
> We include an Enum for each operation, CalculateRequest, CalculateResponde and ErrorResponse basemodels. Validate the logic functions using the unit tests.
>
> 3. Setup the endpoints of our backend and start the integration tests, results should be in JSON format, they should take models into consideration, make a health check on our API to see it is running correctly. Try out one of our endpoint and see if they are working as expected.
>
> 4. Create unit tests for the front-end layer, you can setup a folder for these tests. Use a combination of Vitest and React Testing Library (RTL).
>
> 5. Then we will beging the development of the Frontend layer. We must design and implement Intuitive UI for entering input and displaying results. It should have Input validation and error handling, aswell a responsive design with mobile suport. Validate the UI with the Unit tests.
>
> 6. Then, lests test if both our layers are correctly running together, lets finish all the integration tasks do final touchups.
>
> 7. Finally we should create a backend/Dockerfile and a frontend/Dockerfile, with a docker-compose.yml for full-stack deployment.
>
> 8. Finalize the documentation (setup instructions, API usage, design rationale) in the README.
>
> Confirm you understand this roadmap, log it, and reply with 'Ready for Step 1'. You can fill up each Docs as we go through each step.

**Result summary:**

1. Acknowledged the eight-step, test-first roadmap; no application code was written in this run, per the instruction to wait for the Step 1 command.
2. Logged the roadmap verbatim here and recorded it as the agreed plan of record, with `docs/ARCHITECTURE.md` and `docs/API_CONTRACT.md` to be filled in incrementally at the end of each step.
3. Noted two prerequisites to raise before their steps begin: pytest will not collect the `*_tests.py` filenames without a `python_files` config override (Step 1), and Vitest, RTL and jsdom are not yet in `frontend/package.json` (Step 4).

---

### Roadmap of record

| Step | Scope | Layer | Gate |
| --- | --- | --- | --- |
| 1 | Unit tests for all 7 operations + custom exceptions (division by zero, invalid data), written and run first | `backend/tests/test_unit.py` | Tests exist and fail for the right reason |
| 2 | `logic/calculator.py` functions; `models/schemas.py` — operation `Enum`, `CalculateRequest`, `CalculateResponse`, `ErrorResponse` | `backend/logic/`, `backend/models/` | Step 1 unit tests pass |
| 3 | Endpoints wired to the models, JSON responses, health check, integration tests, manual endpoint smoke test | `backend/main.py`, `backend/tests/test_integration.py` | Integration tests pass; endpoint verified live |
| 4 | Frontend unit tests with Vitest + React Testing Library, in a dedicated test folder | `frontend/` | Tests exist and fail for the right reason |
| 5 | Calculator UI: intuitive input/results, input validation, error handling, responsive with mobile support | `frontend/src/` | Step 4 tests pass |
| 6 | End-to-end run of both layers together; remaining integration work and touch-ups | full stack | Both layers verified running together |
| 7 | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` | repo root + both apps | Full stack runs via compose |
| 8 | Final README: setup instructions, API usage, design rationale | `README.md`, `docs/` | Documentation complete |

**Operations in scope:** Addition, Subtraction, Multiplication, Division,
Exponentiation, Square Root, Percentage.

**Error handling in scope:** three custom exceptions, all deriving from a
`CalculatorError` base so a caller can catch the family with one `except`:

| Exception | Raised when |
| --- | --- |
| `DivisionByZeroError` | The divisor is zero, including `0 ** -n`. |
| `InvalidInputError` | The operand is invalid data — non-numeric, `NaN`, infinite, a negative square root, or a negative base with a fractional exponent. |
| `ResultOverflowError` | The operands were valid but the answer does not fit in a float. Added at the user's direction in Run 4, having initially been folded into `InvalidInputError`. |

---

## Run 3 — 2026-09-03 — Step 1: unit tests for the logic layer

**Prompt:**

> I have fixed the test files names and istalled the missing dependencies. Let start step 1.

**Result summary:**

1. Wrote 233 unit tests in `backend/tests/test_unit.py` covering all seven operations (addition, subtraction, multiplication, division, exponentiation, square root, percentage) plus a shared validation suite and the exception hierarchy, and added `backend/pytest.ini` (`testpaths = tests`, `pythonpath = .`) so `from logic.calculator import ...` resolves from `backend/`.
2. Ran the suite: it fails at collection with `ImportError: cannot import name 'add' from 'logic.calculator'` — the intended test-first failure, since `logic/calculator.py` is empty and `logic/exceptions.py` does not exist yet; collecting the same file against throwaway stubs in a scratch directory confirmed all 233 tests are structurally valid.
3. Confirmed with the user that percentage means "a percent of b" (`(a / 100) * b`), decided the exception design (`CalculatorError` base with `DivisionByZeroError` and `InvalidInputError`), and updated `docs/ARCHITECTURE.md` (error-handling section, test commands, six decision-log entries) and `docs/API_CONTRACT.md` (operations table, domain-error table).

**Step 1 gate:** met — tests exist and fail for the right reason.

---

## Run 4 — 2026-09-03 — Step 2: logic functions and Pydantic models

**Prompt:**

> ResultOverflowError seems better for that edge case. List that exception aswell in the plan.
> Then, lets proceed to step 2.

**Result summary:**

1. Split overflow out of `InvalidInputError` into a third exception, `ResultOverflowError`, updating the roadmap's error-handling scope above, the Step 1 tests, and both docs; added a `TestResultOverflow` class covering the cases where Python returns `inf` silently (`+`, `*`) as well as the one where it raises `OverflowError` (`**`).
2. Implemented `logic/exceptions.py` (three exceptions under a `CalculatorError` base) and `logic/calculator.py` (all seven operations, each validating its own operands and funnelling its result through a finiteness check), plus `models/schemas.py` with the `Operation` and `ErrorCode` enums and the `CalculateRequest`, `CalculateResponse` and `ErrorResponse` models — the request model enforcing operand count per operation and forbidding unknown fields.
3. Ran the suite: **282 unit tests pass** (245 logic, 37 model), and updated `docs/ARCHITECTURE.md` (revised exception tree, a note on why validation deliberately happens in both layers, five more decision entries) and `docs/API_CONTRACT.md` (full field-by-field model documentation with JSON examples and the error-code mapping).

**Step 2 gate:** met — Step 1 unit tests all pass against the implementation.

---

## Run 5 — 2026-09-03 — Step 3: endpoints and integration tests

**Prompt:**

> A have reviewed everything. Seems nice and clear. Lets proceed to step 3 now.

**Result summary:**

1. Wired `POST /api/calculate` and a typed `GET /api/health` in `main.py`, dispatching through an `OPERATIONS` dict keyed by the `Operation` enum, with two app-level exception handlers translating domain errors into 400 and Pydantic rejections into 422 — both emitting the same `ErrorResponse` shape, so the client parses one error format instead of FastAPI's default two.
2. Added 51 integration tests in `tests/test_integration.py` covering the health check, all seven operations over HTTP, every domain and validation error, routing (404/405), CORS preflight and origin rejection, and the OpenAPI schema; the full suite is **333 passing** (282 unit + 51 integration). Also smoke-tested a real uvicorn process over a socket: 11 checks, all passing, including the browser preflight.
3. Restored `docs/ARCHITECTURE.md`, which had reverted on disk to its Run 1 scaffold, keeping the user's shortened wording for the `logic/calculator.py` row; then documented the status-code strategy, the end-to-end data flow, and five more decisions, and completed `docs/API_CONTRACT.md` with both endpoints, worked request/response examples, CORS and OpenAPI sections.

**Step 3 gate:** met — integration tests pass and the endpoints were verified against a live server.

---

## Run 6 — 2026-09-03 — Step 4: frontend unit tests

**Prompt:**

> Great. I tested some of the endpoints here myself too. It is works as intended. Lets proceed to step 4.

**Result summary:**

1. Configured Vitest inside `vite.config.js` (jsdom environment, `tests/setup.js` for RTL cleanup, `tests/**/*.test.{js,jsx}`) and added `test` / `test:watch` scripts, then wrote five suites in the new `frontend/tests/` folder — `operations`, `format`, `client`, `Calculator` and `App` — using only React Testing Library and Vitest's built-in matchers, since `@testing-library/jest-dom` and `user-event` are not installed.
2. The suites define the whole frontend contract before any of it exists: the `OPERATIONS` catalogue mirroring the backend enum, `formatResult` trimming float noise, an axios-mocked `calculate` throwing a typed `ApiError` (including a `network_error` path), and the `Calculator` component's rendering, operation switching, client-side validation, request payloads, loading state, result display and error reporting — all queried by accessible role and label rather than test ids.
3. Ran `npm test`: five files fail, four on unresolved imports for the not-yet-written `src/operations.js`, `src/utils/format.js`, `src/api/client.js` and `src/components/Calculator.jsx`, and `App.test.jsx` failing two of three against the untouched scaffold — the intended test-first failure. Documented the module contract, the UI behaviour it requires, the Vitest setup and eight new decisions in `docs/ARCHITECTURE.md`.

**Step 4 gate:** met — tests exist and fail for the right reason.

---

## Run 7 — 2026-09-03 — Step 5: frontend implementation

**Prompt:**

> I reviewed the tests, they seem quite complete. I got nothing else to add. Lets proceed to step 5.
> - Implement src/utils/format.js to handle the floating-point display logic exactly as tested.
> - Implement src/operations.js with the full array of operations, symbols, and the isUnary helper.
> - Implement src/api/client.js using axios to hit our FastAPI backend, ensuring it properly formats and throws ApiError for both 400s and raw network failures.
> - Implement src/components/Calculator.jsx and src/App.jsx. Use Tailwind CSS v4 for a clean, responsive layout. Ensure the component exactly matches the accessibility roles, labels, and aria-attributes expected by the tests.
> Tell me if I missed anything.

**Result summary:**

1. Implemented all four modules plus `App.jsx`: `formatResult` rounding to 12 significant digits to strip binary float noise; `OPERATIONS` with ids mirroring the backend enum, symbols, labels and per-operation expression renderers; `client.js` wrapping axios and raising a typed `ApiError` for both our `{error, detail}` bodies and unanswered requests; and `Calculator.jsx` with the operation grid, client-side operand parsing, loading state, `role="alert"` errors and an `aria-live` result region, laid out with Tailwind v4 in a single responsive card.
2. **All 68 frontend tests pass** across the five suites on the first run, with `npm run lint` clean and `npm run build` succeeding (245 kB / 80 kB gzipped). The backend suite is untouched at 333 passing.
3. Added the two things the prompt did not cover — `type="button"` on the operation buttons, without which every click would have submitted the form, and the leftover `<title>frontend</title>` in `index.html`, now "Calculator". Documented the layout rationale and five more decisions in `docs/ARCHITECTURE.md`.

**Step 5 gate:** met — the Step 4 tests all pass against the implementation.

---

## Run 8 — 2026-09-03 — Step 6: running both layers together

**Prompt:**

> Those judment calls look great!
>
> please take note of the following, it will be important for the Readme: "I opted for a distinct two-operand form UI rather than a continuous phone style numpad. This ensures a strict 1:1 mapping with the REST API's binary operation contract and prevents the frontend from duplicating math-parsing logic. It keeps the UI simple and the backend smart and clear, I also think this solution better fits the expected time-frame of this task.
>
> A V2 version could be built upon this too, for it look more like a phone calculator, but it would need a refactoring in the backend contracts, more edge-case mapping and a more complex response for the calculator when pressing operation buttons."
>
> The UI looks great and the architecture is solid. Let's move to Steps 6

**Result summary:**

1. Recorded the two-operand-form rationale verbatim as a "Design rationale" section in `docs/ARCHITECTURE.md`, flagged to carry into the README at Step 8, with a note on why a numpad would force either browser-side arithmetic or a stateful per-keystroke API contract.
2. Added `tests/e2e.test.jsx`, the one suite that mocks nothing — real component, real `client.js`, real API — and set the jsdom document origin to `http://localhost:5173` so jsdom's CORS enforcement on XHR makes it verify the backend's CORS config rather than bypass it. With the backend running: **88 frontend tests pass** (68 mocked + 20 cross-layer). With it stopped: 68 pass, 20 skip with a console note. Also started both dev servers together and confirmed Vite serves the app on 5173, the bundle resolves `API_BASE_URL` to `http://localhost:8000`, and the API answers on 8000.
3. Touch-ups: added `frontend/.env.example` documenting that Vite inlines `VITE_API_URL` at build time (which matters for Step 7's image), added `*.log` and `.pytest_cache/` to `.gitignore` and deleted the two stray uvicorn logs. Full state: 333 backend tests, 88 frontend tests, lint clean, production build succeeding.

**Step 6 gate:** met — both layers verified running together, over a real socket and through the real UI.

---

## Run 9 — 2026-09-03 — Step 7: Docker and Compose

**Prompt:**

> Great! Tests are working out. The interface looks good, I also tested it using emulation for devices, I tried it for mobile phone interface and it looks just as good.
>
> Lets go to step 7. We will go with the nginx approach, as the Vite dev Server is too bloated fora container. We can handle the VITE_API_URL issue by reverse-proxy setup we already built, we could use Relative Paths and in the Nginx configuration inside the frontend container, you map /api/ directly to the backend container's address.

**Result summary:**

1. Added `backend/Dockerfile` (python:3.13-slim, non-root `appuser`, urllib health check), `frontend/Dockerfile` (two-stage: node:22-alpine builds, nginx:1.29-alpine serves), `frontend/nginx.conf` (proxies `/api/` to `backend:8000`, SPA fallback, immutable caching on hashed assets and `no-cache` on `index.html`), `docker-compose.yml` gating the frontend on the backend's health check, and a `.dockerignore` for each.
2. Implemented the relative-path scheme by extracting `resolveBaseUrl()` in `src/api/client.js` — `http://localhost:8000` in dev, `""` in a production build, `VITE_API_URL` overriding both — and added six unit tests for it, since `import.meta.env` cannot otherwise be exercised. Frontend suite now 74 passing (20 cross-layer skipped without a backend).
3. Built and ran the stack for real: both containers reach `healthy`, and through nginx on :8080 the app serves, `/api/health`, `/api/calculate` and the unary form all proxy correctly, 400 and 422 error bodies survive intact, the SPA fallback works, cache headers are right, the backend runs as uid 1000, and the bundle's request base is the relative `/api/calculate`. Images: frontend 93 MB, backend 243 MB. Documented all of it as §6 "Deployment" in `docs/ARCHITECTURE.md` with eight new decisions, plus a CORS note in `docs/API_CONTRACT.md`.

**Step 7 gate:** met — the full stack runs via Compose and was verified end to end.

---

## Run 10 — 2026-09-03 — Step 8: README

**Prompt:**

> Let's execute Step 8: Finalizing the documentation.
>
> Please write a clean, concise, and human-readable `README.md` for the repository. A real engineer will read this, so keep it direct, objective, and free of fluff.
>
> Include the following sections:
> 1. Overview: A brief intro to the stack (FastAPI, React, Vite, Tailwind v4, Docker). Just pass through the used stack for the front layer and backend layer.
> 2. Setup Instructions: Keep these dead simple and objective. Provide two clear options:
>    - *Docker Method*: The exact command to run via Docker Compose (`docker compose up --build`).
>    - *Local Development*: Brief steps to boot up the FastAPI backend and Vite frontend separately.
> 3. API Usage: Clear, copy-pasteable `curl` examples for hitting the `/api/calculate` endpoint directly. Mention the URL for the Swagger UI autogenerated Docs that FastAPI provides.
> 4. Design Decisions:
>    - Why we used FastAPI (Pydantic validation, performance, clean separation of concerns, auto docs).
>    - Why we chose a two-operand form UI over a phone-style numpad: *'I opted for a distinct two-operand form UI rather than a continuous phone-style numpad. This ensures a strict 1:1 mapping with the REST API's binary operation contract and prevents the frontend from duplicating math-parsing logic. It keeps the UI simple and the backend smart and clear, and fits the expected timeframe of this task.'*
>    - The Nginx reverse-proxy setup for handling `/api` routing cleanly.
>
> Write it clearly and concisely. Save the output directly to `README.md`.

**Result summary:**

1. Replaced the template `README.md` with the four requested sections: an overview naming both stacks plus a compact repo layout, Docker and local-development setup paths, `curl` examples with operation and error-code tables, and the three design decisions — FastAPI, the two-operand form (user's rationale quoted verbatim), and the nginx reverse proxy.
2. Verified every `curl` example against a running server rather than transcribing them: `add`, `square_root` and the division-by-zero error all return exactly the JSON the README prints, and `/docs` and `/openapi.json` both serve 200.
3. Marked the roadmap complete in `docs/ARCHITECTURE.md`. Final state: 333 backend tests, 94 frontend tests (74 passing plus 20 cross-layer that need a running backend), lint clean, both container images building and running under Compose.

**Step 8 gate:** met — documentation complete.

---

## Run 11 — 2026-09-03 — TypeScript migration and language rationale

**Prompt:**

> please create another branch. We are going to mention this in the readme, that i used python because i feel it is more familiar for me and an equivalent language (write this better). Than make the change from javascript to typescript, test everything and read all docs, we must pretent we did typescrypt all along okay?
>
> (follow-ups) also, make sure you test everything.
>
> Language Selection Trade-off: While Go was the preferred backend language for this assessment, Python/FastAPI was selected to maximize delivery velocity, leverage Pydantic's robust runtime validation, and implement a strict TDD paradigm within the tight time box. mention that this is all stacks i am more familiar with.

**Result summary:**

1. Converted the frontend to TypeScript on branch `feat/typescript`: seven sources and six suites moved to `.ts`/`.tsx`, with `tsconfig.json` project references over a strict app config and a Node config for `vite.config.ts`. Added `CalculationRequest`, `CalculationResponse`, `ErrorCode` and an `OperationId` union mirroring the Pydantic models, a type guard for narrowing unknown error bodies, and a `rejection()` test helper because `.catch(e => e)` widens the result to a union of the value and the error. `npm run build` now runs `tsc -b` first so a type error fails the build.
2. Tested everything: typecheck clean, lint clean, 106 frontend tests passing with a live backend (86 with it stopped, 20 skipped), 333 backend tests passing, 100% coverage on both layers, production build succeeding, and `docker compose up --build` verified end to end — health, percentage, and the division-by-zero error all correct through the nginx proxy with the TypeScript build running inside the image.
3. Added the language-selection rationale to the README — Go was preferred, Python/FastAPI was chosen for delivery velocity, Pydantic's runtime validation and a strict TDD paradigm, all resting on fluency in the stack — plus a section on TypeScript as the cross-layer contract, and updated every file path, command and test count across `README.md` and `docs/ARCHITECTURE.md` with six new decision entries.

**Note on this log:** the docs describe the app as it now stands, in TypeScript.
This entry is not back-dated — the migration happened here, in run 11, and the
git history shows it as its own commit. The earlier runs record what was
actually done at the time.

---

## Project complete

All eight roadmap steps are done. Summary of what was built:

| Layer | Deliverable |
| --- | --- |
| Logic | 7 operations in `backend/logic/calculator.py`, 3 domain exceptions, no framework imports |
| Models | `Operation` and `ErrorCode` enums; `CalculateRequest`, `CalculateResponse`, `ErrorResponse`, `HealthResponse` |
| API | `POST /api/calculate` and `GET /api/health`; app-level exception handlers giving one error shape |
| UI | React + TypeScript calculator with client-side validation, error handling, accessible roles and a responsive Tailwind layout |
| Tests | 333 backend (282 unit + 51 integration), 106 frontend (86 mocked + 20 cross-layer). 100% coverage on both layers |
| Deployment | `backend/Dockerfile`, `frontend/Dockerfile`, `nginx.conf`, `docker-compose.yml` |
| Docs | `README.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACT.md`, this log |
