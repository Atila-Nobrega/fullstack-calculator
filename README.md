# Calculator

A full-stack calculator. The browser collects two operands and an operation;
the API does the arithmetic and returns JSON. No calculation logic runs in the
browser.

Supports addition, subtraction, multiplication, division, exponentiation,
square root and percentage.

## AI tooling

This project was built with Claude Code. Every prompt given to it is recorded
verbatim in **[PROMPTS.md](PROMPTS.md)**, each with a summary of what that run
produced.

The log follows the development sequence: tests were written and run before the
code they cover, at both layers, and each step's gate is recorded. Every step was reviewed before proceding to the next.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) carries the full decision log
alongside it.

## Overview

**Backend** — Python 3.13, FastAPI, Pydantic v2, Uvicorn. Tested with pytest
and httpx.

**Frontend** — React 19, Vite 8, Tailwind CSS v4 (via `@tailwindcss/vite`),
Axios. Tested with Vitest and React Testing Library.

**Deployment** — Docker Compose: nginx serves the built bundle and reverse
proxies `/api/` to the backend container.

```
backend/
  main.py              FastAPI app: routing, CORS, error translation
  logic/               pure arithmetic + domain exceptions (no FastAPI here)
  models/schemas.py    Pydantic request/response models
  tests/               unit + integration suites
frontend/
  src/components/      the calculator UI
  src/api/client.js    the only module that talks to the network
  src/operations.js    operation catalogue, mirrors the backend enum
  tests/               Vitest + RTL suites
docs/
  ARCHITECTURE.md      separation of concerns, data flow, decision log
  API_CONTRACT.md      full endpoint and model reference
```

## Design decisions

Full decision log in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### FastAPI for the backend

Pydantic models are the API contract expressed in code. One model definition
gives request validation, response serialisation and the OpenAPI schema at
`/docs`, so the documentation cannot drift from the implementation. Being ASGI,
it also handles concurrent requests without a thread per connection.

It supports a clean split: `logic/` is plain Python with no FastAPI import,
`main.py` is HTTP with no arithmetic. The arithmetic is unit-tested by calling
functions directly, and the wiring is tested separately over HTTP. `logic/`
raises domain exceptions (`DivisionByZeroError`, `InvalidInputError`,
`ResultOverflowError`); `main.py` translates them into status codes in one
place, so no route needs a `try`/`except`.

### A two-operand form, not a phone-style numpad

> I opted for a distinct two-operand form UI rather than a continuous
> phone-style numpad. This ensures a strict 1:1 mapping with the REST API's
> binary operation contract and prevents the frontend from duplicating
> math-parsing logic. It keeps the UI simple and the backend smart and clear,
> and fits the expected timeframe of this task.

A numpad implies an expression built up over time — operator precedence,
pending operands, a running accumulator. That state either lives in the browser,
duplicating the arithmetic this project deliberately keeps server-side, or
forces the API into a stateful per-keystroke contract. A V2 could add the
numpad, but it would need reworked backend contracts and considerably more
edge-case mapping.

### Nginx reverse proxy for `/api`

In the container, nginx serves the static bundle and proxies `/api/` to the
backend over Compose's internal network. Two consequences:

- **No CORS.** The browser only ever talks to one origin, so cross-origin rules
  never apply. The backend's CORS allowlist exists purely for local development,
  where Vite (`:5173`) and Uvicorn (`:8000`) are separate origins.
- **No hard-coded API host in the bundle.** Vite inlines environment variables
  at build time, so an absolute URL would bake the backend's address into the
  image. A production build instead resolves the base URL to an empty string and
  requests `/api/calculate` relatively; nginx decides where that goes. The
  backend can move without rebuilding the frontend.

Serving through nginx also keeps Node, `node_modules` and the Vite dev server
out of the shipped image — 93 MB of static files and a web server, with no
JavaScript runtime present.

## Setup

### Option 1 — Docker (recommended)

```bash
docker compose up --build
```

- App: <http://localhost:8080>
- API docs: <http://localhost:8000/docs>

Nothing else to configure. The frontend container waits for the backend's
health check before starting.

### Option 2 — Local development

Two terminals.

