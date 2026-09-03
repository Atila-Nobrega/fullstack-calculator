/**
 * The operation catalogue.
 *
 * This is the frontend's mirror of the backend's `Operation` enum: every `id`
 * here is sent verbatim as the request's `operation` field, so the ids must
 * match exactly. `tests/operations.test.ts` asserts that they do, and
 * `OperationId` makes a typo a compile error rather than a runtime 422.
 *
 * Everything else in the entry is presentation -- the `symbol` shown on the
 * button, the `label` that names it for screen readers, and `expression`,
 * which renders the sum back to the user above the result.
 */

export type OperationId =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'square_root'
  | 'percentage'

export interface Operation {
  id: OperationId
  label: string
  symbol: string
  /** Renders the calculation for display. `b` is absent for unary operations. */
  expression: (a: number, b?: number) => string
}

export const OPERATIONS: readonly Operation[] = [
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
const UNARY_OPERATION_IDS: ReadonlySet<string> = new Set<OperationId>(['square_root'])

/** Look up an operation by id. */
export function operationById(id: OperationId): Operation | undefined {
  return OPERATIONS.find((operation) => operation.id === id)
}

/**
 * Does this operation take a single operand?
 *
 * Accepts any string rather than only an `OperationId`: the caller is asking a
 * question about arity, not asserting the id is valid. An unknown id is
 * reported as binary rather than throwing.
 */
export function isUnary(id: string): boolean {
  return UNARY_OPERATION_IDS.has(id)
}
