import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { enUSMessages, zhTWMessages } from '@navide/plugin-ui/foundation'

// The Host halves of these checks (the Navide repository's build scripts and
// its own Plans runtime) stay in the Navide repository.
const packageRoot = resolve(import.meta.dirname, '..')
const pluginUiDist = join(packageRoot, 'node_modules/@navide/plugin-ui/dist')
const supportedLocales = ['en-US', 'zh-TW'] as const
const shadowCatalogs: Record<(typeof supportedLocales)[number], unknown> = { 'en-US': enUSMessages, 'zh-TW': zhTWMessages }

function sourceText(root: string): string {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === 'tests' || entry.name === '__pycache__') return []
      const path = join(root, entry.name)
      if (entry.isDirectory()) return sourceText(path)
      return /\.(?:ts|vue|py)$/.test(entry.name) ? [readFileSync(path, 'utf8')] : []
    })
    .join('\n')
}

describe('navide.plans production package boundary', () => {
  it('declares one combined v2 package without a public Plans permission', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'manifest.json'), 'utf8')) as {
      schemaVersion: number
      id: string
      version: string
      permissions: { system?: string[]; shell?: string }
      contributes?: { views?: Array<Record<string, unknown>> }
      backend?: { entry?: string; protocolVersion?: number; activation?: string }
    }

    expect(manifest.schemaVersion).toBe(2)
    expect(manifest.id).toBe('navide.plans')
    expect(manifest.version).toBe('1.1.10')
    expect(manifest.permissions.system).toEqual(['fs', 'ui', 'aiCli'])
    expect(manifest.permissions).not.toHaveProperty('plans')
    expect(manifest.permissions.shell).toBeUndefined()
    expect(manifest.contributes?.views).toEqual([
      {
        id: 'left',
        kind: 'custom',
        location: 'left',
        title: 'Plans',
        entry: 'frontend/left/index.html',
      },
      {
        id: 'window',
        kind: 'custom',
        location: 'window',
        title: 'Plans',
        entry: 'frontend/window/index.html',
      },
    ])
    expect(manifest.backend).toEqual({
      entry: 'backend/navide-plans',
      protocolVersion: 1,
      activation: 'startup',
    })
  })

  it('depends only on public package APIs', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    // plugin-contracts is plugin-sdk's peer and mermaid an import of its
    // own, both declared so a checkout outside the monorepo installs them.
    expect(Object.keys(packageJson.dependencies ?? {}).sort()).toEqual([
      '@navide/plugin-contracts',
      '@navide/plugin-sdk',
      '@navide/plugin-ui',
      'mermaid',
      'vue',
      'vue-i18n',
      'yaml',
    ])

    const source = sourceText(join(packageRoot, 'src'))
    expect(source).toContain('@navide/plugin-sdk')
    expect(source).toContain('@navide/plugin-ui')
    for (const privateSurface of [
      'from \'electron\'',
      'agent_team_backend',
      'src/main',
      'window.nav',
      'window.agentTeam',
      'node:child_process',
      'node:fs',
    ]) {
      expect(source, privateSurface).not.toContain(privateSurface)
    }
  })

  it('keeps Plans-specific Review Notes UI inside the Plans package', () => {
    const pluginUiIndex = readFileSync(join(pluginUiDist, 'index.d.ts'), 'utf8')
    expect(pluginUiIndex).not.toContain('ReviewNotesPanel')
    expect(existsSync(join(pluginUiDist, 'ReviewNotesPanel.vue.d.ts'))).toBe(false)
    expect(existsSync(join(packageRoot, 'src/components/ReviewNotesPanel.vue'))).toBe(false)
    expect(existsSync(join(packageRoot, 'src/retained/PlanReviewToolbar.vue'))).toBe(true)
    expect(sourceText(join(packageRoot, 'src'))).toContain("./retained/PlanReviewToolbar.vue")
  })

  it('keeps Plans-specific security primitives package-local and decoupled from @navide/plugin-ui/shared', () => {
    const pluginUiSharedIndex = readFileSync(join(pluginUiDist, 'shared/index.d.ts'), 'utf8')
    expect(pluginUiSharedIndex).not.toContain('preparePlanDocHtml')
    expect(pluginUiSharedIndex).not.toContain('createSafeTodoClickHandler')
    expect(pluginUiSharedIndex).not.toContain('validatePlanMessageEvent')
    expect(pluginUiSharedIndex).not.toContain('planSecurity')
    expect(existsSync(join(pluginUiDist, 'shared/planSecurity.d.ts'))).toBe(false)

    expect(existsSync(join(packageRoot, 'src/planSecurity.ts'))).toBe(true)
    const plansAppSource = readFileSync(join(packageRoot, 'src/PlansApp.vue'), 'utf8')
    expect(plansAppSource).toContain('./planSecurity')
    expect(plansAppSource).not.toContain('@navide/plugin-ui/shared')
  })

  it('keeps the Backend Wire child on the Host-private filesystem Bridge', () => {
    const backend = readFileSync(join(packageRoot, 'backend/plans_backend.py'), 'utf8')
    expect(backend).toContain('navide/host/call')
    expect(backend).toContain('"filesystem"')
    expect(backend).not.toContain('"shell"')
    expect(backend).not.toContain('"network"')
    expect(backend).not.toContain('agentMethods')
    // It reaches the core backend's sources only through the public SDK.
    expect(backend).not.toContain('agent_team_backend')
    expect(backend).toContain('from navide_plugin_sdk import (')
  })

  it.each(supportedLocales)('%s owns Plans messages while preserving the legacy recovery shadow', (locale) => {
    const pluginMessages = JSON.parse(
      readFileSync(join(packageRoot, `src/locales/${locale}.json`), 'utf8'),
    ) as Record<string, unknown>
    const shadowMessages = shadowCatalogs[locale] as { pane?: { plans?: Record<string, unknown> } }

    // Every message the legacy recovery UI reads stays identical in the
    // package. Messages only the package uses (new in 1.1.0) are not copied
    // into the shared plugin-ui shadow: that package is a fingerprint input of
    // every first-party plugin, and legacy recovery never shows them.
    // plans.* holds the share dialog, which only this package shows (0.2.44).
    expect(Object.keys(pluginMessages)).toEqual(['pane', 'plans'])
    const plans = (pluginMessages as { pane: { plans: Record<string, unknown> } }).pane.plans
    const shadow = shadowMessages.pane?.plans ?? {}
    expect(Object.keys(shadow).length).toBeGreaterThan(0)
    expect(Object.fromEntries(Object.keys(shadow).map((key) => [key, plans[key]]))).toEqual(shadow)
  })

  it('isolates frontend Vite cleaning so the backend executable is preserved and no stale root assets remain', () => {
    const viteConfig = readFileSync(join(packageRoot, 'vite.config.ts'), 'utf8')
    expect(viteConfig).toMatch(/outDir:\s*(?:frontendOutDir|resolve\([^)]*['"]frontend['"]\))/)
    expect(viteConfig).toContain('emptyOutDir: true')
    expect(viteConfig).not.toContain('emptyOutDir: false')
    expect(viteConfig).toContain('NAVIDE_PLUGIN_ARTIFACT_VERSION')
    expect(viteConfig).toContain('NAVIDE_PLANS_DIST_DIR')
    expect(viteConfig).not.toContain('packages/plugin-contracts/src')
    expect(viteConfig).not.toContain('packages/plugin-sdk/src')
    expect(viteConfig).not.toContain('packages/plugin-ui/src')
    expect(viteConfig).not.toContain('alias:')

    const realDistBackend = join(packageRoot, 'dist/backend/navide-plans')
    const realBackendStatBefore = existsSync(realDistBackend)
      ? { mtimeMs: statSync(realDistBackend).mtimeMs, size: statSync(realDistBackend).size }
      : null

    // The runner's TEMP can be an 8.3 short path (C:\Users\RUNNER~1); vite
    // resolves paths to the long form, and the manifest step's closeBundle scan of
    // the short outDir failed with ENOENT on the Windows runner.
    const tempDistPlans = realpathSync.native(mkdtempSync(join(tmpdir(), 'navide-plans-boundary-')))
    const backendDir = join(tempDistPlans, 'backend')
    const backendExecutable = join(backendDir, 'navide-plans')
    const legacyAssetsDir = join(tempDistPlans, 'assets')
    const staleAssetFile = join(legacyAssetsDir, 'stale-test-asset.js')

    try {
      mkdirSync(backendDir, { recursive: true })
      writeFileSync(backendExecutable, 'binary-sentinel-marker\n')
      mkdirSync(legacyAssetsDir, { recursive: true })
      writeFileSync(staleAssetFile, 'stale-root-asset\n')

      const viteBin = resolve(packageRoot, 'node_modules/vite/bin/vite.js')
      execSync(`"${process.execPath}" "${viteBin}" build --config vite.config.ts`, {
        cwd: packageRoot,
        stdio: 'pipe',
        env: {
          ...process.env,
          NAVIDE_PLANS_DIST_DIR: tempDistPlans,
        },
      })

      expect(existsSync(backendExecutable)).toBe(true)
      expect(readFileSync(backendExecutable, 'utf8')).toBe('binary-sentinel-marker\n')
      expect(existsSync(legacyAssetsDir)).toBe(false)

      const manifest = JSON.parse(readFileSync(join(tempDistPlans, 'manifest.json'), 'utf8')) as {
        contributes?: { views?: Array<{ entry: string }> }
      }
      expect(manifest.contributes?.views?.length).toBeGreaterThan(0)
      for (const view of manifest.contributes?.views ?? []) {
        const entryPath = join(tempDistPlans, view.entry)
        expect(existsSync(entryPath)).toBe(true)
        expect(readFileSync(entryPath, 'utf8')).toContain('<!doctype html>')
      }

      if (realBackendStatBefore !== null) {
        expect(existsSync(realDistBackend)).toBe(true)
        const realBackendStatAfter = statSync(realDistBackend)
        expect(realBackendStatAfter.mtimeMs).toBe(realBackendStatBefore.mtimeMs)
        expect(realBackendStatAfter.size).toBe(realBackendStatBefore.size)
      }
    } finally {
      rmSync(tempDistPlans, { recursive: true, force: true })
    }
    // Runs a real Vite build, which takes well past the 5s default on a cold
    // CI runner.
  }, 120_000)
})
