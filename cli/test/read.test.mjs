import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { main } from '../src/cli.mjs'
import { capture, fakeBinding, fakeSession, fakeSteam, makeItem, steamItem, sentAnything, tempDir } from './helpers.mjs'
import { defaultSteam } from '../src/steam.mjs'

const run = async (argv, { env = {}, session = fakeSession(), steam } = {}) => {
    const io = capture()
    const client = steam ?? fakeSteam(session)
    const code = await main(argv, { stdout: io.stdout, stderr: io.stderr, env, steam: client })
    return { code, out: io.out, err: io.err, session, steam: client }
}

test('status without --remote reads only local data and never contacts Steam', async () => {
    const item = makeItem('status-local', { publishedFileId: '77' })
    const r = await run(['status', item])
    assert.equal(r.code, 0, r.err)
    assert.match(r.out, /item 77/)
    assert.equal(r.steam.connects.length, 0)
})

test('status --remote adds what Steam lists next to the local identity', async () => {
    const item = makeItem('status-remote', { publishedFileId: '77' })
    const session = fakeSession({ items: { 77: steamItem(77) } })
    const r = await run(['status', item, '--remote', '--json'], { session })
    assert.equal(r.code, 0, r.err)
    const doc = JSON.parse(r.out)
    assert.equal(doc.local.publishedFileId, '77')
    assert.equal(doc.remote.title, 'My Mod')
    assert.equal(r.steam.connects.length, 1)
})

test('status --remote on an item that was never published says so and reads nothing', async () => {
    const item = makeItem('status-zero')
    const r = await run(['status', item, '--remote'])
    assert.equal(r.code, 0)
    assert.match(r.out, /not read \(publishedFileId is "0"\)/)
    assert.equal(r.steam.connects.length, 0)
})

test('item shows one item read-only, with --json, and needs no confirmation variable', async () => {
    const session = fakeSession({ items: { 555: steamItem(555, { title: 'Other Mod' }) } })
    const r = await run(['item', '555', '--app-id', '4348910', '--json'], { session })
    assert.equal(r.code, 0, r.err)
    assert.equal(JSON.parse(r.out).title, 'Other Mod')
    assert.equal(sentAnything(session), false)
})

test('item refuses an id that is not a number and a missing --app-id', async () => {
    assert.equal((await run(['item', 'abc', '--app-id', '1'])).code, 2)
    assert.equal((await run(['item', '555'])).code, 2)
})

test('list asks Steam for one page of the app and passes the tag and search text', async () => {
    const session = fakeSession({
        query: { totalResults: 3, returnedResults: 1, items: [steamItem(9)] },
    })
    const r = await run(['list', '--app-id', '4348910', '--tag', 'Mod', '--search', 'save', '--page', '2'], { session })
    assert.equal(r.code, 0, r.err)
    const [call] = session.calls.filter((c) => c[0] === 'queryItems')
    assert.deepEqual(call[1], { appId: 4348910, page: 2, mine: false, search: 'save', tag: 'Mod' })
    assert.match(r.out, /page 2: 1 of 3 item\(s\)/)
    assert.equal(sentAnything(session), false)
})

test('list --mine asks for the signed-in account\'s items', async () => {
    const session = fakeSession()
    const r = await run(['list', '--app-id', '4348910', '--mine', '--json'], { session })
    assert.equal(r.code, 0)
    assert.equal(JSON.parse(r.out).items.length, 0)
    assert.equal(session.calls.find((c) => c[0] === 'queryItems')[1].mine, true)
})

test('list needs --app-id and a page of at least 1', async () => {
    assert.equal((await run(['list'])).code, 2)
    assert.equal((await run(['list', '--app-id', '1', '--page', '0'])).code, 2)
})

test('subscribed lists the subscriptions read-only and needs no confirmation variable', async () => {
    const session = fakeSession({
        subscribed: [{ publishedFileId: '5', title: 'Sub Mod', state: 1, installed: true }],
    })
    const r = await run(['subscribed', '--json'], { session })
    assert.equal(r.code, 0, r.err)
    assert.equal(JSON.parse(r.out).items[0].title, 'Sub Mod')
    assert.equal(sentAnything(session), false)
    assert.equal(session.calls.some((c) => c[0] === 'subscribed'), true)
})

test('doctor prints every check and exits 1 when Steam is unreachable', async () => {
    const folder = fakeBinding({ initBody: "throw new Error('no client')" })
    const r = await run(['doctor', '--app-id', '4348910'], { env: { STEAMWORKS_JS: folder }, steam: defaultSteam })
    assert.equal(r.code, 1)
    assert.match(r.out, /\[ok\] node/)
    assert.match(r.out, /\[ok\] binding: steamworks\.js 0\.1\.5/)
    assert.match(r.out, /\[FAIL\] steam: cannot reach the Steam client/)
    assert.match(r.out, /\[skip\] app: not checked: Steam is not reachable/)
})

test('doctor passes when the binding loads, Steam answers and the account owns the app', async () => {
    const folder = fakeBinding({
        initBody: 'return { localplayer: { getSteamId: () => ({ steamId64: 76561198000000001n, accountId: 1 }), getName: () => "tester" }, apps: { isSubscribedApp: () => true }, workshop: {} }',
    })
    const r = await run(['doctor', '--app-id', '4348910'], { env: { STEAMWORKS_JS: folder }, steam: defaultSteam })
    assert.equal(r.code, 0, r.out + r.err)
    assert.match(r.out, /\[ok\] steam: Steam client reachable as tester/)
    assert.match(r.out, /\[ok\] app: this account owns app 4348910/)
})

test('doctor fails when the account does not own the app', async () => {
    const folder = fakeBinding({
        initBody: 'return { localplayer: { getSteamId: () => ({ steamId64: 1n, accountId: 1 }), getName: () => "t" }, apps: { isSubscribedApp: () => false }, workshop: {} }',
    })
    const r = await run(['doctor', '--app-id', '4348910'], { env: { STEAMWORKS_JS: folder }, steam: defaultSteam })
    assert.equal(r.code, 1)
    assert.match(r.out, /\[FAIL\] app: this account does not own app 4348910/)
})

test('doctor with a missing binding still prints the node check and the rest as skipped', async () => {
    const r = await run(['doctor'], { env: { STEAMWORKS_JS: path.join(tempDir('nobind'), 'missing') }, steam: defaultSteam })
    assert.equal(r.code, 1)
    assert.match(r.out, /\[ok\] node/)
    assert.match(r.out + r.err, /STEAMWORKS_JS/)
})
