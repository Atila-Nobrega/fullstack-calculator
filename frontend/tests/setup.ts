// Vitest setup, loaded before every test file.
//
// React Testing Library mounts components into a real DOM document. Without an
// explicit teardown, each test would render on top of the last one's markup and
// queries like getByRole would start finding two of everything.
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
