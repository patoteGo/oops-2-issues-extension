import { defineConfig } from 'vitest/config'

/**
 * oops 2 issues test config.
 *
 * The extension ships zero runtime deps (vanilla JS, no build step), but we
 * reuse the host repo's Vitest + jsdom installs for unit tests. Run from the
 * repo root via `npm run test:extension`.
 *
 * `root` is pinned to this directory so test globs and imports resolve
 * against oops-2-issues regardless of the caller's cwd.
 */
export default defineConfig({
  root: __dirname,
  test: {
    environment: 'jsdom',
    include: ['**/*.test.js'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
  },
})
