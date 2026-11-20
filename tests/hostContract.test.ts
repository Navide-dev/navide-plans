import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SINGLE_WRITE_MAX_JSON_BYTES } from '../src/planPaging'
import { CLI_AGENT_SPECS } from '../src/retained/agentSpecs'

// The Navide Host checks the pinned version against these values (its
// tests/fixtures/navide-plans/contract.json); hostContract.json is the copy.
const contract = JSON.parse(readFileSync(new URL('./hostContract.json', import.meta.url), 'utf8')) as {
  planDocDirs: string[]
  maxFrameBytes: number
  singleWriteMaxJsonBytes: number
  agentSpecs: Array<{ agentKey: string; label: string; hint: string }>
}
const backend = readFileSync(new URL('../backend/plans_backend.py', import.meta.url), 'utf8')

describe('the values the Navide Host relies on', () => {
  it('lists the plan document folders the backend scans', () => {
    const block = /^PLAN_DOC_DIRS: tuple\[str, \.\.\.\] = \(([\s\S]*?)^\)/m.exec(backend)
    expect(block, 'PLAN_DOC_DIRS in backend/plans_backend.py').not.toBeNull()
    expect([...block![1].matchAll(/"([^"]+)"/g)].map((match) => match[1])).toEqual(contract.planDocDirs)
  })

  it('reads backend frames up to the size the Host sends', () => {
    const frame = /^MAX_FRAME_BYTES = ([\d_]+)$/m.exec(backend)
    expect(frame, 'MAX_FRAME_BYTES in backend/plans_backend.py').not.toBeNull()
    expect(Number(frame![1].replaceAll('_', ''))).toBe(contract.maxFrameBytes)
  })

  it('caps one write at the size the Host bridge queues', () => {
    expect(SINGLE_WRITE_MAX_JSON_BYTES).toBe(contract.singleWriteMaxJsonBytes)
  })

  it('keeps the CLI agent list the Host ships', () => {
    expect(CLI_AGENT_SPECS.map(({ agentKey, label, hint }) => ({ agentKey, label, hint }))).toEqual(contract.agentSpecs)
  })
})
