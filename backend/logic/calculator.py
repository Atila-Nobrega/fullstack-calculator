"""Pure calculation logic for the calculator.

This module is deliberately free of FastAPI, Pydantic and HTTP: it is an
ordinary Python library that happens to be called by an API. That keeps it
directly unit-testable, and means it cannot assume its caller already
validated anything -- so every operation validates its own operands.

Every function takes and returns plain numbers, and reports failure by raising
a `CalculatorError` subclass from `logic.exceptions`.
"""

import math

from logic.exceptions import (
    DivisionByZeroError,
    InvalidInputError,
    ResultOverflowError,
)


def _operand(value, name):
    """Return `value` as a finite float, or raise `InvalidInputError`.

    `bool` is rejected explicitly. It subclasses `int`, so without this check
    `add(True, True)` would quietly answer `2.0` instead of complaining.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvalidInputError(
            f"operand '{name}' must be a number, got {type(value).__name__}"
        )

    number = float(value)
    if math.isnan(number):
        raise InvalidInputError(f"operand '{name}' must be a number, got NaN")
    if math.isinf(number):
        raise InvalidInputError(f"operand '{name}' must be finite, got {number}")
    return number


def _result(value):
    """Return `value` if it is a representable answer, else raise.

    `+` and `*` overflow silently to `inf` rather than raising, so the check
    has to happen on the way out as well as on the way in.
    """
    if not math.isfinite(value):
        raise ResultOverflowError("the result is too large to represent")
    return float(value)


def add(a, b):
    """Return `a + b`."""
    return _result(_operand(a, "a") + _operand(b, "b"))


def subtract(a, b):
    """Return `a - b`."""
    return _result(_operand(a, "a") - _operand(b, "b"))


def multiply(a, b):
    """Return `a * b`."""
    return _result(_operand(a, "a") * _operand(b, "b"))


def divide(a, b):
    """Return `a / b`, true division rather than floor division."""
    dividend = _operand(a, "a")
    divisor = _operand(b, "b")
    if divisor == 0:
        raise DivisionByZeroError("cannot divide by zero")
    return _result(dividend / divisor)


def power(a, b):
    """Return `a` raised to the power of `b`."""
    base = _operand(a, "a")
    exponent = _operand(b, "b")

    if base == 0 and exponent < 0:
        # 0 ** -n is 1 / 0**n, so this is a division by zero in disguise.
        raise DivisionByZeroError("cannot raise zero to a negative power")

    if base < 0 and not exponent.is_integer():
        # Python answers this with a complex number; the calculator is
        # real-valued, so there is no result to return.
        raise InvalidInputError(
            "a negative base with a fractional exponent has no real result"
        )

    try:
        result = base**exponent
    except OverflowError as error:
        raise ResultOverflowError(
            "the result is too large to represent"
        ) from error

    return _result(result)


def square_root(a):
    """Return the non-negative square root of `a`. Unary: there is no `b`."""
    number = _operand(a, "a")
    if number < 0:
        raise InvalidInputError("cannot take the square root of a negative number")
    return _result(math.sqrt(number))


def percentage(a, b):
    """Return `a` percent of `b`, i.e. `(a / 100) * b`.

    Note this never divides by an operand, so `b = 0` is an ordinary answer of
    zero rather than a division-by-zero error.
    """
    return _result((_operand(a, "a") / 100) * _operand(b, "b"))
