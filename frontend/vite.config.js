import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Component tests need a DOM; jsdom provides one in Node.
    environment: 'jsdom',
    // Give the document the dev server's origin. jsdom enforces CORS on XHR,
    // so tests/e2e.test.jsx is subject to exactly the checks a browser applies
    // to the real app -- which means it verifies the backend's CORS config.
    environmentOptions: {
      jsdom: { url: 'http://localhost:5173' },
    },
    globals: true,
    setupFiles: './tests/setup.js',
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Report on the shipped source only. main.jsx is the ReactDOM bootstrap:
      // three lines with nothing to assert, and counting it would only dilute
      // the figure for the code that does have logic.
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx'],
    },
  },
})
