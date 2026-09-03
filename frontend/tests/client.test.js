/**
 * The API client.
 *
 * Axios is mocked here, so these tests describe the contract between the UI and
 * the network layer -- what goes on the wire, and what comes back as an error --
 * without needing a running backend. The real request/response shapes are
 * verified against the live API by the backend's integration tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}))

import axios from 'axios'

import {
  API_BASE_URL,
  ApiError,
  calculate,
  resolveBaseUrl,
} from '../src/api/client.js'

/** Build the rejection axios produces for an HTTP error response. */
function httpError(status, body) {
  const error = new Error(`Request failed with status code ${status}`)
  error.response = { status, data: body }
  return error
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('API_BASE_URL', () => {
  it('points at the backend', () => {
    expect(API_BASE_URL).toContain('8000')
  })
})

describe('resolveBaseUrl', () => {
  it('uses the dev server default when nothing is configured', () => {
    expect(resolveBaseUrl(undefined, false)).toBe('http://localhost:8000')
  })

  it('goes same-origin in a production build', () => {
    // Empty means requests are relative -- /api/calculate -- which is what the
    // nginx container proxies to the backend.
    expect(resolveBaseUrl(undefined, true)).toBe('')
  })

  it('never bakes an absolute API address into a production bundle by default', () => {
    expect(resolveBaseUrl(undefined, true)).not.toContain('http')
  })

  it('prefers an explicit VITE_API_URL over either default', () => {
    expect(resolveBaseUrl('https://api.example.com', true)).toBe(
      'https://api.example.com',
    )
    expect(resolveBaseUrl('https://api.example.com', false)).toBe(
      'https://api.example.com',
    )
  })

  it('treats an explicitly empty VITE_API_URL as same-origin', () => {
    // The Dockerfile passes VITE_API_URL="", so this must not fall through to
    // the localhost default.
    expect(resolveBaseUrl('', false)).toBe('')
  })

  it('builds a relative request path when the base is empty', () => {
    expect(`${resolveBaseUrl('', true)}/api/calculate`).toBe('/api/calculate')
  })
})

describe('calculate', () => {
  it('posts to the calculate endpoint', async () => {
    axios.post.mockResolvedValue({ data: { result: 5 } })

    await calculate({ operation: 'add', a: 2, b: 3 })

    expect(axios.post).toHaveBeenCalledTimes(1)
    expect(axios.post.mock.calls[0][0]).toBe(`${API_BASE_URL}/api/calculate`)
  })

  it('sends both operands for a binary operation', async () => {
    axios.post.mockResolvedValue({ data: { result: 5 } })

    await calculate({ operation: 'add', a: 2, b: 3 })

    expect(axios.post.mock.calls[0][1]).toEqual({
      operation: 'add',
      a: 2,
      b: 3,
    })
  })

  it('omits b entirely for a unary operation', async () => {
    // The backend rejects a square_root request that carries b, so an
    // undefined value must not be serialised as a null.
    axios.post.mockResolvedValue({ data: { result: 3 } })

    await calculate({ operation: 'square_root', a: 9 })

    expect(axios.post.mock.calls[0][1]).toEqual({ operation: 'square_root', a: 9 })
    expect('b' in axios.post.mock.calls[0][1]).toBe(false)
  })

  it('returns the response body on success', async () => {
    const body = { operation: 'add', a: 2, b: 3, result: 5 }
    axios.post.mockResolvedValue({ data: body })

    await expect(calculate({ operation: 'add', a: 2, b: 3 })).resolves.toEqual(body)
  })
})

describe('calculate error handling', () => {
  it('turns a 400 into an ApiError carrying the error code', async () => {
    axios.post.mockRejectedValue(
      httpError(400, { error: 'division_by_zero', detail: 'cannot divide by zero' }),
    )

    await expect(calculate({ operation: 'divide', a: 1, b: 0 })).rejects.toBeInstanceOf(
      ApiError,
    )
  })

  it('carries the server code and detail through', async () => {
    axios.post.mockRejectedValue(
      httpError(400, { error: 'division_by_zero', detail: 'cannot divide by zero' }),
    )

    const error = await calculate({ operation: 'divide', a: 1, b: 0 }).catch((e) => e)

    expect(error.code).toBe('division_by_zero')
    expect(error.message).toBe('cannot divide by zero')
  })

  it('handles a 422 validation error the same way', async () => {
    axios.post.mockRejectedValue(
      httpError(422, { error: 'validation_error', detail: "'b' is missing" }),
    )

    const error = await calculate({ operation: 'add', a: 1 }).catch((e) => e)

    expect(error.code).toBe('validation_error')
    expect(error.message).toBe("'b' is missing")
  })

  it('falls back to a generic message when the error body has no detail', async () => {
    // Our API always sends one, but the code must not surface "undefined" to
    // the user if a proxy or a future version omits it.
    axios.post.mockRejectedValue(httpError(400, { error: 'invalid_input' }))

    const error = await calculate({ operation: 'add', a: 1, b: 2 }).catch((e) => e)

    expect(error.code).toBe('invalid_input')
    expect(error.message).toBe('The calculation failed.')
  })

  it('reports an unreachable backend as a network error', async () => {
    // No `response` property: the request never got an answer.
    axios.post.mockRejectedValue(new Error('Network Error'))

    const error = await calculate({ operation: 'add', a: 1, b: 2 }).catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('network_error')
  })

  it('gives the network error a message a user can act on', async () => {
    axios.post.mockRejectedValue(new Error('Network Error'))

    const error = await calculate({ operation: 'add', a: 1, b: 2 }).catch((e) => e)

    expect(error.message).toMatch(/backend|service|server/i)
  })

  it('falls back to a network error when the body is not our error shape', async () => {
    // e.g. a proxy returning an HTML error page.
    axios.post.mockRejectedValue(httpError(502, '<html>Bad Gateway</html>'))

    const error = await calculate({ operation: 'add', a: 1, b: 2 }).catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('network_error')
  })
})

describe('ApiError', () => {
  it('is a real Error', () => {
    expect(new ApiError('invalid_input', 'nope')).toBeInstanceOf(Error)
  })

  it('exposes the code and the message', () => {
    const error = new ApiError('invalid_input', 'nope')
    expect(error.code).toBe('invalid_input')
    expect(error.message).toBe('nope')
  })
})
