// Runs the SDK's navide-plugin for this machine's target: a package with a
// native backend is validated and packed for the platform that built it.
//   node scripts/navide-plugin-host.mjs validate dist
//   node scripts/navide-plugin-host.mjs package dist --out navide-browser.vsix
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sdk = resolve(dirname(fileURLToPath(import.meta.url)), '../node_modules/@navide/plugin-sdk')
const bin = JSON.parse(readFileSync(join(sdk, 'package.json'), 'utf8')).bin
const cli = join(sdk, typeof bin === 'string' ? bin : bin['navide-plugin'])
const target = `${process.platform}-${process.arch}`
execFileSync(process.execPath, [cli, ...process.argv.slice(2), '--target', target], { stdio: 'inherit' })
