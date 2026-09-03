"""Pydantic models describing the API's request and response bodies.

These models are the API contract expressed in code: FastAPI derives the
OpenAPI schema at `/docs` from them, and they are the boundary where untrusted
JSON becomes trusted Python. They carry no arithmetic -- that lives in
`logic/calculator.py`.
"""

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Operation(str, Enum):
    """The operations the calculator supports.

    Inheriting from `str` keeps the wire format a plain JSON string and lets
    the value be compared directly with one.
    """

    ADD = "add"
    SUBTRACT = "subtract"
    MULTIPLY = "multiply"
    DIVIDE = "divide"
    POWER = "power"
    SQUARE_ROOT = "square_root"
    PERCENTAGE = "percentage"


#: Operations taking a single operand. Everything else takes two.
UNARY_OPERATIONS = frozenset({Operation.SQUARE_ROOT})


class ErrorCode(str, Enum):
    """Machine-readable error identifiers.

    The frontend switches on these rather than on `detail`, so error messages
    can be reworded without breaking the client.
    """

    VALIDATION_ERROR = "validation_error"
    DIVISION_BY_ZERO = "division_by_zero"
    INVALID_INPUT = "invalid_input"
    RESULT_OVERFLOW = "result_overflow"


class HealthResponse(BaseModel):
    """The API's liveness probe.

    Typed like every other response so the health check appears in the OpenAPI
    schema rather than as an untyped dict.
    """

    model_config = ConfigDict(json_schema_extra={"examples": [{"status": "ok"}]})

    status: str = Field(description="Always 'ok' when the service is serving.")


class CalculateRequest(BaseModel):
    """A single calculation to perform."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {"operation": "add", "a": 2, "b": 3},
                {"operation": "square_root", "a": 9},
            ]
        },
    )

    operation: Operation = Field(description="Which operation to perform.")
    a: float = Field(
        allow_inf_nan=False,
        description="The first operand, and the only one for unary operations.",
    )
    b: float | None = Field(
        default=None,
        allow_inf_nan=False,
        description="The second operand. Required for binary operations, omitted for unary ones.",
    )

    @model_validator(mode="after")
    def _check_operand_count(self):
        """Reject requests whose operand count does not match the operation.

        Catching this here means `main.py` can dispatch without re-checking,
        and the client gets a 422 naming the problem instead of a 500.
        """
        if self.operation in UNARY_OPERATIONS:
            if self.b is not None:
                raise ValueError(
                    f"operation '{self.operation.value}' takes a single operand; omit 'b'"
                )
        elif self.b is None:
            raise ValueError(
                f"operation '{self.operation.value}' requires two operands; 'b' is missing"
            )
        return self


class CalculateResponse(BaseModel):
    """A successful calculation.

    The operands are echoed back so a client rendering a history does not have
    to correlate responses with the requests it sent.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"operation": "add", "a": 2.0, "b": 3.0, "result": 5.0}]
        }
    )

    operation: Operation = Field(description="The operation that was performed.")
    a: float = Field(description="The first operand, as received.")
    b: float | None = Field(
        default=None, description="The second operand, or null for unary operations."
    )
    result: float = Field(description="The result, at full float precision.")


class ErrorResponse(BaseModel):
    """A failed calculation.

    Returned for every handled failure so the client has one error shape to
    parse regardless of which layer rejected the request.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"error": "division_by_zero", "detail": "cannot divide by zero"}
            ]
        }
    )

    error: ErrorCode = Field(description="Machine-readable error identifier.")
    detail: str = Field(description="Human-readable explanation of what went wrong.")
