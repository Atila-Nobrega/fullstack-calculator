# Architecture

> Living document. Sections marked _TBD_ are filled in as the corresponding
> feature is implemented.

## 1. Overview

Two independently runnable applications, talking over HTTP/JSON:

```
frontend/  React 19 + Vite 8 SPA      -> http://localhost:5173
backend/   FastAPI + Uvicorn service  -> http://localhost:8000
```

The frontend owns presentation and input handling. The backend owns arithmetic
evaluation and validation. No calculation logic is duplicated in the browser.

Containerised, they sit behind one origin instead — see §7.

## 2. Separation of concerns

### Frontend (`frontend/`)

| Path | Responsibility |
| --- | --- |
| `index.html` | Vite entry document; mounts `#root`. |
| `src/main.jsx` | React root bootstrap (`StrictMode`). |
| `src/App.jsx` | Application shell; mounts the calculator. |
| `src/components/Calculator.jsx` | The calculator UI: operand fields, operation buttons, result and error display. |
| `src/api/client.js` | Axios wrapper around the API; the only module that talks to the network. |
| `src/operations.js` | The operation catalogue — ids, labels, symbols, arity. |
| `src/utils/format.js` | Result formatting for display. |
| `src/index.css` | Tailwind v4 entry (`@import "tailwindcss"`). |
| `vite.config.js` | Vite plugins and the Vitest configuration. |
| `tests/` | Vitest + React Testing Library suites, one per module. |
| `tests/e2e.test.jsx` | Cross-layer suite: real UI, real client, real API. |
| `.env.example` | Documents `VITE_API_URL`. |

The split mirrors the backend's: `Calculator.jsx` owns presentation and local
state, `client.js` owns the network, `format.js` and `operations.js` are pure
modules with no React in them. Only `client.js` imports axios, so the component
tests can mock one module and never touch HTTP.

#### Frontend module contract

Pinned by the Step 4 tests, before any of it is implemented:

| Export | From | Behaviour |
| --- | --- | --- |
| `OPERATIONS` | `src/operations.js` | Ordered array of `{id, label, symbol, expression}`; ids match the backend enum exactly. |
| `isUnary(id)` | `src/operations.js` | True only for `square_root`; an unknown id is binary, not an error. |
| `operationById(id)` | `src/operations.js` | Look up one entry. |
| `formatResult(value)` | `src/utils/format.js` | Number → display string, trimming float noise. |
| `API_BASE_URL` | `src/api/client.js` | Backend origin. |
| `ApiError` | `src/api/client.js` | `Error` subclass carrying `.code` and `.message`. |
| `calculate({operation, a, b})` | `src/api/client.js` | POSTs and returns the body; throws `ApiError` on failure. Omits `b` when undefined. |
| `Calculator` (default) | `src/components/Calculator.jsx` | The UI described below. |

UI behaviour the tests require:

- One button per operation, each with an accessible name and `aria-pressed`;
  addition is selected on load.
- Two fields labelled "First number" and "Second number"; the second is
  **removed from the DOM** when square root is selected, and the first operand
  survives an operation change.
- Client-side validation before any request: empty and non-numeric operands
  (including a lone `-`) produce a `role="alert"` message and no network call.
- The result appears in a `role="status"` region with `aria-live="polite"`, run
  through `formatResult`.
- A failed calculation clears the stale result; a successful one clears the
  error. The submit button is disabled while a request is in flight and
  re-enabled afterwards, including after a failure.
- Operand fields are `type="text"` with `inputMode="decimal"` — the text type
  keeps validation in our hands (`type="number"` silently discards unparseable
  input, hiding the mistake instead of explaining it), while the input mode
  still gets a numeric keypad on mobile.

#### Layout

One card, `max-w-md`, centred on a `min-h-screen` page with padding — so on a
phone it fills the width with a comfortable margin, and on a desktop it stays a
readable column rather than stretching. Operations sit in a four-column grid
that reflows to two rows without a breakpoint. Buttons and inputs are `py-3` at
`text-lg`, which puts every touch target near 48px. Long results wrap with
`break-all` instead of overflowing the card.

