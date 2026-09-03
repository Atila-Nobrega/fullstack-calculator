"""Domain exceptions raised by the calculation layer.

These describe failures in the language of the calculator, not of HTTP. Nothing
here knows about status codes; translating a `CalculatorError` into a response
is `main.py`'s job.

    CalculatorError            catch this to catch them all
    +-- DivisionByZeroError    the divisor was zero
    +-- InvalidInputError      an operand the domain cannot accept
    +-- ResultOverflowError    valid operands, unrepresentable answer
"""


class CalculatorError(Exception):
    """Base class for every failure the calculation layer can report."""


class DivisionByZeroError(CalculatorError):
    """A division whose divisor is zero.

    Also covers zero raised to a negative power, which is `1 / 0` written
    differently.
    """


class InvalidInputError(CalculatorError):
    """An operand the calculator cannot work with.

    Non-numeric values, `NaN`, infinity, the square root of a negative number,
    and a negative base with a fractional exponent all land here: the request
    itself is malformed or has no answer in the real numbers.
    """


class ResultOverflowError(CalculatorError):
    """The operands were valid but the answer does not fit in a float.

    Kept separate from `InvalidInputError` because nothing was wrong with what
    the user supplied -- the answer is simply beyond what a 64-bit float can
    represent, and `inf` is neither useful to a user nor valid JSON.
    """
