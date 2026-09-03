/**
 * The calculator UI.
 *
 * The API client is mocked, so these tests describe what the component does --
 * what it renders, what it validates before hitting the network, what it sends,
 * and how it reports success and failure -- independently of the backend.
 *
 * Queries go through accessible roles and labels rather than test ids, so a
 * passing test also means the control is reachable by a screen reader and by
 * anyone navigating with a keyboard.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/client', () => ({
  ApiError: class ApiError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.name = 'ApiError'
      this.code = code
    }
  },
  calculate: vi.fn(),
}))

import { ApiError, calculate } from '../src/api/client'
import Calculator from '../src/components/Calculator'

const mockCalculate = vi.mocked(calculate)

/** Type a value into a labelled field. */
function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

/** Choose an operation by its accessible name. */
function choose(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /calculate/i }))
}

/** Fill in a binary calculation and submit it. */
function calculateWith(a: string, b: string) {
  type(/first number/i, a)
  type(/second number/i, b)
  submit()
}

function resolveWith(result: number) {
  mockCalculate.mockResolvedValue({
    operation: 'add',
    a: 0,
    b: 0,
    result,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveWith(0)
})

describe('initial render', () => {
  it('shows a heading', () => {
    render(<Calculator />)
    expect(screen.getByRole('heading', { name: /calculator/i })).toBeDefined()
  })

  it('offers a button for every operation', () => {
    render(<Calculator />)
    for (const name of [
      /addition/i,
      /subtraction/i,
      /multiplication/i,
      /division/i,
      /exponentiation/i,
      /square root/i,
      /percentage/i,
    ]) {
      expect(screen.getByRole('button', { name })).toBeDefined()
    }
  })

  it('starts on addition', () => {
    render(<Calculator />)
    expect(
      screen.getByRole('button', { name: /addition/i }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('shows both operand fields', () => {
    render(<Calculator />)
    expect(screen.getByLabelText(/first number/i)).toBeDefined()
    expect(screen.getByLabelText(/second number/i)).toBeDefined()
  })

  it('starts with empty fields', () => {
    render(<Calculator />)
    expect(screen.getByLabelText<HTMLInputElement>(/first number/i).value).toBe('')
    expect(screen.getByLabelText<HTMLInputElement>(/second number/i).value).toBe('')
  })

  it('shows no result and no error before anything is calculated', () => {
    render(<Calculator />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('does not call the API on mount', () => {
    render(<Calculator />)
    expect(mockCalculate).not.toHaveBeenCalled()
  })
})

describe('choosing an operation', () => {
  it('marks the chosen operation as pressed', () => {
    render(<Calculator />)
    choose(/division/i)
    expect(
      screen.getByRole('button', { name: /division/i }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('unmarks the previous one', () => {
    render(<Calculator />)
    choose(/division/i)
    expect(
      screen.getByRole('button', { name: /addition/i }).getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('hides the second field for square root', () => {
    render(<Calculator />)
    choose(/square root/i)
    expect(screen.queryByLabelText(/second number/i)).toBeNull()
  })

  it('brings the second field back when a binary operation is chosen again', () => {
    render(<Calculator />)
    choose(/square root/i)
    choose(/multiplication/i)
    expect(screen.getByLabelText(/second number/i)).toBeDefined()
  })

  it('keeps the first operand when the operation changes', () => {
    render(<Calculator />)
    type(/first number/i, '7')
    choose(/division/i)
    expect(screen.getByLabelText<HTMLInputElement>(/first number/i).value).toBe('7')
  })
})

describe('client-side validation', () => {
  it('rejects an empty first operand', () => {
    render(<Calculator />)
    type(/second number/i, '3')
    submit()
    expect(screen.getByRole('alert').textContent).toMatch(/first/i)
  })

  it('rejects an empty second operand', () => {
    render(<Calculator />)
    type(/first number/i, '3')
    submit()
    expect(screen.getByRole('alert').textContent).toMatch(/second/i)
  })

  it('rejects a non-numeric first operand', () => {
    render(<Calculator />)
    calculateWith('abc', '3')
    expect(screen.getByRole('alert').textContent).toMatch(/valid number/i)
  })

  it('rejects a lone minus sign', () => {
    render(<Calculator />)
    calculateWith('-', '3')
    expect(screen.getByRole('alert').textContent).toMatch(/valid number/i)
  })

  it('does not call the API when validation fails', () => {
    render(<Calculator />)
    calculateWith('abc', '3')
    expect(mockCalculate).not.toHaveBeenCalled()
  })

  it('does not require a second operand for square root', async () => {
    resolveWith(3)
    render(<Calculator />)
    choose(/square root/i)
    type(/first number/i, '9')
    submit()
    await waitFor(() => expect(mockCalculate).toHaveBeenCalled())
  })

  it('accepts a negative number', async () => {
    resolveWith(-1)
    render(<Calculator />)
    calculateWith('-4', '3')
    await waitFor(() => expect(mockCalculate).toHaveBeenCalled())
  })

  it('accepts a decimal', async () => {
    resolveWith(3)
    render(<Calculator />)
    calculateWith('2.5', '0.5')
    await waitFor(() => expect(mockCalculate).toHaveBeenCalled())
  })

  it('clears a validation error once a valid calculation runs', async () => {
    resolveWith(5)
    render(<Calculator />)
    calculateWith('abc', '3')
    expect(screen.getByRole('alert')).toBeDefined()

    calculateWith('2', '3')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

describe('sending the request', () => {
  it('sends the chosen operation and both operands as numbers', async () => {
    resolveWith(20)
    render(<Calculator />)
    choose(/multiplication/i)
    calculateWith('4', '5')

    await waitFor(() =>
      expect(mockCalculate).toHaveBeenCalledWith({
        operation: 'multiply',
        a: 4,
        b: 5,
      }),
    )
  })

  it('sends no second operand for square root', async () => {
    resolveWith(3)
    render(<Calculator />)
    choose(/square root/i)
    type(/first number/i, '9')
    submit()

    await waitFor(() =>
      expect(mockCalculate).toHaveBeenCalledWith({ operation: 'square_root', a: 9 }),
    )
  })

  it('submits when Enter is pressed in a field', async () => {
    resolveWith(5)
    render(<Calculator />)
    type(/first number/i, '2')
    type(/second number/i, '3')
    fireEvent.submit(screen.getByRole('form', { name: /calculator/i }))

    await waitFor(() => expect(mockCalculate).toHaveBeenCalled())
  })

  it('disables the submit button while the request is in flight', async () => {
    let release: (value: never) => void = () => {}
    mockCalculate.mockReturnValue(
      new Promise((resolve) => {
        release = resolve as (value: never) => void
      }),
    )
    render(<Calculator />)
    calculateWith('2', '3')

    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: /calculat/i }).disabled,
      ).toBe(true),
    )

    release({ operation: 'add', a: 2, b: 3, result: 5 } as never)
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: /calculat/i }).disabled,
      ).toBe(false),
    )
  })
})

describe('displaying the result', () => {
  it('shows the result', async () => {
    resolveWith(5)
    render(<Calculator />)
    calculateWith('2', '3')

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/5/))
  })

  it('formats away floating-point noise', async () => {
    resolveWith(0.30000000000000004)
    render(<Calculator />)
    calculateWith('0.1', '0.2')

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/0\.3/))
    expect(screen.getByRole('status').textContent).not.toMatch(/0\.30000/)
  })

  it('announces the result to assistive technology', async () => {
    resolveWith(5)
    render(<Calculator />)
    calculateWith('2', '3')

    await waitFor(() =>
      expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite'),
    )
  })

  // The expression above the answer is rendered per-operation, so each
  // renderer needs exercising through the UI -- a typo in one of these
  // templates is invisible to every other suite.
  it.each([
    [/subtraction/i, '10', '3', 7, /10 − 3/],
    [/exponentiation/i, '2', '3', 8, /2 \^ 3/],
    [/percentage/i, '15', '200', 30, /15% of 200/],
    [/multiplication/i, '4', '5', 20, /4 × 5/],
    [/division/i, '9', '3', 3, /9 ÷ 3/],
  ])(
    'renders the expression for %s',
    async (name, a, b, result, expression) => {
      resolveWith(result)
      render(<Calculator />)
      choose(name)
      calculateWith(a, b)

      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toMatch(expression),
      )
    },
  )

  it('renders the expression for a unary operation', async () => {
    resolveWith(9)
    render(<Calculator />)
    choose(/square root/i)
    type(/first number/i, '81')
    submit()

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/√81/),
    )
  })

  it('replaces the previous result with the new one', async () => {
    resolveWith(5)
    render(<Calculator />)
    calculateWith('2', '3')
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/5/))

    resolveWith(12)
    calculateWith('4', '8')
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/12/))
    expect(screen.getByRole('status').textContent).not.toMatch(/\b5\b/)
  })
})

