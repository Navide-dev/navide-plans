// Ported from the Navide repository's tests/infrastructure/i18nOwnership.test.ts
// ("references only strings it ships"), which checked this plugin while it
// lived there. A string the plugin asks for but does not ship (its own
// catalog or @navide/plugin-ui's) renders as its raw key. Without the Host's
// catalog to tell keys from other dotted strings, this reads the keys handed
// to the translation functions.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { enUSMessages } from '@navide/plugin-ui/foundation'

function paths(catalog: unknown): Set<string> {
  const found = new Set<string>()
  const walk = (value: unknown, prefix: string): void => {
    if (prefix) found.add(prefix)
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, prefix ? `${prefix}.${key}` : key)
    }
  }
  walk(catalog, '')
  return found
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(path)
    return /\.(?:ts|vue)$/.test(entry.name) && !/\.(?:test|spec)\.ts$/.test(entry.name) && entry.name !== 'testing.ts' ? [path] : []
  })
}

// The first argument of t(), $t(), te() or tm(), as a literal or as the
// static head of a template literal.
const CALL = /(?<![\w$])(?:\$t|t|te|tm)\(\s*(?:'([^']+)'|"([^"]+)"|`([^`$]*)(\$\{)?[^`]*`)/g

export function referencedKeys(text: string): Array<{ key: string; prefix: boolean }> {
  return [...text.matchAll(CALL)].map((match) => {
    const literal = match[1] ?? match[2]
    if (literal !== undefined) return { key: literal, prefix: false }
    return { key: match[3], prefix: match[4] !== undefined }
  })
}

describe('navide.plans i18n ownership', () => {
  const own = new Set([
    ...paths(enUSMessages),
    ...paths(JSON.parse(readFileSync('src/locales/en-US.json', 'utf8'))),
  ])

  it('references only strings it ships', () => {
    const missing: string[] = []
    let checked = 0
    for (const file of sources('src')) {
      for (const { key, prefix } of referencedKeys(readFileSync(file, 'utf8'))) {
        if (!/^[A-Za-z][\w-]*(?:\.[\w-]*)*$/.test(key)) continue
        checked += 1
        const found = prefix ? [...own].some((path) => path.startsWith(key)) : own.has(key)
        if (!found) missing.push(`${file}: ${key}${prefix ? '…' : ''}`)
      }
    }
    expect(checked, 'no translation calls found: the pattern has gone stale').toBeGreaterThan(100)
    expect([...new Set(missing)], [...new Set(missing)].join('\n')).toEqual([])
  })

  it('reads the call shapes the sources use', () => {
    expect(referencedKeys("{{ $t('git.read-failed', { reason }) }}")).toEqual([{ key: 'git.read-failed', prefix: false }])
    expect(referencedKeys('t("label.base")')).toEqual([{ key: 'label.base', prefix: false }])
    expect(referencedKeys('i18n.global.t(`status.${kind}`)')).toEqual([{ key: 'status.', prefix: true }])
    expect(referencedKeys("emit('git.status')")).toEqual([])
    expect(referencedKeys("format('a.b')")).toEqual([])
  })
})
