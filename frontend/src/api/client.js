/**
 * The only module that talks to the network.
 *
 * Everything above it deals in resolved values and `ApiError`s, never in HTTP
 * status codes or axios internals. That keeps the component testable by mocking
 * one module, and means swapping the HTTP library later touches this file only.
 */
import axios from 'axios'

/**
 * Work out where the API lives.
 *
 * In development the app is served by Vite on :5173 and the API runs separately
 * on :8000, so requests are cross-origin and need an absolute URL (the backend's
 * CORS config allows exactly that origin).
 *
 * A production build defaults to the empty string, making every request
 * relative -- `/api/calculate` rather than `http://host:8000/api/calculate`.
 * That is what the container setup relies on: nginx serves the bundle and
 * proxies `/api/` to the backend, so the browser only ever talks to one origin
 * and CORS never enters the picture. It also means the API's address is not
 * baked into the bundle at build time, which it would be with an absolute URL.
 *
 * Set `VITE_API_URL` to override -- needed only when the frontend is deployed
 * somewhere that is not proxying to the backend for it.
 *
 * @param {string | undefined} configured `VITE_API_URL`, if set
 * @param {boolean} isProduction `import.meta.env.PROD`
 */
export function resolveBaseUrl(configured, isProduction) {
  if (configured !== undefined && configured !== null) {
    return configured
  }
  return isProduction ? '' : 'http://localhost:8000'
}

/** Where the FastAPI backend lives. Empty means same-origin. */
export const API_BASE_URL = resolveBaseUrl(
  import.meta.env.VITE_API_URL,
  import.meta.env.PROD,
)

const CALCULATE_URL = `${API_BASE_URL}/api/calculate`

const NETWORK_ERROR_MESSAGE =
  'Cannot reach the calculator service. Check that the backend is running.'

/**
 * A failure the UI can explain to the user.
 *
 * `code` is the backend's machine-readable `ErrorCode` -- `division_by_zero`,
 * `invalid_input`, `result_overflow`, `validation_error` -- or `network_error`
 * when the request never got an answer. Branch on `code`; show `message`.
 */
export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/**
 * Perform one calculation.
 *
 * @param {{operation: string, a: number, b?: number}} request
 * @returns {Promise<{operation: string, a: number, b: number | null, result: number}>}
 * @throws {ApiError}
 */
export async function calculate({ operation, a, b }) {
  // `b` is omitted rather than sent as null: the backend rejects a unary
  // request that carries a second operand, and `{b: undefined}` would be
  // serialised away anyway -- being explicit makes the intent readable.
  const payload =
    b === undefined || b === null ? { operation, a } : { operation, a, b }

  try {
    const { data } = await axios.post(CALCULATE_URL, payload)
    return data
  } catch (error) {
    const body = error.response?.data

    // Our own ErrorResponse shape: {error, detail}.
    if (body && typeof body === 'object' && typeof body.error === 'string') {
      throw new ApiError(body.error, body.detail ?? 'The calculation failed.')
    }

    // No response at all, or something that is not our error shape -- an HTML
    // error page from a proxy, say. Either way the user's problem is the same:
    // the service did not answer usefully.
    throw new ApiError('network_error', NETWORK_ERROR_MESSAGE)
  }
}
