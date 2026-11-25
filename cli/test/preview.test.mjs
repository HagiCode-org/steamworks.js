import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { main } from '../src/cli.mjs'
import { bigFile, capture, fakeSession, fakeSteam, makeItem, steamItem, submitted, sentAnything } from './helpers.mjs'

const WRITE_ENV = { WORKSHOP_WRITE_CONFIRMED: '1' }

async function runPreview(argv, { env = {}, session }) {
    const io = capture()
    const code = await main(argv, { stdout: io.stdout, stderr: io.stderr, env, steam: fakeSteam(session) })
    return { code, out: io.out, err: io.err }
}

test('preview sends only the preview path and the change note; content, title, tags and visibility are untouched', async () => {
    const item = makeItem('prev-ok', { publishedFileId: '77' })
    const session = fakeSession({
        items: { 77: steamItem(77) },
        afterSubmit: (items, id) => { items[id].previewUrl = 'https://cdn.example/preview-b.png' },
    })
    const r = await runPreview(['preview', item, '--yes'], { env: WRITE_ENV, session })
    assert.equal(r.code, 0, r.err)
    const [call] = submitted(session)
    assert.deepEqual(Object.keys(call[2]).sort(), ['changeNote', 'previewPath'])
    assert.ok(call[2].previewPath.endsWith(path.join('workshop', 'preview.png')))
    assert.match(call[2].changeNote, /预览图已更新/)
})

test('preview refuses when Steam still lists the old preview after the update', async () => {
    const item = makeItem('prev-same', { publishedFileId: '77' })
    const session = fakeSession({ items: { 77: steamItem(77) } })
    const r = await runPreview(['preview', item, '--yes'], { env: WRITE_ENV, session })
    assert.equal(r.code, 1)
    assert.match(r.err, /still lists the same preview/)
})

test('preview refuses an item owned by another account and an item of another app; nothing is sent', async () => {
    const item = makeItem('prev-foreign', { publishedFileId: '77' })
    const foreign = fakeSession({ items: { 77: steamItem(77, { owner: '76561198000000999' }) } })
    const r1 = await runPreview(['preview', item, '--yes'], { env: WRITE_ENV, session: foreign })
    assert.equal(r1.code, 1)
    assert.match(r1.err, /owned by/)
    assert.equal(sentAnything(foreign), false)

    const other = fakeSession({ items: { 77: steamItem(77, { consumerAppId: 480 }) } })
    const r2 = await runPreview(['preview', item, '--yes'], { env: WRITE_ENV, session: other })
    assert.equal(r2.code, 1)
    assert.match(r2.err, /belongs to app 480/)
    assert.equal(sentAnything(other), false)
})

test('a preview over 1,000,000 bytes is refused before Steam is contacted', async () => {
    const item = makeItem('prev-big', { publishedFileId: '77', previewPath: 'big.png' })
    bigFile(path.join(item, 'workshop', 'big.png'), 1_000_001)
    const session = fakeSession({ items: { 77: steamItem(77) } })
    const r = await runPreview(['preview', item, '--yes'], { env: WRITE_ENV, session })
    assert.equal(r.code, 1)
    assert.match(r.err, /at most 1000000 bytes|1000000/)
    assert.equal(sentAnything(session), false)
})

test('a dry run of preview prints the file and the note and does not read Steam', async () => {
    const item = makeItem('prev-dry', { publishedFileId: '77' })
    const session = fakeSession({ items: { 77: steamItem(77) } })
    const r = await runPreview(['preview', item], { session })
    assert.equal(r.code, 0, r.err)
    assert.match(r.out, /dry run: nothing was sent/)
    assert.equal(session.calls.length, 0)
})
