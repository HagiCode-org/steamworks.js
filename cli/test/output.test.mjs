import test from 'node:test'
import assert from 'node:assert/strict'
import { main } from '../src/cli.mjs'
import { createOutput } from '../src/output.mjs'
import { capture, fakeSession, fakeSteam, steamItem } from './helpers.mjs'

test('in --json mode standard output holds exactly one JSON document and diagnostics stay on standard error', async () => {
    const session = fakeSession({
        query: {
            totalResults: 1,
            returnedResults: 1,
            items: [steamItem(123)],
        },
    })
    const io = capture()
    const code = await main(['list', '--app-id', '4348910', '--json'], {
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
        steam: fakeSteam(session),
    })
    assert.equal(code, 0)
    const parsed = JSON.parse(io.out)
    assert.equal(parsed.items[0].publishedFileId, '123')
    assert.equal(io.err, '')
})

test('JSON output converts bigint values to strings', () => {
    const io = capture()
    const out = createOutput({ stdout: io.stdout, stderr: io.stderr, json: true })
    out.say('narration goes to stderr in json mode')
    out.result({ id: 12n, nested: { n: 3n } })
    assert.deepEqual(JSON.parse(io.out), { id: '12', nested: { n: '3' } })
    assert.equal(io.err, 'narration goes to stderr in json mode\n')
})

test('text mode prints narration and results on standard output', () => {
    const io = capture()
    const out = createOutput({ stdout: io.stdout, stderr: io.stderr, json: false })
    out.say('a line')
    out.result({ ignored: true }, ['result line'])
    assert.equal(io.out, 'a line\nresult line\n')
    assert.equal(io.err, '')
})
