/**
 * The application shell.
 *
 * App's only job is to mount the calculator, so this is a smoke test: if it
 * passes, the wiring from main.tsx down to the UI is intact.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/client', () => ({
  ApiError: class ApiError extends Error {},
  calculate: vi.fn(),
}))

import App from '../src/App'

describe('App', () => {
  it('renders the calculator', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /calculator/i })).toBeDefined()
  })

  it('renders the operation buttons', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /addition/i })).toBeDefined()
  })

  it('renders the input fields', () => {
    render(<App />)
    expect(screen.getByLabelText(/first number/i)).toBeDefined()
  })
})
