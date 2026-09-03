import { useState } from 'react'

import { ApiError, calculate } from '../api/client'
import type { CalculationRequest } from '../api/client'
import { OPERATIONS, isUnary, operationById } from '../operations'
import type { OperationId } from '../operations'
import { formatResult } from '../utils/format'

/** Which of the two fields is being reported on, used to word the message. */
type OperandPosition = 'first' | 'second'

type ParsedOperand = { ok: true; value: number } | { ok: false; error: string }

/** What is on screen after a successful calculation. */
interface DisplayResult {
  expression: string
  value: string
}

/**
 * Read one operand out of its text field.
 *
 * The fields are `type="text"` rather than `type="number"` on purpose: a
 * number input silently discards what it cannot parse, so a user typing "abc"
 * would see the field empty and no explanation of what went wrong. Parsing it
 * ourselves means we can say which value is wrong and why.
 */
function parseOperand(raw: string, position: OperandPosition): ParsedOperand {
  const text = raw.trim()

  if (text === '') {
    return { ok: false, error: `Enter a number for the ${position} value.` }
  }

  const value = Number(text)
  if (!Number.isFinite(value)) {
    return { ok: false, error: `The ${position} value is not a valid number.` }
  }

  return { ok: true, value }
}

interface OperandFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}

function OperandField({ id, label, value, onChange }: OperandFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-slate-600"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        // Raises a numeric keypad on mobile without handing validation to the
        // browser the way type="number" would.
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-lg text-slate-900 transition outline-none placeholder:text-slate-400 focus:border-slate-800 focus:ring-2 focus:ring-slate-800/20"
        placeholder="0"
      />
    </div>
  )
}

export default function Calculator() {
  const [operation, setOperation] = useState<OperationId>('add')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [result, setResult] = useState<DisplayResult | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const unary = isUnary(operation)

  function chooseOperation(id: OperationId) {
    setOperation(id)
    // A result from the previous operation would be stale and misleading next
    // to a different operator.
    setResult(null)
    setError('')
  }

  function fail(message: string) {
    setError(message)
    setResult(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const first = parseOperand(a, 'first')
    if (!first.ok) {
      fail(first.error)
      return
    }

    let second: ParsedOperand | null = null
    if (!unary) {
      second = parseOperand(b, 'second')
      if (!second.ok) {
        fail(second.error)
        return
      }
    }

    const request: CalculationRequest =
      second === null
        ? { operation, a: first.value }
        : { operation, a: first.value, b: second.value }

    setError('')
    setPending(true)

    try {
      const response = await calculate(request)
      setResult({
        // Rendered from the values that were sent, so editing a field
        // afterwards cannot make the displayed sum disagree with the answer.
        expression: operationById(operation)!.expression(request.a, request.b),
        value: formatResult(response.result),
      })
    } catch (failure) {
      fail(
        failure instanceof ApiError
          ? failure.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg shadow-slate-200/60 sm:p-8">
      <h1 className="text-xl font-semibold text-slate-800">Calculator</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every sum is worked out by the API, not the browser.
      </p>

      <form aria-label="Calculator" onSubmit={handleSubmit} className="mt-6">
        <div
          role="group"
          aria-label="Operation"
          className="grid grid-cols-4 gap-2"
        >
          {OPERATIONS.map(({ id, label, symbol }) => {
            const selected = id === operation
            return (
              <button
                key={id}
                // Without this these would submit the form on click.
                type="button"
                aria-label={label}
                aria-pressed={selected}
                title={label}
                onClick={() => chooseOperation(id)}
                className={`rounded-xl border py-3 text-lg font-medium transition ${
                  selected
                    ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span aria-hidden="true">{symbol}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-5 space-y-4">
          <OperandField
            id="operand-a"
            label="First number"
            value={a}
            onChange={setA}
          />
          {!unary && (
            <OperandField
              id="operand-b"
              label="Second number"
              value={b}
              onChange={setB}
            />
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-xl bg-slate-800 py-3 text-base font-medium text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Calculating…' : 'Calculate'}
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {result && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 rounded-xl bg-slate-50 px-4 py-3"
        >
          <p className="text-sm text-slate-500">{result.expression} =</p>
          <p className="mt-0.5 text-3xl font-semibold break-all text-slate-900">
            {result.value}
          </p>
        </div>
      )}
    </div>
  )
}
