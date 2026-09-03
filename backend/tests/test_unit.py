"""Unit tests for the calculation layer (`logic/`) and the models (`models/`).

Written before the implementation, per Step 1 of the roadmap. Every test here
calls a logic function or constructs a model directly -- no FastAPI app, no
HTTP client -- so a failure always points at the arithmetic or the validation
itself, never at the routing around it.

Contract these tests pin down:

* Seven operations: add, subtract, multiply, divide, power, square_root,
  percentage. Binary ops take (a, b); square_root takes (a) only.
* `percentage(a, b)` means "a percent of b", i.e. (a / 100) * b.
* Every operation returns a plain finite `float`.
* Dividing by zero raises `DivisionByZeroError`.
* A result too large to hold in a float raises `ResultOverflowError` -- the
  operands were fine, the answer simply does not fit.
* Anything else the domain cannot express -- non-numeric input, NaN, infinity,
  the root of a negative number, a negative base with a fractional exponent --
  raises `InvalidInputError`.
* All three derive from `CalculatorError`, so a caller can catch the whole
  family with one `except`.
"""

import math

import pytest
from pydantic import ValidationError

from logic.calculator import (
    add,
    divide,
    multiply,
    percentage,
    power,
    square_root,
    subtract,
)
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
    Operation,
)

BINARY_OPERATION_NAMES = [op for op in Operation if op not in UNARY_OPERATIONS]

# Every operation that takes two operands, for the shared validation tests.
BINARY_OPERATIONS = [add, subtract, multiply, divide, power, percentage]

# Values that are not numbers the calculator can work with. True/False are
# included deliberately: bool is a subclass of int in Python, so a naive
# isinstance check would let them through and add(True, True) would quietly
# return 2.0.
NON_NUMERIC_VALUES = ["3", "", None, [1], (1,), {"a": 1}, object(), True, False]

# Floats that exist in Python but have no meaning as a calculator operand, and
# no representation in JSON either.
NON_FINITE_VALUES = [float("nan"), float("inf"), float("-inf")]


class TestAdd:
    @pytest.mark.parametrize(
        "a, b, expected",
        [
            (2, 3, 5.0),
            (0, 0, 0.0),
            (-4, 10, 6.0),
            (-4, -6, -10.0),
            (2.5, 0.25, 2.75),
            (1e10, 1e10, 2e10),
        ],
    )
    def test_returns_the_sum(self, a, b, expected):
        assert add(a, b) == pytest.approx(expected)

    def test_tolerates_binary_float_representation(self):
        assert add(0.1, 0.2) == pytest.approx(0.3)

    def test_returns_a_float(self):
        assert isinstance(add(2, 3), float)


class TestSubtract:
    @pytest.mark.parametrize(
        "a, b, expected",
        [
            (10, 3, 7.0),
            (3, 10, -7.0),
            (0, 0, 0.0),
            (-4, -6, 2.0),
            (2.75, 0.25, 2.5),
        ],
    )
    def test_returns_the_difference(self, a, b, expected):
        assert subtract(a, b) == pytest.approx(expected)

    def test_operand_order_matters(self):
        assert subtract(10, 3) != subtract(3, 10)

    def test_returns_a_float(self):
        assert isinstance(subtract(10, 3), float)


class TestMultiply:
    @pytest.mark.parametrize(
        "a, b, expected",
        [
            (4, 5, 20.0),
            (0, 12345, 0.0),
            (-3, 7, -21.0),
            (-3, -7, 21.0),
            (2.5, 4, 10.0),
            (0.1, 0.2, 0.02),
        ],
    )
    def test_returns_the_product(self, a, b, expected):
        assert multiply(a, b) == pytest.approx(expected)

    def test_returns_a_float(self):
        assert isinstance(multiply(4, 5), float)


