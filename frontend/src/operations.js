/**
 * The operation catalogue.
 *
 * This is the frontend's mirror of the backend's `Operation` enum: every `id`
 * here is sent verbatim as the request's `operation` field, so the ids must
 * match exactly. `tests/operations.test.js` asserts that they do.
 *
 * Everything else in the entry is presentation -- the `symbol` shown on the
 * button, the `label` that names it for screen readers, and `expression`,
 * which renders the sum back to the user above the result.
 */

export const OPERATIONS = [
  {
    id: 'add',
    label: 'Addition',
    symbol: '+',
    expression: (a, b) => `${a} + ${b}`,
  },
  {
    id: 'subtract',
    label: 'Subtraction',
    symbol: '−',
    expression: (a, b) => `${a} − ${b}`,
  },
  {
    id: 'multiply',
    label: 'Multiplication',
    symbol: '×',
    expression: (a, b) => `${a} × ${b}`,
  },
  {
    id: 'divide',
    label: 'Division',
    symbol: '÷',
    expression: (a, b) => `${a} ÷ ${b}`,
  },
  {
    id: 'power',
    label: 'Exponentiation',
    symbol: 'xʸ',
    expression: (a, b) => `${a} ^ ${b}`,
  },
  {
    id: 'square_root',
    label: 'Square root',
    symbol: '√',
    expression: (a) => `√${a}`,
  },
  {
    id: 'percentage',
    label: 'Percentage',
    symbol: '%',
    // Spelled out, because "15 % 200" reads as a modulo to most people.
    expression: (a, b) => `${a}% of ${b}`,
  },
]

// Square root is the only operation taking a single operand. The backend
// rejects a square_root request that carries `b`, so this drives whether the
// second field is rendered at all.
const UNARY_OPERATION_IDS = new Set(['square_root'])

/**
 * Look up an operation by id.
 *
 * @param {string} id
 * @returns {object | undefined}
 */
export function operationById(id) {
  return OPERATIONS.find((operation) => operation.id === id)
}

/**
 * Does this operation take a single operand?
 *
 * An unknown id is reported as binary rather than throwing: the caller is
 * asking a question about arity, not asserting the id is valid.
 *
 * @param {string} id
 * @returns {boolean}
 */
export function isUnary(id) {
  return UNARY_OPERATION_IDS.has(id)
}
