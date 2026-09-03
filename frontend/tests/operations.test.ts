/**
 * The operation catalogue shared by the UI.
 *
 * This module is the frontend's mirror of the backend's `Operation` enum. The
 * ids here are sent verbatim as the `operation` field, so a typo would only
 * surface as a 422 at runtime -- these tests catch it at build time instead.
 */
import { describe, expect, it } from 'vitest'

import { OPERATIONS, isUnary } from '../src/operations'
import type { OperationId } from '../src/operations'

// Copied deliberately rather than imported: if the backend enum changes, this
// list should have to be updated by hand, which is the point of the check.
const BACKEND_OPERATION_IDS: OperationId[] = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'power',
  'square_root',
  'percentage',
]

describe('OPERATIONS', () => {
  it('covers exactly the operations the backend supports', () => {
    expect(OPERATIONS.map((operation) => operation.id).sort()).toEqual(
      [...BACKEND_OPERATION_IDS].sort(),
    )
  })

  it('lists the operations in a stable, calculator-like order', () => {
    expect(OPERATIONS.map((operation) => operation.id)).toEqual(
      BACKEND_OPERATION_IDS,
    )
  })

  it('gives every operation a human label and a symbol', () => {
    for (const operation of OPERATIONS) {
      expect(operation.label).toBeTruthy()
      expect(operation.symbol).toBeTruthy()
    }
  })

  it('gives every operation a distinct label', () => {
    const labels = OPERATIONS.map((operation) => operation.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('isUnary', () => {
  it('reports square root as unary', () => {
    expect(isUnary('square_root')).toBe(true)
  })

  it('reports every other operation as binary', () => {
    const binary = BACKEND_OPERATION_IDS.filter((id) => id !== 'square_root')
    for (const id of binary) {
      expect(isUnary(id)).toBe(false)
    }
  })

  it('treats an unknown operation as binary rather than throwing', () => {
    expect(isUnary('nonsense')).toBe(false)
  })
})
