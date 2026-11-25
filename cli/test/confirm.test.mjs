import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { main } from '../src/cli.mjs'
import { writeMode } from '../src/confirm.mjs'
import { capture, fakeSession, fakeSteam, makeItem, sentAnything } from './helpers.mjs'

const run = async (argv, env) => {
    const io = capture()
    const session = fakeSession()
    const steam = fakeSteam(session)
    const code = await main(argv, { stdout: io.stdout, stderr: io.stderr, env, steam })
    return { code, out: io.out, err: io.err, steam, session }
}

test('writeMode: no --yes is a dry run; --yes without the variable is refused; --yes with it writes', () => {
    assert.deepEqual(writeMode({ yes: false }, {}), { write: false })
    assert.throws(() => writeMode({ yes: true }, {}), /WORKSHOP_WRITE_CONFIRMED=1/)
    assert.throws(() => writeMode({ yes: true }, { WORKSHOP_WRITE_CONFIRMED: '0' }), /WORKSHOP_WRITE_CONFIRMED=1/)
    assert.deepEqual(writeMode({ yes: true }, { WORKSHOP_WRITE_CONFIRMED: '1' }), { write: true })
})

test('publish --yes without the variable refuses before staging files or contacting Steam', async () => {
    const item = makeItem('guard-publish')
    const r = await run(['publish', item, '--yes'], {})
    assert.equal(r.code, 1)
    assert.match(r.err, /WORKSHOP_WRITE_CONFIRMED=1/)
    assert.equal(r.steam.connects.length, 0)
    assert.equal(existsSync(path.join(item, 'workshop', '.build')), false)
    assert.equal(sentAnything(r.session), false)
})

test('update, preview and images writes are guarded the same way', async () => {
    const item = makeItem('guard-all', { publishedFileId: '77' })
    for (const argv of [
        ['update', item, '--yes'],
        ['preview', item, '--yes'],
        ['images', 'upload', item, '--yes'],
        ['images', 'remove', item, 'a.png', '--yes'],
    ]) {
        const r = await run(argv, {})
        assert.equal(r.code, 1, argv.join(' '))
        assert.equal(r.steam.connects.length, 0, argv.join(' '))
    }
})

test('a dry run (no --yes) needs no variable and never contacts Steam', async () => {
    const fresh = makeItem('guard-dry-new')
    const published = makeItem('guard-dry', { publishedFileId: '77' })
    for (const [argv, item] of [[['publish'], fresh], [['update'], published], [['preview'], published]]) {
        argv.push(item)
        const r = await run(argv, {})
        assert.equal(r.code, 0, `${argv[0]}: ${r.err}`)
        assert.equal(r.steam.connects.length, 0, argv[0])
        assert.equal(sentAnything(r.session), false, argv[0])
    }
})
