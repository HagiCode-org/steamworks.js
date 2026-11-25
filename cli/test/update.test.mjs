import test from 'node:test'
import assert from 'node:assert/strict'
import { main } from '../src/cli.mjs'
import { capture, fakeSession, fakeSteam, makeItem, readMeta, steamItem, submitted, sentAnything } from './helpers.mjs'

const WRITE_ENV = { WORKSHOP_WRITE_CONFIRMED: '1' }

const run = async (argv, { env = {} } = {}) => {
    const io = capture()
    const steam = fakeSteam(fakeSession({ items: { 77: steamItem(77) } }))
    const code = await main(argv, { stdout: io.stdout, stderr: io.stderr, env, steam })
    return { code, out: io.out, err: io.err, steam }
}

test('update refuses an item whose publishedFileId is "0" and points to publish', async () => {
    const item = makeItem('upd-zero')
    const r = await run(['update', item, '--yes'], { env: WRITE_ENV })
    assert.equal(r.code, 1)
    assert.match(r.err, /publishedFileId "0"/)
    assert.match(r.err, /swjs publish/)
    assert.equal(r.steam.connects.length, 0)
})

test('update requires a change note; an empty one is refused before any Steam call', async () => {
    const item = makeItem('upd-note', { publishedFileId: '77', changeNote: '' })
    const r = await run(['update', item, '--yes'], { env: WRITE_ENV })
    assert.equal(r.code, 1)
    assert.match(r.err, /changeNote/)
    assert.equal(r.steam.connects.length, 0)
})

test('--changenote replaces the stored note for one update and must pass the same rule', async () => {
    const item = makeItem('upd-override', { publishedFileId: '77' })
    const bad = await run(['update', item, '--changenote', 'one line only'])
    assert.equal(bad.code, 1)
    const session = fakeSession({ items: { 77: steamItem(77) } })
    const io = capture()
    const code = await main(['update', item, '--yes', '--changenote', '中文：新的修复。\nEnglish: New fix applied.'], {
        stdout: io.stdout, stderr: io.stderr, env: WRITE_ENV, steam: fakeSteam(session),
    })
    assert.equal(code, 0, io.err)
    const primary = submitted(session)[0]
    assert.equal(primary[2].changeNote, '中文：新的修复。\nEnglish: New fix applied.')
    assert.equal(readMeta(item).changeNote.includes('New fix'), false, 'workshop.json keeps its own note')
})

test('a confirmed update sends the content to the same publishedFileId and reads it back', async () => {
    const item = makeItem('upd-ok', { publishedFileId: '77' })
    const session = fakeSession({ items: { 77: steamItem(77) } })
    const io = capture()
    const code = await main(['update', item, '--yes'], { stdout: io.stdout, stderr: io.stderr, env: WRITE_ENV, steam: fakeSteam(session) })
    assert.equal(code, 0, io.err)
    const sent = submitted(session)
    assert.ok(sent.length >= 1)
    assert.ok(sent.every((c) => c[1] === '77'), 'every submission names the existing id')
    assert.ok(sent[0][2].contentPath)
    assert.match(io.out, /read back: title "My Mod"/)
    assert.equal(readMeta(item).publishedFileId, '77', 'the id is never edited')
})

test('an item that belongs to another account is refused and nothing is submitted', async () => {
    const item = makeItem('upd-foreign', { publishedFileId: '77' })
    const session = fakeSession({ items: { 77: steamItem(77, { owner: '76561198999999999' }) } })
    const io = capture()
    const code = await main(['update', item, '--yes'], { stdout: io.stdout, stderr: io.stderr, env: WRITE_ENV, steam: fakeSteam(session) })
    assert.equal(code, 1)
    assert.match(io.err, /owned by 76561198999999999/)
    assert.equal(sentAnything(session), false)
})

test('an item of another app is refused and nothing is submitted', async () => {
    const item = makeItem('upd-app', { publishedFileId: '77' })
    const session = fakeSession({ items: { 77: steamItem(77, { consumerAppId: 480 }) } })
    const io = capture()
    const code = await main(['update', item, '--yes'], { stdout: io.stdout, stderr: io.stderr, env: WRITE_ENV, steam: fakeSteam(session) })
    assert.equal(code, 1)
    assert.match(io.err, /belongs to app 480/)
    assert.equal(sentAnything(session), false)
})
