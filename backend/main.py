"""FastAPI application: routing, CORS, and error translation.

This module is the only place that knows about HTTP. It maps a validated
`CalculateRequest` onto a function in `logic/calculator.py`, and turns the
domain exceptions that function may raise into JSON responses with the right
status code. It contains no arithmetic of its own.
"""

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from logic import calculator
from logic.exceptions import (
    CalculatorError,
    DivisionByZeroError,
    InvalidInputError,
    ResultOverflowError,
)
from models.schemas import (
    UNARY_OPERATIONS,
    CalculateRequest,
    CalculateResponse,
    ErrorCode,
    ErrorResponse,
    HealthResponse,
    Operation,
)

app = FastAPI(
    title="Calculator API",
    description="A small arithmetic service backing the React calculator.",
    version="1.0.0",
)

# Vite's dev server. It prints both hostnames on startup and either may be the
# page's origin, so both are allowed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

#: Maps each operation to the function that performs it. Keeping the dispatch
#: here rather than in `logic/` lets the calculation module stay a plain
#: library that knows nothing about the API's enum.
OPERATIONS = {
    Operation.ADD: calculator.add,
    Operation.SUBTRACT: calculator.subtract,
    Operation.MULTIPLY: calculator.multiply,
    Operation.DIVIDE: calculator.divide,
    Operation.POWER: calculator.power,
    Operation.SQUARE_ROOT: calculator.square_root,
    Operation.PERCENTAGE: calculator.percentage,
}

#: Which error code each domain exception is reported as.
ERROR_CODES = {
    DivisionByZeroError: ErrorCode.DIVISION_BY_ZERO,
    InvalidInputError: ErrorCode.INVALID_INPUT,
    ResultOverflowError: ErrorCode.RESULT_OVERFLOW,
}

# Every handled failure returns an ErrorResponse, so document that on the
# routes rather than letting the OpenAPI schema imply otherwise.
ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "The calculation could not be performed."},
    422: {"model": ErrorResponse, "description": "The request body was rejected."},
}


def _error(status_code: int, code: ErrorCode, detail: str) -> JSONResponse:
    """Render an `ErrorResponse` as JSON with the given status code."""
    payload = ErrorResponse(error=code, detail=detail)
    return JSONResponse(status_code=status_code, content=payload.model_dump(mode="json"))


@app.exception_handler(CalculatorError)
async def handle_calculator_error(_request, error: CalculatorError) -> JSONResponse:
    """Translate a domain exception into a 400.

    The request was well-formed -- it parsed, and its types were right -- so
    this is not a schema problem. What failed was the arithmetic, and the
    `error` code tells the client which kind of failure it was.

    Starlette walks the exception's MRO when looking for a handler, so
    registering the base class covers all three subclasses.
    """
    code = ERROR_CODES.get(type(error), ErrorCode.INVALID_INPUT)
    return _error(400, code, str(error))


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_request, error: RequestValidationError) -> JSONResponse:
    """Return FastAPI's 422 in the same shape as every other error.

    FastAPI's default body is a list of Pydantic error dicts, which would give
    the client a second error format to parse. This flattens it into the one
    `ErrorResponse` shape.
    """
    return _error(422, ErrorCode.VALIDATION_ERROR, _describe(error))


def _describe(error: RequestValidationError) -> str:
    """Flatten Pydantic's error list into a single readable sentence."""
    messages = []
    for item in error.errors():
        # loc looks like ("body", "b"); the "body" part adds nothing here.
        field = ".".join(str(part) for part in item["loc"] if part != "body")
        # Pydantic prefixes messages raised from a validator; drop the noise.
        message = item["msg"].removeprefix("Value error, ")
        messages.append(f"{field}: {message}" if field else message)
    return "; ".join(messages) or "the request body is invalid"


@app.get("/api/health", response_model=HealthResponse, tags=["meta"])
def health() -> HealthResponse:
    """Report that the service is up. Used by the frontend and by Compose."""
    return HealthResponse(status="ok")


@app.post(
    "/api/calculate",
    response_model=CalculateResponse,
    responses=ERROR_RESPONSES,
    tags=["calculator"],
)
def calculate(request: CalculateRequest) -> CalculateResponse:
    """Perform one calculation.

    By the time this runs, `CalculateRequest` has already guaranteed the
    operation is known and the operand count matches it, so the dispatch below
    cannot fail on a missing `b`.
    """
    operation = OPERATIONS[request.operation]

    if request.operation in UNARY_OPERATIONS:
        result = operation(request.a)
    else:
        result = operation(request.a, request.b)

    return CalculateResponse(
        operation=request.operation,
        a=request.a,
        b=request.b,
        result=result,
    )
