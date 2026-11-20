import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Self-contained: the public @navide packages resolve from node_modules (the
// tarballs a Navide GitHub Release carries), not from a Navide checkout.
const excluded = ['**/node_modules/**', '**/dist/**', '**/backend/.venv/**']
const setupFiles = ['tests/support/messages.ts']
const heavy = ['tests/packageBoundary.test.ts']
// Catalog checks read plugin-ui's own strings, which the setup file would
// already have merged this plugin's strings into: they run without it.
const i18n = ['tests/i18n/**/*.test.ts']

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    globals: false,
    // Transform the public packages like source, as the Navide repository's
    // aliases did: vi.resetModules() then re-evaluates their module state.
    server: { deps: { inline: [/@navide\//] } },
    projects: [
      { extends: true, test: { name: 'navide-plans', include: ['src/**/*.{test,spec}.ts'], exclude: excluded, setupFiles } },
      { extends: true, test: {
        name: 'navide-plans-artifacts', include: ['tests/**/*.{test,spec}.ts'], exclude: [...excluded, ...heavy, ...i18n], setupFiles,
      } },
      { extends: true, test: { name: 'navide-plans-i18n', include: i18n, exclude: excluded } },
      // Runs a real Vite build; on its own fork.
      { extends: true, test: {
        name: 'navide-plans-artifacts-heavy', include: heavy, exclude: excluded, setupFiles,
        poolOptions: { forks: { singleFork: true } },
      } },
    ],
  },
})