class TestDivide:
    @pytest.mark.parametrize(
        "a, b, expected",
        [
            (10, 2, 5.0),
            (7, 2, 3.5),
            (0, 5, 0.0),
            (-9, 3, -3.0),
            (-9, -3, 3.0),
            (1, 3, 1 / 3),
        ],
    )
    def test_returns_the_quotient(self, a, b, expected):
        assert divide(a, b) == pytest.approx(expected)

    def test_divides_rather_than_floor_divides(self):
        assert divide(7, 2) == pytest.approx(3.5)

    @pytest.mark.parametrize("numerator", [1, 0, -1, 2.5])
    @pytest.mark.parametrize("zero", [0, 0.0, -0.0])
    def test_zero_divisor_raises(self, numerator, zero):
        with pytest.raises(DivisionByZeroError):
            divide(numerator, zero)

    def test_zero_divisor_error_is_a_calculator_error(self):
        with pytest.raises(CalculatorError):
            divide(1, 0)

    def test_returns_a_float(self):
        assert isinstance(divide(10, 2), float)


class TestPower:
    @pytest.mark.parametrize(
        "a, b, expected",
        [
            (2, 3, 8.0),
            (2, 0, 1.0),
            (0, 0, 1.0),
            (5, 1, 5.0),
            (2, -1, 0.5),
            (-2, 3, -8.0),
            (-2, 2, 4.0),
            (9, 0.5, 3.0),
            (0, 5, 0.0),
        ],
    )
    def test_returns_the_power(self, a, b, expected):
        assert power(a, b) == pytest.approx(expected)

    def test_zero_to_a_negative_power_raises_division_by_zero(self):
        # 0 ** -1 is 1 / 0, so it belongs with the division errors rather than
        # with the invalid-input ones.
        with pytest.raises(DivisionByZeroError):
            power(0, -1)

    def test_negative_base_with_fractional_exponent_raises(self):
        # Python answers this with a complex number; the calculator only deals
        # in real numbers, so it is invalid input here.
        with pytest.raises(InvalidInputError):
            power(-8, 0.5)

    def test_result_too_large_for_a_float_raises(self):
        # Python raises OverflowError here rather than returning inf.
        with pytest.raises(ResultOverflowError):
            power(1e200, 5)

    def test_returns_a_float(self):
        assert isinstance(power(2, 3), float)


class TestSquareRoot:
    @pytest.mark.parametrize(
        "a, expected",
        [
            (0, 0.0),
            (1, 1.0),
            (9, 3.0),
            (2, math.sqrt(2)),
            (0.25, 0.5),
            (1e10, 1e5),
        ],
    )
    def test_returns_the_root(self, a, expected):
        assert square_root(a) == pytest.approx(expected)

    @pytest.mark.parametrize("a", [-1, -0.5, -1e10])
    def test_negative_operand_raises(self, a):
        with pytest.raises(InvalidInputError):
            square_root(a)

    def test_is_unary(self):
        # A second positional argument must be rejected outright, so the API
        # layer cannot silently pass one through.
        with pytest.raises(TypeError):
            square_root(9, 2)

    def test_returns_a_float(self):
        assert isinstance(square_root(9), float)


class TestPercentage:
    @pytest.mark.parametrize(
        "a, b, expected",
        [
            (15, 200, 30.0),
            (50, 80, 40.0),
            (100, 42, 42.0),
            (0, 100, 0.0),
            (10, 0, 0.0),
            (-10, 200, -20.0),
            (2.5, 400, 10.0),
        ],
    )
    def test_returns_a_percent_of_b(self, a, b, expected):
        assert percentage(a, b) == pytest.approx(expected)

    def test_zero_second_operand_is_valid(self):
        # Unlike divide, this operation never divides by an operand, so b = 0
        # is an ordinary answer of zero rather than an error.
        assert percentage(10, 0) == pytest.approx(0.0)

    def test_returns_a_float(self):
        assert isinstance(percentage(15, 200), float)