**Backend** (<http://localhost:8000>):

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend** (<http://localhost:5173>):

```bash
cd frontend
npm install
npm run dev
```

The frontend defaults to `http://localhost:8000` in development, so no
environment file is needed. Override with `VITE_API_URL` if the API is
somewhere else — see `frontend/.env.example`.

### Tests

Both suites need their dependencies installed first (see above).

**Backend** — from `backend/`, with the virtualenv active:

```bash
pytest                            # all 333 tests
pytest tests/test_unit.py         # logic and models only
pytest tests/test_integration.py  # HTTP layer only
pytest -v                         # per-test names
```

**Frontend** — from `frontend/`:

```bash
npm test                          # single run, 106 tests
npm run test:watch                # re-runs on file change
npm test -- Calculator            # only files matching "Calculator"
```

20 of the frontend tests are cross-layer: they drive the real UI against a real
API with nothing mocked. They **skip automatically** when no backend is running,
so start one first to include them:

```bash
# terminal 1
cd backend && uvicorn main:app

# terminal 2
cd frontend && npm test           # now 106 run instead of 86
```

### Coverage

```bash
cd backend  && pytest --cov       # terminal report
cd frontend && npm run test:coverage
```

| | Statements | Branches | Detail |
| --- | --- | --- | --- |
| Backend (`logic/`, `models/`, `main.py`) | **100%** | — | 131 statements, 0 missed |
| Frontend (`src/`, excluding `main.jsx`) | **100%** | 100% | 79/79 statements, 24/24 functions |

Backend coverage is measured against the application packages only —
`.coveragerc` excludes the test modules, since reporting the tests' own
coverage inflates the number without saying anything about the code under test.

Frontend coverage excludes `main.jsx`, the three-line ReactDOM bootstrap, which
has nothing to assert. The figures are the same with or without a backend
running: the cross-layer tests exercise paths the mocked suites already cover.

For a line-by-line view: `pytest --cov --cov-report=html` writes
`backend/htmlcov/index.html`, and the frontend run writes
`frontend/coverage/index.html`.

## API usage

Interactive docs (Swagger UI) at **<http://localhost:8000/docs>**, generated
from the Pydantic models. The raw schema is at `/openapi.json`.

Base URL is `http://localhost:8000` when running locally. Under Docker use
`http://localhost:8080` — nginx proxies `/api/` to the backend.

### Calculate

```bash
curl -X POST http://localhost:8000/api/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation": "add", "a": 2, "b": 3}'
```

```json
{ "operation": "add", "a": 2.0, "b": 3.0, "result": 5.0 }
```

Square root is unary — omit `b`:

```bash
curl -X POST http://localhost:8000/api/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation": "square_root", "a": 9}'
```

```json
{ "operation": "square_root", "a": 9.0, "b": null, "result": 3.0 }
```

### Operations

| `operation` | Operands | Meaning |
| --- | --- | --- |
| `add` | `a`, `b` | `a + b` |
| `subtract` | `a`, `b` | `a - b` |
| `multiply` | `a`, `b` | `a * b` |
| `divide` | `a`, `b` | `a / b` |
| `power` | `a`, `b` | `a ** b` |
| `square_root` | `a` | `sqrt(a)` |
| `percentage` | `a`, `b` | `a` percent of `b` — `(a / 100) * b` |

### Errors

Every failure returns `{"error": "<code>", "detail": "<message>"}`.

```bash
curl -X POST http://localhost:8000/api/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation": "divide", "a": 1, "b": 0}'
```

```json
{ "error": "division_by_zero", "detail": "cannot divide by zero" }
```

| Status | `error` | Cause |
| --- | --- | --- |
| 400 | `division_by_zero` | Divisor is zero, or `0` raised to a negative power |
| 400 | `invalid_input` | Square root of a negative, negative base with a fractional exponent |
| 400 | `result_overflow` | Valid operands, answer too large for a float |
| 422 | `validation_error` | Malformed body: unknown operation, missing operand, wrong type |

The split is deliberate: **422 means fix the request's shape, 400 means fix its
values.** Branch on `error`, not on `detail` — the codes are stable, the
wording is not.

Health check: `GET /api/health` → `{"status": "ok"}`.