The result region shows the sum as well as the answer — `0.1 + 0.2 = 0.3` —
rendered from the values that were *sent*, so editing a field afterwards cannot
leave the displayed sum disagreeing with the answer above it.

### Backend (`backend/`)

| Path | Responsibility |
| --- | --- |
| `main.py` | FastAPI app, CORS middleware, route definitions, error translation. |
| `logic/calculator.py` | calculation logic |
| `logic/exceptions.py` | Domain exceptions raised by `logic/`. |
| `models/schemas.py` | Pydantic request/response models — the API contract in code. |
| `tests/test_unit.py` | Unit tests for `logic/` and `models/` — called directly, no HTTP. |
| `tests/test_integration.py` | HTTP-level tests via `httpx` against the ASGI app. |
| `pytest.ini` | pytest config: `testpaths = tests`, `pythonpath = .`. |
| `requirements.txt` | Pinned Python dependencies. |

Each package has an `__init__.py`, so all three are importable from the
`backend/` working directory.

The backend is layered so that each concern is testable on its own:

```
HTTP request
  -> main.py          routing, status codes, CORS, error translation
  -> models/schemas   validation and serialisation
  -> logic/calculator arithmetic, domain errors
```

`logic/` must not import from FastAPI, and `main.py` must not contain
arithmetic. That boundary is what lets `tests/test_unit.py` stay fast and
HTTP-free while `tests/test_integration.py` covers the wiring.

### Error handling

`logic/` signals every failure with a domain exception from
`logic/exceptions.py`, never with an HTTP status code or a sentinel value:

```
CalculatorError            base class -- catch this to catch them all
├── DivisionByZeroError    the divisor was zero
├── InvalidInputError      an operand the domain cannot accept
└── ResultOverflowError    valid operands, unrepresentable answer
```

The three map to distinctions a user actually acts on: *you divided by zero*,
*that input has no answer*, and *the answer is too big*. `InvalidInputError`
covers non-numeric operands, `NaN` and infinity, the square root of a negative
number, and a negative base with a fractional exponent — all cases where the
operand itself is the problem. `ResultOverflowError` is deliberately separate:
nothing was wrong with what the user supplied, so reporting it as invalid input
would point them at the wrong thing.

Overflow is checked on the way out of every operation, not just where Python
raises. Python is inconsistent here — `**` raises `OverflowError`, while `+`
and `*` quietly return `inf` — so `logic/calculator.py` funnels every result
through a finiteness check. That also keeps `inf` out of the JSON, where it has
no valid representation.

`main.py` translates those exceptions into responses via two app-level
exception handlers, so no route needs a `try`/`except`:

| Raised | Status | `error` code |
| --- | --- | --- |
| `DivisionByZeroError` | 400 | `division_by_zero` |
| `InvalidInputError` | 400 | `invalid_input` |
| `ResultOverflowError` | 400 | `result_overflow` |
| `RequestValidationError` (Pydantic) | 422 | `validation_error` |

The 400/422 split is the useful one for a client: **422 means the request was
malformed** — unknown operation, missing operand, wrong type — and the fix is
to change the request's shape. **400 means the request was well-formed but the
arithmetic could not be done**, and the fix is to change the values. Starlette
walks an exception's MRO when matching handlers, so registering
`CalculatorError` covers all three subclasses.

Both handlers emit the same `ErrorResponse` body. FastAPI's default 422 is a
list of Pydantic error dicts, which would have given the client a second error
format to parse; `_describe()` flattens it into one sentence.

### Validation happens twice, on purpose

`models/schemas.py` validates the JSON body, and `logic/calculator.py`
validates its own operands again. This is not redundancy to remove: the logic
layer is an ordinary library that is unit-tested directly and could be called
from a CLI or a script, so it cannot assume a Pydantic model already ran. The
two layers also catch different things — Pydantic rejects malformed *requests*
(unknown operation, missing `b`, unknown fields), while the logic layer rejects
impossible *arithmetic* (negative square root, division by zero).

## 3. Current state

