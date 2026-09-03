/**
 * Formatting for calculated values.
 *
 * The API returns full float precision deliberately -- rounding is a
 * presentation decision, so the domain leaves it to us. That means the raw
 * result of 0.1 + 0.2 arrives as 0.30000000000000004, which reads as a bug to
 * anyone using the calculator.
 */

// Enough precision to keep a repeating decimal useful, few enough digits to
// fall short of the ~17 where binary floating-point noise shows up.
const SIGNIFICANT_DIGITS = 12

/**
 * Render a number for display.
 *
 * @param {number} value
 * @returns {string} e.g. 5 -> "5", 0.30000000000000004 -> "0.3"
 */
export function formatResult(value) {
  if (!Number.isFinite(value)) {
    // The API cannot return these, but a display helper should not throw.
    return String(value)
  }

  // toPrecision rounds away the noise but keeps trailing zeros ("5.00000000000");
  // the round-trip through Number drops them again.
  return String(Number(value.toPrecision(SIGNIFICANT_DIGITS)))
}
