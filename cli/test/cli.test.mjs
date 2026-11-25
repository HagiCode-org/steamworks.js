import test from 'node:test'
import assert from 'node:assert/strict'
import { main } from '../src/cli.mjs'
import { capture, fakeSession, fakeSteam } from './helpers.mjs'

const run = async (argv, env = {}) => {
    const io = capture()
    const session = fakeSession()
    const steam = fakeSteam(session)
    const code = await main(argv, { stdout: io.stdout, stderr: io.stderr, env, steam })
    return { code, out: io.out, err: io.err, steam }
}

test('an unknown command is a usage error on standard error, lists the commands and exits 2', async () => {
    const r = await run(['frobnicate'])
    assert.equal(r.code, 2)
    assert.equal(r.out, '')
    assert.match(r.err, /unknown command "frobnicate"/)
    assert.match(r.err, /publish, update, preview/)
})

test('--help and --version exit 0 and never touch Steam', async () => {
    const help = await run(['--help'])
    assert.equal(help.code, 0)
    assert.match(help.out, /Commands:/)
    const version = await run(['--version'])
    assert.equal(version.code, 0)
    assert.match(version.out, /^\d+\.\d+\.\d+\n$/)
    assert.equal(help.steam.connects.length + version.steam.connects.length, 0)
})

test('each command has its own --help, exits 0 and does not contact Steam', async () => {
    for (const name of ['publish', 'update', 'preview', 'images', 'list', 'doctor', 'check']) {
        const r = await run([name, '--help'])
        assert.equal(r.code, 0, name)
        assert.match(r.out, new RegExp(`Usage: swjs ${name}`))
        assert.equal(r.steam.connects.length, 0, name)
    }
})

test('an unknown option is a usage error that names the command', async () => {
    const r = await run(['check', 'some-dir', '--frobnicate'])
    assert.equal(r.code, 2)
    assert.match(r.err, /swjs check: .*frobnicate/)
})

test('a wrong number of positional arguments is a usage error', async () => {
    assert.equal((await run(['check'])).code, 2)
    assert.equal((await run(['check', 'a', 'b'])).code, 2)
    assert.equal((await run(['images', 'list'])).code, 2)
})

test('--json on a write command is refused as an unknown option', async () => {
    const r = await run(['publish', 'x', '--json'])
    assert.equal(r.code, 2)
})

test('a bad --visibility value is refused before any Steam call', async () => {
    const r = await run(['publish', 'does-not-matter', '--visibility', 'secret'])
    assert.equal(r.steam.connects.length, 0)
    assert.notEqual(r.code, 0)
})
