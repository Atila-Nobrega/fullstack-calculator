/**
 * Result formatting.
 *
 * The API returns full float precision on purpose -- rounding is the UI's job,
 * not the domain's. Without this step the browser would render 0.1 + 0.2 as
 * "0.30000000000000004", which looks like a bug to anyone using the calculator.
 */
import { describe, expect, it } from 'vitest'

import { formatResult } from '../src/utils/format.js'

describe('formatResult', () => {
  it('renders a whole number without a trailing decimal', () => {
    expect(formatResult(5)).toBe('5')
  })

  it('renders zero as zero', () => {
    expect(formatResult(0)).toBe('0')
  })

  it('keeps a genuine fractional part', () => {
    expect(formatResult(3.5)).toBe('3.5')
  })

  it('hides binary floating-point noise', () => {
    expect(formatResult(0.30000000000000004)).toBe('0.3')
  })

  it('hides noise from a percentage calculation', () => {
    // (15 / 100) * 200 comes back as 30.000000000000004.
    expect(formatResult(30.000000000000004)).toBe('30')
  })

  it('keeps a repeating decimal readable rather than exact', () => {
    expect(formatResult(1 / 3)).toBe('0.333333333333')
  })

  it('preserves a negative sign', () => {
    expect(formatResult(-10)).toBe('-10')
  })

  it('falls back to exponential notation for very large numbers', () => {
    expect(formatResult(1e21)).toContain('e+')
  })

  it('does not lose small non-zero values', () => {
    expect(Number(formatResult(0.000001))).toBeCloseTo(0.000001)
  })

  it('returns a string, not a number', () => {
    expect(typeof formatResult(42)).toBe('string')
  })

  // The API cannot produce these -- allow_inf_nan=False rejects them at the
  // request edge, and an overflowing result raises ResultOverflowError rather
  // than returning inf. The guard exists so a display helper degrades instead
  // of throwing if that ever stops being true.
  it.each([
    [Number.POSITIVE_INFINITY, 'Infinity'],
    [Number.NEGATIVE_INFINITY, '-Infinity'],
    [Number.NaN, 'NaN'],
  ])('does not throw on %p', (value, expected) => {
    expect(formatResult(value)).toBe(expected)
  })
})
