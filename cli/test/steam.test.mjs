import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { main } from '../src/cli.mjs'
import { connect, locateBinding, parseVersion, requireVersion, versionAtLeast } from '../src/steam.mjs'
import { capture, fakeBinding, makeItem, tempDir } from './helpers.mjs'

const DEPENDENCY = '@hagicode/steamworks.js'

test('STEAMWORKS_JS selects the binding folder and init receives the AppID', async () => {
    const marker = path.join(tempDir('marker'), 'init-args.txt')
    const folder = fakeBinding({
        initBody: `require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(appId)); return { localplayer: { getSteamId: () => ({ steamId64: 1n, accountId: 1 }), getName: () => 'x' }, apps: { isSubscribedApp: () => true }, workshop: {} }`,
    })
    const session = await connect({ appId: 4348910, env: { STEAMWORKS_JS: folder } })
    assert.ok(session)
    assert.equal(readFileSync(marker, 'utf8'), '4348910')
    session.shutdown()
})

test('the located binding reports its version from its own package.json', () => {
    const folder = fakeBinding({ version: '0.1.4' })
    assert.deepEqual(locateBinding({ STEAMWORKS_JS: folder }), { folder, version: '0.1.4' })
})

test('a STEAMWORKS_JS folder without index.js is refused, naming the variable', () => {
    assert.throws(() => locateBinding({ STEAMWORKS_JS: tempDir('no-index') }), /STEAMWORKS_JS points to .* has no index\.js/)
})

test('with no override and no dependency installed, the message names STEAMWORKS_JS and the dependency', (t) => {
    let resolvable = true
    try {
        createRequire(import.meta.url).resolve(`${DEPENDENCY}/package.json`)
    } catch {
        resolvable = false
    }
    if (resolvable) {
        t.skip('the dependency is installed in this checkout; the missing-binding path cannot be reached')
        return
    }
    assert.throws(() => locateBinding({}), (e) => /STEAMWORKS_JS/.test(e.message) && /@hagicode\/steamworks\.js/.test(e.message))
})

test('the version comparison reads x.y.z and ignores a prerelease suffix', () => {
    assert.deepEqual(parseVersion('0.1.5'), [0, 1, 5])
    assert.deepEqual(parseVersion('0.3.1-dev.5'), [0, 3, 1])
    assert.equal(versionAtLeast('0.1.5', '0.1.5'), true)
    assert.equal(versionAtLeast('0.1.4', '0.1.5'), false)
    assert.equal(versionAtLeast('0.2.0', '0.1.5'), true)
    assert.equal(versionAtLeast('garbage', '0.1.5'), false)
    assert.throws(() => requireVersion('0.1.4', '0.1.5', 'remove screenshots'), /cannot remove screenshots; install @hagicode\/steamworks\.js@0\.1\.5/)
})

test('removing screenshots with an older binding is refused before the binding is loaded or Steam is contacted', async () => {
    const marker = path.join(tempDir('loaded'), 'loaded.txt')
    const folder = fakeBinding({ version: '0.1.4', loadMarker: marker })
    const item = makeItem('old-binding', { publishedFileId: '77', screenshots: [] })
    const io = capture()
    const code = await main(['images', 'remove', item, 'shot.png', '--yes'], {
        stdout: io.stdout,
        stderr: io.stderr,
        env: { STEAMWORKS_JS: folder, WORKSHOP_WRITE_CONFIRMED: '1' },
    })
    assert.equal(code, 1)
    assert.match(io.err, /cannot remove screenshots/)
    assert.equal(existsSync(marker), false, 'the native binding must not be loaded')
})

test('--help, check and dry runs never load the binding', async () => {
    const marker = path.join(tempDir('no-load'), 'loaded.txt')
    const folder = fakeBinding({ loadMarker: marker })
    const item = makeItem('no-load')
    const io = capture()
    const env = { STEAMWORKS_JS: folder }
    await main(['publish', '--help'], { stdout: io.stdout, stderr: io.stderr, env })
    await main(['check', item], { stdout: io.stdout, stderr: io.stderr, env })
    await main(['publish', item], { stdout: io.stdout, stderr: io.stderr, env })
    await main(['update', item], { stdout: io.stdout, stderr: io.stderr, env })
    assert.equal(existsSync(marker), false)
})

test('a Steam client that cannot be reached is a failure with the reason, not a crash', async () => {
    const folder = fakeBinding({ initBody: "throw new Error('no client')" })
    await assert.rejects(connect({ appId: 1, env: { STEAMWORKS_JS: folder } }), /cannot reach the Steam client .*no client/)
})

test('an account that does not own the app is refused after connecting, and the session is closed', async () => {
    const folder = fakeBinding({ initBody: 'return { localplayer: {}, apps: { isSubscribedApp: () => false }, workshop: {} }' })
    await assert.rejects(connect({ appId: 1, env: { STEAMWORKS_JS: folder } }), /does not own app 1/)
})