class TestResultOverflow:
    """A finite pair of operands whose answer does not fit in a float.

    Python is inconsistent about this: `**` raises `OverflowError`, while `+`
    and `*` quietly return `inf`. Both must surface as the same error, because
    `inf` is not a number a user can act on and is not valid JSON either.
    """

    def test_addition_that_overflows_raises(self):
        with pytest.raises(ResultOverflowError):
            add(1e308, 1e308)

    def test_multiplication_that_overflows_raises(self):
        with pytest.raises(ResultOverflowError):
            multiply(1e308, 10)

    def test_negative_overflow_raises(self):
        with pytest.raises(ResultOverflowError):
            multiply(-1e308, 10)

    def test_exponentiation_that_overflows_raises(self):
        with pytest.raises(ResultOverflowError):
            power(10, 400)

    def test_percentage_that_overflows_raises(self):
        with pytest.raises(ResultOverflowError):
            percentage(1e308, 1e308)

    def test_overflow_error_is_a_calculator_error(self):
        with pytest.raises(CalculatorError):
            multiply(1e308, 10)

    def test_overflow_is_not_reported_as_invalid_input(self):
        # The operands here are perfectly valid numbers; only the answer is
        # unrepresentable, so the two failures must stay distinguishable.
        with pytest.raises(ResultOverflowError):
            multiply(1e308, 10)

    def test_underflow_is_not_an_error(self):
        # Too small to represent is an ordinary zero, not a failure.
        assert multiply(1e-320, 1e-100) == pytest.approx(0.0)


class TestInvalidInput:
    """Validation shared by every operation."""

    @pytest.mark.parametrize("operation", BINARY_OPERATIONS)
    @pytest.mark.parametrize("value", NON_NUMERIC_VALUES)
    def test_binary_operations_reject_non_numeric_first_operand(
        self, operation, value
    ):
        with pytest.raises(InvalidInputError):
            operation(value, 2)

    @pytest.mark.parametrize("operation", BINARY_OPERATIONS)
    @pytest.mark.parametrize("value", NON_NUMERIC_VALUES)
    def test_binary_operations_reject_non_numeric_second_operand(
        self, operation, value
    ):
        with pytest.raises(InvalidInputError):
            operation(2, value)

    @pytest.mark.parametrize("value", NON_NUMERIC_VALUES)
    def test_square_root_rejects_non_numeric_operand(self, value):
        with pytest.raises(InvalidInputError):
            square_root(value)

    @pytest.mark.parametrize("operation", BINARY_OPERATIONS)
    @pytest.mark.parametrize("value", NON_FINITE_VALUES)
    def test_binary_operations_reject_non_finite_operands(self, operation, value):
        with pytest.raises(InvalidInputError):
            operation(value, 2)

    @pytest.mark.parametrize("value", NON_FINITE_VALUES)
    def test_square_root_rejects_non_finite_operand(self, value):
        with pytest.raises(InvalidInputError):
            square_root(value)

    @pytest.mark.parametrize("operation", BINARY_OPERATIONS)
    def test_invalid_input_error_is_a_calculator_error(self, operation):
        with pytest.raises(CalculatorError):
            operation("not a number", 2)

    @pytest.mark.parametrize("operation", BINARY_OPERATIONS)
    def test_integers_are_accepted_and_widened_to_float(self, operation):
        assert isinstance(operation(4, 2), float)


class TestExceptionHierarchy:
    def test_division_by_zero_derives_from_calculator_error(self):
        assert issubclass(DivisionByZeroError, CalculatorError)

    def test_invalid_input_derives_from_calculator_error(self):
        assert issubclass(InvalidInputError, CalculatorError)

    def test_result_overflow_derives_from_calculator_error(self):
        assert issubclass(ResultOverflowError, CalculatorError)

    def test_calculator_error_derives_from_exception(self):
        assert issubclass(CalculatorError, Exception)

    @pytest.mark.parametrize(
        "left, right",
        [
            (DivisionByZeroError, InvalidInputError),
            (DivisionByZeroError, ResultOverflowError),
            (InvalidInputError, ResultOverflowError),
        ],
    )
    def test_the_error_types_are_mutually_distinct(self, left, right):
        assert not issubclass(left, right)
        assert not issubclass(right, left)

    @pytest.mark.parametrize(
        "error_type",
        [
            CalculatorError,
            DivisionByZeroError,
            InvalidInputError,
            ResultOverflowError,
        ],
    )
    def test_errors_carry_a_message(self, error_type):
        assert str(error_type("something went wrong")) == "something went wrong"


class TestOperationEnum:
    def test_covers_every_supported_operation(self):
        assert {op.value for op in Operation} == {
            "add",
            "subtract",
            "multiply",
            "divide",
            "power",
            "square_root",
            "percentage",
        }

    def test_members_compare_equal_to_their_string_value(self):
        assert Operation.ADD == "add"

    def test_square_root_is_the_only_unary_operation(self):
        assert UNARY_OPERATIONS == frozenset({Operation.SQUARE_ROOT})


