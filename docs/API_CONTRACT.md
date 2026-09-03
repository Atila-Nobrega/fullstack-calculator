# API Contract

> Living document. Endpoints are added here as they are implemented, and each
> entry mirrors the Pydantic models in `backend/models/schemas.py`.

- **Base URL (dev):** `http://localhost:8000`
- **Base URL (Docker Compose):** `http://localhost:8080/api/...` — nginx proxies
  it; the API is same-origin with the app.
- **Prefix:** all application routes live under `/api`.
- **Content type:** `application/json` for requests and responses.
- **CORS:** only `http://localhost:5173` is permitted (see `backend/main.py`).

## Operations

Exposed through `POST /api/calculate` and pinned by the unit tests in
`backend/tests/test_unit.py`.

| Operation | Operands | Meaning | Example |
| --- | --- | --- | --- |
| Addition | `a`, `b` | `a + b` | `2, 3` → `5.0` |
| Subtraction | `a`, `b` | `a - b` | `10, 3` → `7.0` |
| Multiplication | `a`, `b` | `a * b` | `4, 5` → `20.0` |
| Division | `a`, `b` | `a / b` — true division, not floor | `7, 2` → `3.5` |
| Exponentiation | `a`, `b` | `a ** b` | `2, 3` → `8.0` |
| Square root | `a` | `sqrt(a)` — **unary**, `b` is not used | `9` → `3.0` |
| Percentage | `a`, `b` | `a` percent of `b`, i.e. `(a / 100) * b` | `15, 200` → `30.0` |

All results are finite `float` values, unrounded.

## Domain errors

| Condition | Exception | `ErrorCode` |
| --- | --- | --- |
| Divisor is zero (`a / 0`) | `DivisionByZeroError` | `division_by_zero` |
| Zero raised to a negative power (`0 ** -1`) | `DivisionByZeroError` | `division_by_zero` |
| Operand is not a number (including `bool`) | `InvalidInputError` | `invalid_input` |
| Operand is `NaN` or infinite | `InvalidInputError` | `invalid_input` |
| Square root of a negative number | `InvalidInputError` | `invalid_input` |
| Negative base with a fractional exponent | `InvalidInputError` | `invalid_input` |
| Result too large to represent as a float | `ResultOverflowError` | `result_overflow` |
| Malformed request body (see `CalculateRequest`) | — raised by Pydantic | `validation_error` |

Domain errors return **400**; a malformed request body returns **422**. The
split tells the client what to fix: 422 means the request's *shape* was wrong,
400 means its *values* were.

## Pydantic models

Defined in `backend/models/schemas.py`.

### `Operation` (str enum)

`"add"`, `"subtract"`, `"multiply"`, `"divide"`, `"power"`, `"square_root"`,
`"percentage"`. Any other value is rejected.

### `ErrorCode` (str enum)

`"validation_error"`, `"division_by_zero"`, `"invalid_input"`,
`"result_overflow"`.

### `HealthResponse`

| Field | Type | Notes |
| --- | --- | --- |
| `status` | `string` | `"ok"` whenever the service is serving. |

### `CalculateRequest`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `operation` | `Operation` | yes | Must be one of the seven values above. |
| `a` | `float` | yes | Finite; `NaN` and infinity are rejected. |
| `b` | `float \| null` | conditional | **Required** for binary operations. **Must be omitted** for `square_root`. |

Additional rules:

- Unknown fields are rejected (`extra="forbid"`) rather than ignored.
- Integers and numeric strings are coerced to `float`.
- Sending `b` with `square_root`, or omitting it for any other operation, is a
  validation error — it is not silently ignored.

```json
{ "operation": "add", "a": 2, "b": 3 }
{ "operation": "square_root", "a": 9 }
```

### `CalculateResponse`

| Field | Type | Notes |
| --- | --- | --- |
| `operation` | `Operation` | Echoed from the request. |
| `a` | `float` | Echoed from the request. |
| `b` | `float \| null` | Echoed; `null` for unary operations. |
| `result` | `float` | Full float precision, unrounded. |

