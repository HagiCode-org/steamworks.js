import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { writeFileSync } from 'node:fs'
import { main } from '../src/cli.mjs'
import { capture, fakeSession, fakeSteam, makeItem, readMeta, steamItem, submitted, sentAnything, writeMeta } from './helpers.mjs'

const WRITE_ENV = { WORKSHOP_WRITE_CONFIRMED: '1' }

function withShots(item, names) {
    for (const name of names) {
        writeFileSync(path.join(item, 'workshop', name), 'png')
    }
    const meta = readMeta(item)
    meta.screenshots = names
    writeMeta(item, meta)
    return item
}

async function runImages(argv, { env = {}, session }) {
    const io = capture()
    const code = await main(argv, { stdout: io.stdout, stderr: io.stderr, env, steam: fakeSteam(session) })
    return { code, out: io.out, err: io.err }
}

test('images upload sends only the screenshots Steam does not list yet, matched by file name', async () => {
    const item = withShots(makeItem('img-add', { publishedFileId: '77' }), ['a.png', 'b.png'])
    const session = fakeSession({
        items: { 77: steamItem(77, { additionalPreviews: [{ originalFilename: 'a.png', urlOrVideoId: 'u', previewType: 0 }] }) },
        afterSubmit: (items) => {
            items['77'].additionalPreviews.push({ originalFilename: 'b.png', urlOrVideoId: 'v', previewType: 0 })
        },
    })
    const r = await runImages(['images', 'upload', item, '--yes'], { env: WRITE_ENV, session })
    assert.equal(r.code, 0, r.err)
    const [call] = submitted(session)
    assert.deepEqual(Object.keys(call[2]), ['additionalPreviewPaths'])
    assert.equal(call[2].additionalPreviewPaths.length, 1)
    assert.ok(call[2].additionalPreviewPaths[0].endsWith('b.png'))
    assert.match(r.out, /added screenshot b.png/)
})

test('images upload with nothing missing sends nothing', async () => {
    const item = withShots(makeItem('img-none', { publishedFileId: '77' }), ['a.png'])
    const session = fakeSession({
        items: { 77: steamItem(77, { additionalPreviews: [{ originalFilename: 'a.png', urlOrVideoId: 'u', previewType: 0 }] }) },
    })
    const r = await runImages(['images', 'upload', item, '--yes'], { env: WRITE_ENV, session })
    assert.equal(r.code, 0)
    assert.equal(sentAnything(session), false)
})

test('images upload refuses a foreign item and sends nothing', async () => {
    const item = withShots(makeItem('img-foreign', { publishedFileId: '77' }), ['a.png'])
    const session = fakeSession({ items: { 77: steamItem(77, { owner: '76561198000000999' }) } })
    const r = await runImages(['images', 'upload', item, '--yes'], { env: WRITE_ENV, session })
    assert.equal(r.code, 1)
    assert.match(r.err, /owned by/)
    assert.equal(sentAnything(session), false)
})

test('images remove drops the named screenshots from Steam and from workshop.json', async () => {
    const item = withShots(makeItem('img-rm', { publishedFileId: '77' }), ['a.png', 'b.png'])
    const session = fakeSession({
        items: {
            77: steamItem(77, {
                additionalPreviews: [
                    { originalFilename: 'a.png', urlOrVideoId: 'u1', previewType: 0 },
                    { originalFilename: 'b.png', urlOrVideoId: 'u2', previewType: 0 },
                ],
            }),
        },
        afterSubmit: (items) => {
            items['77'].additionalPreviews = items['77'].additionalPreviews.filter((p) => p.originalFilename !== 'a.png')
        },
    })
    const r = await runImages(['images', 'remove', item, 'a.png', '--yes'], { env: WRITE_ENV, session })
    assert.equal(r.code, 0, r.err)
    const [call] = submitted(session)
    assert.deepEqual(call[2], { removeAdditionalPreviewIndexes: [0] })
    assert.deepEqual(readMeta(item).screenshots, ['b.png'])
})

test('images remove refuses a name Steam does not list and changes nothing', async () => {
    const item = withShots(makeItem('img-unknown', { publishedFileId: '77' }), ['a.png'])
    const session = fakeSession({ items: { 77: steamItem(77) } })
    const r = await runImages(['images', 'remove', item, 'ghost.png', '--yes'], { env: WRITE_ENV, session })
    assert.equal(r.code, 1)
    assert.match(r.err, /no screenshot named ghost.png/)
    assert.equal(sentAnything(session), false)
    assert.deepEqual(readMeta(item).screenshots, ['a.png'])
})

test('images list is read-only and needs no confirmation variable', async () => {
    const item = withShots(makeItem('img-list', { publishedFileId: '77' }), ['a.png', 'c.png'])
    const session = fakeSession({
        items: { 77: steamItem(77, { additionalPreviews: [{ originalFilename: 'a.png', urlOrVideoId: 'u', previewType: 0 }] }) },
    })
    const r = await runImages(['images', 'list', item], { env: {}, session })
    assert.equal(r.code, 0, r.err)
    assert.match(r.out, /to upload: c.png/)
    assert.equal(sentAnything(session), false)
})

test('images rejects an action it does not know and names given to list', async () => {
    const item = makeItem('img-usage', { publishedFileId: '77' })
    const session = fakeSession({ items: { 77: steamItem(77) } })
    assert.equal((await runImages(['images', 'frob', item], { session })).code, 2)
    assert.equal((await runImages(['images', 'list', item, 'a.png'], { session })).code, 2)
    assert.equal((await runImages(['images', 'remove', item], { session })).code, 2)
})
