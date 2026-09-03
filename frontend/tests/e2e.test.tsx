/**
 * End-to-end: the real UI against the real API.
 *
 * Nothing is mocked here. `client.ts` uses axios, axios uses jsdom's
 * XMLHttpRequest, and jsdom enforces CORS -- so a request from this suite is
 * subject to the same origin checks a browser applies. `vite.config.ts` sets
 * the jsdom document origin to http://localhost:5173 so those checks are the
 * ones the real app will face.
 *
 * Everything else in tests/ mocks the network, which means a contract drift
 * between the two layers -- a renamed error code, a changed field, a CORS
 * origin that no longer matches -- would pass every other suite. This is the
 * one place that catches it.
 *
 * Requires the backend to be running:
 *
 *     cd backend && uvicorn main:app
 *
 * If it is not, the suite skips rather than failing, so `npm test` stays
 * meaningful for someone working on the frontend alone.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import axios from 'axios'
import { describe, expect, it } from 'vitest'

import { API_BASE_URL, ApiError, calculate } from '../src/api/client'
import type { CalculationRequest, ErrorCode } from '../src/api/client'
import Calculator from '../src/components/Calculator'

const WAIT = { timeout: 5000 }

async function backendIsUp(): Promise<boolean> {
  try {
    const { data } = await axios.get(`${API_BASE_URL}/api/health`, { timeout: 2000 })
    return data.status === 'ok'
  } catch {
    return false
  }
}

const available = await backendIsUp()

if (!available) {
  console.warn(
    `\n[e2e] Skipped: no backend at ${API_BASE_URL}. Start it with "cd backend && uvicorn main:app".\n`,
  )
}

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /calculate/i }))
}

/** Await a call that is expected to fail and hand back the ApiError. */
async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const resolved = Symbol('resolved')
  const outcome = await promise.then(() => resolved).catch((error: unknown) => error)

  if (outcome === resolved) {
    throw new Error('expected the call to reject, but it resolved')
  }
  return outcome as ApiError
}

describe.skipIf(!available)('the API is reachable from the app origin', () => {
  it('answers the health check', async () => {
    const { data } = await axios.get(`${API_BASE_URL}/api/health`)
    expect(data).toEqual({ status: 'ok' })
  })

  it('allows a cross-origin request from the dev server origin', async () => {
    // jsdom blocks this if the CORS headers do not permit our origin, so
    // reaching the assertion at all is the assertion.
    await expect(calculate({ operation: 'add', a: 1, b: 1 })).resolves.toBeDefined()
  })
})

describe.skipIf(!available)('client.ts against the real API', () => {
  it.each([
    ['add', 2, 3, 5],
    ['subtract', 10, 3, 7],
    ['multiply', 4, 5, 20],
    ['divide', 7, 2, 3.5],
    ['power', 2, 3, 8],
    ['percentage', 15, 200, 30],
  ] as const)('computes %s', async (operation, a, b, expected) => {
    const response = await calculate({ operation, a, b })
    expect(response.result).toBeCloseTo(expected)
  })

  it('computes square_root without sending b', async () => {
    const response = await calculate({ operation: 'square_root', a: 9 })
    expect(response.result).toBeCloseTo(3)
  })

  it('echoes the operands back in the response', async () => {
    const response = await calculate({ operation: 'add', a: 2, b: 3 })
    expect(response).toEqual({ operation: 'add', a: 2, b: 3, result: 5 })
  })

  it('returns null for b on a unary response', async () => {
    const response = await calculate({ operation: 'square_root', a: 9 })
    expect(response.b).toBeNull()
  })
})

describe.skipIf(!available)('real error codes reach the UI layer intact', () => {
  it.each([
    ['division_by_zero', { operation: 'divide', a: 1, b: 0 }],
    ['invalid_input', { operation: 'square_root', a: -1 }],
    ['result_overflow', { operation: 'multiply', a: 1e308, b: 10 }],
    ['validation_error', { operation: 'add', a: 1 }],
  ] as [ErrorCode, CalculationRequest][])(
    'maps a real failure to %s',
    async (code, request) => {
      const error = await rejection(calculate(request))

      expect(error).toBeInstanceOf(ApiError)
      expect(error.code).toBe(code)
      expect(error.message).toBeTruthy()
    },
  )
})

describe.skipIf(!available)('the full stack, through the UI', () => {
  it('calculates and displays a result', async () => {
    render(<Calculator />)
    fireEvent.click(screen.getByRole('button', { name: /division/i }))
    type(/first number/i, '7')
    type(/second number/i, '2')
    submit()

    await waitFor(
      () => expect(screen.getByRole('status').textContent).toMatch(/3\.5/),
      WAIT,
    )
  })

  it('formats away float noise end to end', async () => {
    render(<Calculator />)
    type(/first number/i, '0.1')
    type(/second number/i, '0.2')
    submit()

    await waitFor(
      () => expect(screen.getByRole('status').textContent).toMatch(/=\s*0\.3$/),
      WAIT,
    )
  })

  it('shows the real division-by-zero message', async () => {
    render(<Calculator />)
    fireEvent.click(screen.getByRole('button', { name: /division/i }))
    type(/first number/i, '1')
    type(/second number/i, '0')
    submit()

    await waitFor(
      () => expect(screen.getByRole('alert').textContent).toMatch(/divide by zero/i),
      WAIT,
    )
  })

  it('calculates a square root without a second field', async () => {
    render(<Calculator />)
    fireEvent.click(screen.getByRole('button', { name: /square root/i }))
    type(/first number/i, '81')
    submit()

    await waitFor(
      () => expect(screen.getByRole('status').textContent).toMatch(/9/),
      WAIT,
    )
  })

  it('reports a real overflow rather than showing Infinity', async () => {
    render(<Calculator />)
    fireEvent.click(screen.getByRole('button', { name: /multiplication/i }))
    type(/first number/i, '1e308')
    type(/second number/i, '10')
    submit()

    await waitFor(
      () => expect(screen.getByRole('alert').textContent).toMatch(/too large/i),
      WAIT,
    )
    expect(screen.queryByRole('status')).toBeNull()
  })
})