The operands are echoed so a client rendering a history does not have to
correlate responses with the requests it sent.

```json
{ "operation": "add", "a": 2.0, "b": 3.0, "result": 5.0 }
```

### `ErrorResponse`

| Field | Type | Notes |
| --- | --- | --- |
| `error` | `ErrorCode` | Branch on this, not on `detail`. |
| `detail` | `string` | Human-readable; wording may change. |

```json
{ "error": "division_by_zero", "detail": "cannot divide by zero" }
```

## Endpoints

### `GET /api/health`

Liveness probe. Used by the frontend and, from Step 7, by Compose.

**Request:** no body, no parameters.

**Response `200 OK`** — `HealthResponse`:

```json
{ "status": "ok" }
```

---

### `POST /api/calculate`

Perform one calculation.

**Request body** — `CalculateRequest`:

```json
{ "operation": "divide", "a": 7, "b": 2 }
```

**Response `200 OK`** — `CalculateResponse`:

```json
{ "operation": "divide", "a": 7.0, "b": 2.0, "result": 3.5 }
```

**Response `400 Bad Request`** — `ErrorResponse`. The body parsed and its types
were valid, but the arithmetic could not be performed:

```json
{ "error": "division_by_zero", "detail": "cannot divide by zero" }
```

**Response `422 Unprocessable Entity`** — `ErrorResponse`. The body itself was
rejected:

```json
{ "error": "validation_error", "detail": "operation 'add' requires two operands; 'b' is missing" }
```

#### Worked examples

| Request | Status | Response body |
| --- | --- | --- |
| `{"operation":"add","a":2,"b":3}` | 200 | `{"operation":"add","a":2.0,"b":3.0,"result":5.0}` |
| `{"operation":"square_root","a":9}` | 200 | `{"operation":"square_root","a":9.0,"b":null,"result":3.0}` |
| `{"operation":"percentage","a":15,"b":200}` | 200 | `{"operation":"percentage","a":15.0,"b":200.0,"result":30.0}` |
| `{"operation":"divide","a":1,"b":0}` | 400 | `{"error":"division_by_zero","detail":"cannot divide by zero"}` |
| `{"operation":"square_root","a":-1}` | 400 | `{"error":"invalid_input","detail":"cannot take the square root of a negative number"}` |
| `{"operation":"multiply","a":1e308,"b":10}` | 400 | `{"error":"result_overflow","detail":"the result is too large to represent"}` |
| `{"operation":"add","a":1}` | 422 | `{"error":"validation_error","detail":"operation 'add' requires two operands; 'b' is missing"}` |
| `{"operation":"factorial","a":5,"b":2}` | 422 | `{"error":"validation_error","detail":"operation: Input should be 'add', 'subtract', …"}` |

All verified against a running server, not just the test client.

## Error responses

Every handled failure returns the same `ErrorResponse` shape — `{error, detail}`
and nothing else — regardless of which layer rejected the request. FastAPI's
default 422 body (a list of Pydantic error dicts) is overridden to match, so a
client only ever parses one error format.

Branch on `error`, not on `detail`: the codes are stable, the wording is not.

## Other responses

| Situation | Status |
| --- | --- |
| Unknown path | `404` |
| Wrong method on a known path (e.g. `GET /api/calculate`) | `405` |

## CORS

Allowed origins: `http://localhost:5173` and `http://127.0.0.1:5173` — Vite
prints both on startup and either can end up as the page's origin. All methods
and headers are allowed. Preflight (`OPTIONS`) is answered by the middleware;
a request from any other origin receives no
`Access-Control-Allow-Origin` header and is blocked by the browser.

This applies to **development only**. Under Docker Compose, nginx serves the
app and proxies `/api/` to the backend, so the browser makes same-origin
requests and CORS is never exercised — the allowlist is inert there, and the
deployed origin does not need adding to it.

## OpenAPI

The generated schema is served at `/openapi.json`, with interactive docs at
`/docs`. It documents both routes, all six models, and the 200/400/422
responses for `POST /api/calculate`.