describe('reporting API errors', () => {
  it('shows the message from a domain error', async () => {
    mockCalculate.mockRejectedValue(
      new ApiError('division_by_zero', 'cannot divide by zero'),
    )
    render(<Calculator />)
    choose(/division/i)
    calculateWith('1', '0')

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/cannot divide by zero/i),
    )
  })

  it('shows a message when the backend is unreachable', async () => {
    mockCalculate.mockRejectedValue(
      new ApiError('network_error', 'Cannot reach the calculator service.'),
    )
    render(<Calculator />)
    calculateWith('2', '3')

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/cannot reach/i),
    )
  })

  it('clears the stale result when a calculation fails', async () => {
    resolveWith(5)
    render(<Calculator />)
    calculateWith('2', '3')
    await waitFor(() => expect(screen.getByRole('status')).toBeDefined())

    mockCalculate.mockRejectedValue(new ApiError('invalid_input', 'nope'))
    calculateWith('2', '0')
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('shows a generic message when the failure is not an ApiError', async () => {
    // A bug in the client, not a response from the server. The user still
    // needs to be told something rather than seeing a silent no-op.
    mockCalculate.mockRejectedValue(new TypeError('undefined is not a function'))
    render(<Calculator />)
    calculateWith('2', '3')

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/something went wrong/i),
    )
  })

  it('does not leak an internal error message to the user', async () => {
    mockCalculate.mockRejectedValue(new TypeError('undefined is not a function'))
    render(<Calculator />)
    calculateWith('2', '3')

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(screen.getByRole('alert').textContent).not.toMatch(/undefined is not/i)
  })

  it('re-enables the button after a failure', async () => {
    mockCalculate.mockRejectedValue(new ApiError('invalid_input', 'nope'))
    render(<Calculator />)
    calculateWith('2', '3')

    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: /calculat/i }).disabled,
      ).toBe(false),
    )
  })
})

describe('mobile support', () => {
  it('asks mobile keyboards for a numeric layout', () => {
    render(<Calculator />)
    expect(screen.getByLabelText(/first number/i).getAttribute('inputmode')).toBe(
      'decimal',
    )
  })

  it('uses a text field so validation is ours, not the browser default', () => {
    // type="number" silently discards what it cannot parse, which would hide
    // the invalid input instead of letting us explain it.
    render(<Calculator />)
    expect(screen.getByLabelText(/first number/i).getAttribute('type')).toBe('text')
  })
})
