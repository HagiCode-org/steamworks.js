import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { main } from '../src/cli.mjs'
import { capture, fakeSession, fakeSteam, makeItem, tempDir, sentAnything } from './helpers.mjs'

const run = async (argv, { env = {}, session = fakeSession() } = {}) => {
    const io = capture()
    const steam = fakeSteam(session)
    const code = await main(argv, { stdout: io.stdout, stderr: io.stderr, env, steam })
    return { code, out: io.out, err: io.err, steam, session }
}

test('init creates workshop/ with a template workshop.json, description files and a .gitignore', async () => {
    const root = tempDir('init')
    const item = path.join(root, 'mod')
    mkdirSync(item)
    const r = await run(['init', item, '--app-id', '4348910'])
    assert.equal(r.code, 0, r.err)
    const meta = JSON.parse(readFileSync(path.join(item, 'workshop', 'workshop.json'), 'utf8'))
    assert.equal(meta.appId, 4348910)
    assert.equal(meta.publishedFileId, '0')
    assert.deepEqual(Object.keys(meta.languages), ['english', 'schinese'])
    assert.ok(existsSync(path.join(item, 'workshop', 'description.english.txt')))
    assert.ok(existsSync(path.join(item, 'workshop', 'description.schinese.txt')))
    assert.equal(readFileSync(path.join(item, 'workshop', '.gitignore'), 'utf8').includes('.build/'), true)
    assert.equal(r.steam.connects.length, 0)
})

test('init never overwrites: an existing workshop.json is kept byte for byte, nothing else is written, exit 1', async () => {
    const item = makeItem('init-exists')
    const before = readFileSync(path.join(item, 'workshop', 'workshop.json'), 'utf8')
    const beforeFiles = readdirSync(path.join(item, 'workshop')).sort()
    const r = await run(['init', item, '--app-id', '4348910'])
    assert.equal(r.code, 1)
    assert.match(r.err, /refusing to overwrite .*workshop\.json/)
    assert.equal(readFileSync(path.join(item, 'workshop', 'workshop.json'), 'utf8'), before)
    assert.deepEqual(readdirSync(path.join(item, 'workshop')).sort(), beforeFiles)
})

test('init refuses a --languages entry that is out of scope and asks for --app-id', async () => {
    const item = path.join(tempDir('init-lang'), 'mod')
    mkdirSync(item)
    assert.equal((await run(['init', item])).code, 2)
    const r = await run(['init', item, '--app-id', '1', '--languages', 'french'])
    assert.equal(r.code, 2)
    assert.match(r.err, /only english and schinese/)
    assert.equal(existsSync(path.join(item, 'workshop')), false)
})

test('check exits 0 on a complete item and reports every problem of an incomplete one with exit 1', async () => {
    const good = await run(['check', makeItem('check-good')])
    assert.equal(good.code, 0, good.err || good.out)
    assert.match(good.out, /^ok:/m)

    const bad = makeItem('check-bad', { changeNote: '', contentPath: 'missing' })
    const r = await run(['check', bad])
    assert.equal(r.code, 1)
    assert.match(r.out, /problem: changeNote/)
    assert.match(r.out, /problem: contentPath missing/)
    assert.equal(r.steam.connects.length, 0)
})

test('check --json prints one document with the errors list', async () => {
    const r = await run(['check', makeItem('check-json', { changeNote: '' }), '--json'])
    assert.equal(r.code, 1)
    const doc = JSON.parse(r.out)
    assert.equal(doc.ok, false)
    assert.ok(doc.errors.some((e) => /changeNote/.test(e)))
})

test('pack stages the content in workshop/.build and sends nothing', async () => {
    const item = makeItem('pack')
    const r = await run(['pack', item])
    assert.equal(r.code, 0, r.err)
    assert.ok(existsSync(path.join(item, 'workshop', '.build', 'content', 'mod.dll')))
    assert.ok(existsSync(path.join(item, 'workshop', '.build', 'translations.json')))
    assert.equal(r.steam.connects.length, 0)
    assert.equal(sentAnything(r.session), false)
})

test('pack refuses an item that check would refuse, and stages nothing', async () => {
    const item = makeItem('pack-bad', { changeNote: '' })
    const r = await run(['pack', item])
    assert.equal(r.code, 1)
    assert.match(r.err, /not ready for the Workshop/)
    assert.equal(existsSync(path.join(item, 'workshop', '.build')), false)
})

test('a missing workshop.json is a clear failure that points to init', async () => {
    const r = await run(['check', path.join(tempDir('none'), 'mod')])
    assert.equal(r.code, 1)
    assert.match(r.err, /swjs init .* --app-id/)
})
