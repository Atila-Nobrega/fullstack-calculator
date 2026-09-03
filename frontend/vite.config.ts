import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
// vitest/config re-exports Vite's defineConfig with the `test` key typed.
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Component tests need a DOM; jsdom provides one in Node.
    environment: 'jsdom',
    // Give the document the dev server's origin. jsdom enforces CORS on XHR,
    // so tests/e2e.test.tsx is subject to exactly the checks a browser applies
    // to the real app -- which means it verifies the backend's CORS config.
    environmentOptions: {
      jsdom: { url: 'http://localhost:5173' },
    },
    globals: true,
    setupFiles: './tests/setup.ts',
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Report on the shipped source only. main.tsx is the ReactDOM bootstrap:
      // a few lines with nothing to assert, and counting it would only dilute
      // the figure for the code that does have logic.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx'],
    },
  },
})
