import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { main } from '../src/cli.mjs'
import { capture, fakeSession, fakeSteam, makeItem, readMeta, submitted, ITEM_URL } from './helpers.mjs'

const WRITE_ENV = { WORKSHOP_WRITE_CONFIRMED: '1' }

const run = async (argv, { env = {}, session = fakeSession() } = {}) => {
    const io = capture()
    const steam = fakeSteam(session)
    const code = await main(argv, { stdout: io.stdout, stderr: io.stderr, env, steam })
    return { code, out: io.out, err: io.err, steam, session }
}

test('a dry run prints the plan, sends nothing and leaves publishedFileId at "0"', async () => {
    const item = makeItem('pub-dry')
    const r = await run(['publish', item])
    assert.equal(r.code, 0, r.err)
    assert.match(r.out, /dry run: nothing was sent/)
    assert.equal(r.steam.connects.length, 0)
    assert.equal(readMeta(item).publishedFileId, '0')
})

test('a confirmed publish creates the item, records its id once and sends the primary language with content, preview and tags', async () => {
    const item = makeItem('pub-yes')
    const r = await run(['publish', item, '--yes'], { env: WRITE_ENV })
    assert.equal(r.code, 0, r.err)
    assert.equal(readMeta(item).publishedFileId, '900001')
    assert.deepEqual(r.session.calls.find((c) => c[0] === 'createItem'), ['createItem', 4348910])
    const [primary] = submitted(r.session)
    assert.equal(primary[1], '900001')
    assert.equal(primary[2].language, 'english')
    assert.equal(primary[2].title, 'My Mod', 'no titles object: the stored title is sent unchanged')
    assert.equal(primary[2].visibility, 0)
    assert.deepEqual(primary[2].tags, ['Mod'])
    assert.ok(primary[2].contentPath.endsWith(path.join('workshop', '.build', 'content')))
    assert.ok(primary[2].previewPath.endsWith(path.join('workshop', 'preview.png')))
    assert.match(r.out, new RegExp(ITEM_URL('900001').replace(/[?.]/g, '\\$&')))
})

test('only english and schinese are sent: the second language is a text-only update, a french entry never is', async () => {
    const item = makeItem('pub-langs', {
        languages: {
            english: { title: 'My Mod', description: 'description.english.txt' },
            schinese: { title: '我的模组', description: 'description.schinese.txt' },
            french: { title: 'Mon mod', description: 'description.english.txt' },
        },
    })
    const r = await run(['publish', item, '--yes'], { env: WRITE_ENV })
    assert.equal(r.code, 0, r.err)
    const sent = submitted(r.session)
    assert.deepEqual(sent.map((c) => c[2].language), ['english', 'schinese'])
    assert.equal(sent[1][2].contentPath, undefined, 'the text-only update carries no content')
    assert.equal(sent[1][2].previewPath, undefined)
    assert.ok(!sent.some((c) => c[2].language === 'french'))
    assert.match(r.out + r.err, /skip: french/)
})

test('an item that is already published is refused, points to update, and sends nothing', async () => {
    const item = makeItem('pub-already', { publishedFileId: '42' })
    const r = await run(['publish', item, '--yes'], { env: WRITE_ENV })
    assert.equal(r.code, 1)
    assert.match(r.err, /already holds publishedFileId 42/)
    assert.match(r.err, /swjs update/)
    assert.equal(r.steam.connects.length, 0)
    assert.equal(readMeta(item).publishedFileId, '42')
})

test('a failed upload after creation keeps the recorded id and says to run update, not publish', async () => {
    const item = makeItem('pub-fail')
    const r = await run(['publish', item, '--yes'], { env: WRITE_ENV, session: fakeSession({ submitError: 'network down' }) })
    assert.equal(r.code, 1)
    assert.equal(readMeta(item).publishedFileId, '900001')
    assert.match(r.err, /exists on Steam and its id is recorded: run `swjs update/)
})

test('an agreement that is not accepted is reported with the item URL and exits 1', async () => {
    const item = makeItem('pub-agreement')
    const r = await run(['publish', item, '--yes'], { env: WRITE_ENV, session: fakeSession({ agreement: true }) })
    assert.equal(r.code, 1)
    assert.match(r.err, /legal agreement is not accepted/)
    assert.match(r.err, /filedetails\/\?id=900001/)
    assert.equal(readMeta(item).publishedFileId, '900001')
})

test('--visibility overrides workshop.json for this publish only', async () => {
    const item = makeItem('pub-vis')
    const r = await run(['publish', item, '--yes', '--visibility', 'hidden'], { env: WRITE_ENV })
    assert.equal(r.code, 0, r.err)
    assert.equal(submitted(r.session)[0][2].visibility, 2)
    assert.equal(readMeta(item).visibility, 'public')
})

test('a publish with an invalid item sends nothing, even with --yes and the variable', async () => {
    const item = makeItem('pub-invalid', { changeNote: '' })
    const r = await run(['publish', item, '--yes'], { env: WRITE_ENV })
    assert.equal(r.code, 1)
    assert.equal(r.steam.connects.length, 0)
    assert.match(r.err, /changeNote/)
    assert.equal(readFileSync(path.join(item, 'workshop', 'workshop.json'), 'utf8').includes('"publishedFileId": "0"'), true)
})