- `main.py` exposes two routes: `GET /api/health` and `POST /api/calculate`.
- CORS allows `http://localhost:5173` and `http://127.0.0.1:5173` (Vite prints
  both on startup and either can be the page's origin), with all methods and
  headers.
- `logic/calculator.py` implements all seven operations; `logic/exceptions.py`
  defines the three domain exceptions.
- `models/schemas.py` defines `Operation`, `ErrorCode`, `CalculateRequest`,
  `CalculateResponse`, `ErrorResponse` and `HealthResponse`.
- **333 backend tests pass** — 282 unit, 51 integration.
- **88 frontend tests pass** with a backend running — 68 mocked, 20 cross-layer.
  Without a backend the cross-layer suite skips and the other 68 still pass.
- `npm run lint` is clean; `npm run build` succeeds (245 kB, 80 kB gzipped).
- Both dev servers have been run together and verified: Vite serves the app on
  5173, the bundle resolves `API_BASE_URL` to `http://localhost:8000`, and the
  API answers on 8000.
- Containerised and verified: `docker compose up --build` serves the app at
  `http://localhost:8080` with the API proxied under `/api/` (see §6).
- `README.md` covers setup, API usage and design rationale; this document and
  `API_CONTRACT.md` hold the detail it links to.

All eight roadmap steps are complete.

## 4. Data flow

One calculation, end to end:

```
 browser              main.py                    models/            logic/
    |                    |                          |                  |
    |-- POST /api/calculate ------------------------>|                  |
    |   {"operation":"divide","a":7,"b":2}           |                  |
    |                    |  parse + validate body -->|                  |
    |                    |<-- CalculateRequest ------|                  |
    |                    |                                             |
    |                    |-- OPERATIONS[op](a, b) --------------------->|
    |                    |<-- 3.5, or raises CalculatorError -----------|
    |                    |                                             |
    |                    |  build CalculateResponse                    |
    |<-- 200 {"operation":"divide","a":7.0,"b":2.0,"result":3.5} -------|
```

On failure the same path ends at an exception handler instead, which returns an
`ErrorResponse` with the status code from the table above. The request never
reaches `logic/` if Pydantic rejects it first.

`main.py` dispatches through an `OPERATIONS` dict keyed by the `Operation`
enum. The dict lives in `main.py`, not `logic/`, so the calculation module
stays a plain library that knows nothing about the API's enum. A test asserts
`set(OPERATIONS) == set(Operation)`, so adding an operation without wiring it
up fails the suite rather than 500-ing at runtime.

## 5. Setup

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

Interactive API docs: <http://localhost:8000/docs>

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

App: <http://localhost:5173>

### Tests

Run from the `backend/` directory with the virtualenv active:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest                             # everything
pytest tests/test_unit.py          # logic and models only
pytest tests/test_integration.py   # HTTP layer only
```

`pytest.ini` sets `pythonpath = .` so `from logic.calculator import add`
resolves against `backend/` regardless of how pytest is invoked, and
`testpaths = tests` so a bare `pytest` does not walk `.venv/`.

Integration tests drive the ASGI app through FastAPI's `TestClient`, which uses
`httpx` internally — no server process required.

Frontend tests run from `frontend/`:

```powershell
cd frontend
npm test          # single run
npm run test:watch
```

Vitest is configured inside `vite.config.js` (`environment: 'jsdom'`,
`setupFiles: './tests/setup.js'`, `include: ['tests/**/*.test.{js,jsx}']`), so
the test build reuses the app's own plugins and resolution rather than a second
config that could drift from it. `tests/setup.js` runs RTL's `cleanup()` after
each test; without it, each render would stack on the previous one's markup and
role queries would start matching two of everything.

The suites use only React Testing Library and Vitest's built-in matchers —
`@testing-library/jest-dom` and `user-event` are deliberately not dependencies,
so the suite runs against what is already installed.

#### The cross-layer suite

Every other frontend suite mocks `client.js`, which means a contract drift
between the two layers — a renamed error code, a changed field, a CORS origin
that stopped matching — would pass all of them. `tests/e2e.test.jsx` is the one
place that catches it: nothing is mocked, so the real component calls the real
client, which calls the real API.

It runs inside jsdom, which enforces CORS on `XMLHttpRequest`. Setting the jsdom
document origin to `http://localhost:5173` in `vite.config.js` therefore makes
the suite subject to exactly the origin checks a browser applies — a backend
CORS misconfiguration fails these tests rather than surfacing later in a console
the tests never read.

It needs a running backend, so it skips itself when one is not there:

```powershell
# terminal 1
cd backend; .\.venv\Scripts\Activate.ps1; uvicorn main:app

# terminal 2
cd frontend; npm test
```

With the backend up: 88 tests. Without it: 68 pass, 20 skip with a console note
naming the command to start one. Skipping rather than failing keeps `npm test`
meaningful for someone working on the frontend alone.

## 6. Deployment

```powershell
docker compose up --build   # then open http://localhost:8080
```

| Container | Image | Port | Contents |
| --- | --- | --- | --- |
| `calculator-frontend` | `nginx:1.29-alpine` | `8080 -> 80` | The built bundle plus `nginx.conf` — 93 MB |
| `calculator-backend` | `python:3.13-slim` | `8000 -> 8000` | The FastAPI app under uvicorn — 243 MB |

### Two topologies, one codebase

```
development                        docker compose
-----------                        --------------
browser                            browser
  |                                  |
  |-- :5173 --> Vite (app)           |-- :8080 --> nginx
  |                                             |-- /        -> static bundle
  '-- :8000 --> uvicorn (API)                   '-- /api/    -> backend:8000
      cross-origin, CORS applies                same-origin, no CORS
```

In development the app and the API are separate origins, which is what the
backend's CORS allowlist is for. Under Compose there is only one origin: nginx
serves the bundle and proxies `/api/` over the internal network, so the browser
never makes a cross-origin request and CORS is not involved at all.

`resolveBaseUrl()` in `src/api/client.js` is what lets one build serve both.
It returns `http://localhost:8000` in development and `""` — meaning relative —
in a production build, so the bundle requests `/api/calculate` and `nginx.conf`
decides where that goes. The backend can move without rebuilding the frontend.
`VITE_API_URL` overrides it for a deployment that is not proxying.

### Container details

- **The frontend build is two-stage.** Node and `node_modules` stay in the
  builder; the shipped image is static files plus nginx, with no JavaScript
  runtime present. 93 MB rather than several hundred.
- **The backend runs as a non-root user** (`appuser`, uid 1000), so a
  compromise in the app has no privileges to escalate with.
- **Both images declare a `HEALTHCHECK`**, and Compose gates the frontend on
  `condition: service_healthy`. nginx resolves `backend` at startup and exits
  if the name is not yet resolvable, so starting it before the API is up would
  fail the container outright rather than merely 502 for a moment.
- **Dependencies are copied and installed before the source** in both images,
  so editing a source file does not invalidate the dependency layer.
- **Hashed assets get `Cache-Control: immutable` for a year; `index.html` gets
  `no-cache`** — otherwise a browser would keep loading a stale page that
  references asset filenames the new deploy no longer has.
- **Publishing the backend's port is a convenience, not a requirement.** It is
  mapped only so `/docs` is reachable while developing; the frontend reaches
  the API over the internal network. A real deployment would drop it.

### Verified

`docker compose up --build` was run and the stack exercised end to end:

| Check | Result |
| --- | --- |
| Both containers reach `healthy` | ✅ |
| `GET /` through nginx | `200`, `<title>Calculator</title>` |
| `GET /api/health` proxied | `200 {"status":"ok"}` |
| `POST /api/calculate` proxied | `200 {"operation":"divide","a":7.0,"b":2.0,"result":3.5}` |
| Unary through the proxy | `200 {"operation":"square_root","a":9.0,"b":null,"result":3.0}` |
| Domain error preserved | `400 {"error":"division_by_zero",...}` |
| Validation error preserved | `422 {"error":"validation_error",...}` |
| SPA fallback on an unknown path | `200`, serves `index.html` |
| Asset cache headers | `max-age=31536000, public, immutable` |
| `index.html` cache header | `no-cache` |
| Backend container user | `uid=1000(appuser)` |
| Request base in the bundle | `/api/calculate` — relative, as intended |

The literal `http://localhost:8000` does appear in the bundle, as the
unevaluated branch of `resolveBaseUrl`'s ternary. It is never the request base:
the minified output resolves to `` `${kr(``,!0)}/api/calculate` ``, i.e. the
empty string concatenated with the path.

## 7. Design rationale

### Why a two-operand form, not a phone-style numpad

> I opted for a distinct two-operand form UI rather than a continuous phone
> style numpad. This ensures a strict 1:1 mapping with the REST API's binary
> operation contract and prevents the frontend from duplicating math-parsing
> logic. It keeps the UI simple and the backend smart and clear, I also think
> this solution better fits the expected time-frame of this task.
>
> A V2 version could be built upon this too, for it look more like a phone
> calculator, but it would need a refactoring in the backend contracts, more
> edge-case mapping and a more complex response for the calculator when
> pressing operation buttons.

Concretely, the form shape is what lets `POST /api/calculate` stay a pure
function of `{operation, a, b}`. A numpad implies an expression being built up
over time — operator precedence, pending operands, a running accumulator — and
all of that state either lives in the browser (duplicating the arithmetic this
project deliberately keeps server-side) or forces the API into a stateful,
per-keystroke contract. Neither is a better calculator; both are a bigger one.

_Carry this into the README at Step 8._

## 8. Decisions log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-09-02 | Calculation stays server-side | Single source of truth; keeps the assessment's backend meaningful. |
| 2026-09-02 | Calculation logic lives in `logic/`, separate from `main.py` | Keeps arithmetic unit-testable without an HTTP client and stops routing concerns leaking into the domain. |
| 2026-09-02 | `percentage(a, b)` means "a percent of b" — `(a / 100) * b` | Matches how a calculator's `%` key is normally read, keeps the two-operand shape of the other binary operations, and never divides by an operand. |
| 2026-09-02 | Three domain exceptions | `DivisionByZeroError`, `InvalidInputError` and `ResultOverflowError` are the distinctions a user acts on. Overflow was initially folded into invalid input and split out on review: the operands are valid there, so blaming the input misdirects the user. |
| 2026-09-02 | Every result passes a finiteness check | `**` raises `OverflowError` but `+` and `*` return `inf` silently, and `inf` is not valid JSON — checking on the way out makes the behaviour uniform. |
| 2026-09-02 | Logic validates its own operands rather than trusting Pydantic | The logic layer is a library in its own right and is tested directly, so it cannot assume every caller came through the API. |
| 2026-09-02 | `bool` is rejected as an operand | `bool` subclasses `int`, so a naive `isinstance` check would let `add(True, True)` return `2.0`. |
| 2026-09-02 | Results are not rounded in `logic/` | Rounding is presentation; the domain returns full float precision and the UI decides how to display it. |
| 2026-09-02 | `square_root` is unary; sending `b` is an error, not ignored | Silently discarding an operand hides a client bug; a 422 naming the problem is more useful than a wrong-looking answer. |
| 2026-09-02 | Requests use `extra="forbid"` | A typo'd field name fails loudly instead of being dropped. |
| 2026-09-02 | `ErrorResponse` carries a machine-readable `error` code beside `detail` | Lets the frontend branch on the failure type while leaving the wording free to change. |
| 2026-09-02 | Domain errors are 400, schema errors 422 | Tells the client whether to fix the request's *shape* or its *values* — a distinction that matters for which UI message to show. |
| 2026-09-02 | Errors are handled app-wide, not per route | Two `@app.exception_handler` registrations keep every route free of `try`/`except` and guarantee one error shape across the API. |
| 2026-09-02 | The 422 body is reshaped into `ErrorResponse` | FastAPI's default is a list of Pydantic dicts; overriding it means the client parses one error format instead of two. |
| 2026-09-02 | `OPERATIONS` dispatch lives in `main.py` | Keeps `logic/` unaware of the API enum; a test asserts the mapping is exhaustive so a new operation cannot be left unwired. |
| 2026-09-02 | `/api/health` returns a typed `HealthResponse` | Puts the probe in the OpenAPI schema instead of returning an untyped dict, and gives Compose a documented endpoint to poll in Step 7. |
| 2026-09-03 | Frontend tests live in `frontend/tests/`, not beside the source | Keeps the shipped `src/` tree free of test files and matches the backend's `tests/` layout. |
| 2026-09-03 | Vitest configured in `vite.config.js` rather than its own file | One config means the tests resolve modules exactly as the app does; a separate `vitest.config.js` can drift from the build. |
| 2026-09-03 | Tests query by role and label, never by test id | A passing test then also proves the control is reachable by screen reader and keyboard, so accessibility cannot silently regress. |
| 2026-09-03 | Operand fields are `type="text"` with `inputMode="decimal"` | `type="number"` discards unparseable input before React sees it, so the user gets no explanation; text keeps validation ours while the input mode still raises a numeric keypad on mobile. |
| 2026-09-03 | The second operand field is unmounted, not disabled, for square root | The backend rejects a `square_root` request carrying `b`, so the field should not exist to be filled. |
| 2026-09-03 | Only `client.js` imports axios | Component tests mock a single module instead of stubbing HTTP, and swapping the HTTP library later touches one file. |
| 2026-09-03 | `operations.js` duplicates the backend enum, and a test asserts the list | The ids go on the wire verbatim; the test turns a typo into a build failure rather than a 422 at runtime. |
| 2026-09-03 | No `@testing-library/jest-dom` or `user-event` | The suite runs on the packages already installed; the readability gain did not justify adding dependencies mid-assessment. |
| 2026-09-03 | `API_BASE_URL` reads `VITE_API_URL` with a localhost fallback | Dev needs no configuration, and the Compose build in Step 7 can point the bundle at another host without a code change. |
| 2026-09-03 | The result region shows the expression as well as the answer | `0.1 + 0.2 = 0.3` tells the user what was actually sent, which matters when the operands were coerced or the operation was switched. |
| 2026-09-03 | The expression is built from the values sent, not the current fields | Otherwise editing a field after a calculation would leave the shown sum disagreeing with the answer above it. |
| 2026-09-03 | Changing operation clears the result | A result from a different operator is stale and misleading beside the new one. |
| 2026-09-03 | Operation buttons carry `aria-label` and hide the symbol with `aria-hidden` | A screen reader announces "Multiplication", not "times sign"; sighted users still get the compact glyph. |
| 2026-09-03 | A cross-layer suite that mocks nothing | Every other frontend test mocks the client, so only this one can catch the two layers drifting apart. |
| 2026-09-03 | jsdom origin set to `http://localhost:5173` | jsdom enforces CORS on XHR, so the cross-layer suite verifies the backend's CORS config instead of bypassing it. |
| 2026-09-03 | The cross-layer suite skips when no backend is running | Failing would make `npm test` useless to anyone working on the frontend alone; a console note names the command to start one. |
| 2026-09-03 | `*.log` added to `.gitignore` | Uvicorn's redirected output was sitting untracked in `backend/`. |
| 2026-09-03 | nginx serves the built bundle; the Vite dev server is not containerised | A dev server in a production image ships a compiler, a file watcher and a JS runtime to do the job of a static file server. |
| 2026-09-03 | nginx proxies `/api/` to the backend container | Makes the browser same-origin, so CORS drops out of the deployed path entirely and the API's address is not a build input. |
| 2026-09-03 | A production build defaults `API_BASE_URL` to `""` | Relative requests are what the proxy needs; the alternative is baking a hostname into the bundle at build time and rebuilding whenever it changes. |
| 2026-09-03 | `resolveBaseUrl` is an exported pure function | `import.meta.env` is not injectable, so extracting the decision is the only way to unit-test the dev/prod/override branches. |
| 2026-09-03 | Frontend image is two-stage | Keeps Node and `node_modules` out of the shipped image — 93 MB with no JS runtime to attack. |
| 2026-09-03 | The backend container runs as a non-root user | Standard hardening; a compromise in the app then has nothing to escalate to. |
| 2026-09-03 | Both images declare a `HEALTHCHECK`, and Compose waits for `service_healthy` | nginx resolves `backend` at startup and exits if the name is unresolvable, so ordering is a correctness matter, not just tidiness. |
| 2026-09-03 | The backend's port is published anyway | Only so `/docs` is reachable while developing; the frontend uses the internal network, so a real deployment can remove the mapping. |