class TestCalculateRequest:
    @pytest.mark.parametrize("operation", BINARY_OPERATION_NAMES)
    def test_accepts_a_binary_operation_with_both_operands(self, operation):
        request = CalculateRequest(operation=operation, a=2, b=3)
        assert request.operation is operation
        assert (request.a, request.b) == (2.0, 3.0)

    def test_accepts_a_unary_operation_without_b(self):
        request = CalculateRequest(operation="square_root", a=9)
        assert request.b is None

    def test_parses_the_operation_from_a_string(self):
        assert CalculateRequest(operation="add", a=1, b=2).operation is Operation.ADD

    def test_widens_integer_operands_to_float(self):
        request = CalculateRequest(operation="add", a=2, b=3)
        assert isinstance(request.a, float) and isinstance(request.b, float)

    @pytest.mark.parametrize("operation", BINARY_OPERATION_NAMES)
    def test_rejects_a_binary_operation_missing_b(self, operation):
        with pytest.raises(ValidationError):
            CalculateRequest(operation=operation, a=2)

    def test_rejects_a_unary_operation_given_b(self):
        # Silently ignoring b would hide a client bug rather than report it.
        with pytest.raises(ValidationError):
            CalculateRequest(operation="square_root", a=9, b=2)

    def test_rejects_an_unknown_operation(self):
        with pytest.raises(ValidationError):
            CalculateRequest(operation="factorial", a=5)

    @pytest.mark.parametrize("value", ["not a number", None, [1], {"a": 1}])
    def test_rejects_a_non_numeric_operand(self, value):
        with pytest.raises(ValidationError):
            CalculateRequest(operation="add", a=value, b=2)

    @pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
    def test_rejects_non_finite_operands(self, value):
        with pytest.raises(ValidationError):
            CalculateRequest(operation="add", a=value, b=2)

    def test_rejects_unknown_fields(self):
        with pytest.raises(ValidationError):
            CalculateRequest(operation="add", a=1, b=2, precision=4)

    def test_rejects_a_missing_operation(self):
        with pytest.raises(ValidationError):
            CalculateRequest(a=1, b=2)

    def test_accepts_a_numeric_string_operand(self):
        # Pydantic coerces here by design; the JSON body is the untrusted edge
        # and "2" is unambiguous. The logic layer stays strict regardless.
        assert CalculateRequest(operation="add", a="2", b="3").a == 2.0


class TestCalculateResponse:
    def test_serialises_a_binary_result(self):
        response = CalculateResponse(operation=Operation.ADD, a=2, b=3, result=5)
        assert response.model_dump(mode="json") == {
            "operation": "add",
            "a": 2.0,
            "b": 3.0,
            "result": 5.0,
        }

    def test_serialises_a_unary_result_with_a_null_b(self):
        response = CalculateResponse(
            operation=Operation.SQUARE_ROOT, a=9, result=3
        )
        assert response.model_dump(mode="json") == {
            "operation": "square_root",
            "a": 9.0,
            "b": None,
            "result": 3.0,
        }

    def test_requires_a_result(self):
        with pytest.raises(ValidationError):
            CalculateResponse(operation=Operation.ADD, a=2, b=3)


class TestErrorResponse:
    def test_serialises_to_a_code_and_a_detail(self):
        error = ErrorResponse(
            error=ErrorCode.DIVISION_BY_ZERO, detail="cannot divide by zero"
        )
        assert error.model_dump(mode="json") == {
            "error": "division_by_zero",
            "detail": "cannot divide by zero",
        }

    def test_covers_every_error_code(self):
        assert {code.value for code in ErrorCode} == {
            "validation_error",
            "division_by_zero",
            "invalid_input",
            "result_overflow",
        }

    def test_rejects_an_unknown_error_code(self):
        with pytest.raises(ValidationError):
            ErrorResponse(error="kaboom", detail="something went wrong")

    def test_requires_a_detail(self):
        with pytest.raises(ValidationError):
            ErrorResponse(error=ErrorCode.INVALID_INPUT)
