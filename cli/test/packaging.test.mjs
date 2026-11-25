import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkManifest } from '../scripts/check-package.mjs'
import { tempDir } from './helpers.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(CLI_ROOT, '..')

function packedFiles(cwd) {
    const out = execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const parsed = JSON.parse(out)
    const entry = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]
    return entry.files.map((f) => f.path)
}

function fakePackage() {
    const root = tempDir('pkg')
    for (const file of ['bin/swjs.mjs', 'src/cli.mjs', 'README.md', 'LICENSE']) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
        writeFileSync(path.join(root, file), '')
    }
    return root
}

const dependencies = (version) => ({ '@hagicode/steamworks.js': version })

test('check-package refuses the placeholder version 0.0.1', () => {
    const problems = checkManifest({ version: '0.0.1', dependencies: dependencies('0.2.1') }, fakePackage())
    assert.ok(problems.some((p) => /placeholder version 0\.0\.1/.test(p)))
})

test('check-package refuses an unpinned steamworks.js dependency', () => {
    for (const range of ['>=0.1.5', '^0.2.1', '~0.2.1', '*']) {
        const problems = checkManifest({ version: '0.1.0', dependencies: dependencies(range) }, fakePackage())
        assert.ok(problems.some((p) => /must be pinned/.test(p)), range)
    }
})

test('check-package passes a pinned release version with a pinned dependency and the required files', () => {
    assert.deepEqual(checkManifest({ version: '0.3.1', dependencies: dependencies('0.3.1') }, fakePackage()), [])
    assert.deepEqual(checkManifest({ version: '0.3.1-dev.5', dependencies: dependencies('0.3.1') }, fakePackage()), [])
})

test('check-package reports missing files', () => {
    const problems = checkManifest({ version: '0.3.1', dependencies: dependencies('0.3.1') }, tempDir('empty'))
    assert.equal(problems.filter((p) => /^missing /.test(p)).length, 4)
})

test('running the guard by hand passes on the committed, pinned manifest', () => {
    const r = spawnSync(process.execPath, [path.join(CLI_ROOT, 'scripts', 'check-package.mjs')], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /@hagicode\/steamworks-js-cli \d+\.\d+\.\d+, dependency @hagicode\/steamworks\.js \d+\.\d+\.\d+/)
    assert.doesNotMatch(r.stdout + r.stderr, /placeholder/)
})

test('the CLI package lists only its entry, source, README and license files', () => {
    const files = packedFiles(CLI_ROOT)
    assert.ok(files.includes('bin/swjs.mjs'))
    assert.ok(files.includes('src/cli.mjs'))
    assert.ok(files.includes('package.json'))
    assert.ok(files.includes('LICENSE'))
    for (const f of files) {
        assert.ok(!f.startsWith('test/') && !f.startsWith('scripts/'), `not a test or script: ${f}`)
        assert.ok(!f.startsWith('steamworks-'), `no skill folder: ${f}`)
        assert.ok(!f.includes('workshop/'), `no workshop item folder: ${f}`)
    }
})

test('the root package ships no CLI file', () => {
    const files = packedFiles(REPO_ROOT)
    assert.ok(files.length > 0)
    assert.equal(files.filter((f) => f.startsWith('cli/')).length, 0)
})
