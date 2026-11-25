// Fixtures for the CLI tests: a complete item folder, captured output, a fake Steam session and a fake binding folder.
// No test here contacts Steam: the Steam side is either a fake session or a binding folder whose init() fails or records.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const APP_ID = 4348910
export const ME = '76561198000000001'
export const ITEM_URL = (id) => `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`

export function tempDir(label) {
    return mkdtempSync(path.join(os.tmpdir(), `swjs-${label}-`))
}

// Captured stdout/stderr writers with their text.
export function capture() {
    const text = { out: '', err: '' }
    return {
        stdout: { write: (s) => { text.out += s; return true } },
        stderr: { write: (s) => { text.err += s; return true } },
        get out() { return text.out },
        get err() { return text.err },
    }
}

const SAMPLE_CHANGE_NOTE = '中文：修复存档读取问题。\nEnglish: Fixed a save-loading bug.'

// A complete, valid item folder: <root>/mod/{build,workshop}. Overrides are shallow-merged into workshop.json.
export function makeItem(label, meta = {}) {
    const item = path.join(tempDir(label), 'mod')
    const wdir = path.join(item, 'workshop')
    mkdirSync(path.join(item, 'build', 'data'), { recursive: true })
    mkdirSync(wdir, { recursive: true })
    writeFileSync(path.join(item, 'build', 'mod.dll'), 'DLL')
    writeFileSync(path.join(item, 'build', 'data', 'config.json'), '{}')
    writeFileSync(path.join(wdir, 'description.english.txt'), 'English description of the mod.')
    writeFileSync(path.join(wdir, 'description.schinese.txt'), '中文描述。')
    writeFileSync(path.join(wdir, 'preview.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
    const base = {
        schema: 1,
        appId: APP_ID,
        publishedFileId: '0',
        visibility: 'public',
        primaryLanguage: 'english',
        languages: {
            english: { title: 'My Mod', description: 'description.english.txt' },
            schinese: { title: '我的模组', description: 'description.schinese.txt' },
        },
        contentPath: '../build',
        previewPath: 'preview.png',
        tags: ['Mod'],
        changeNote: SAMPLE_CHANGE_NOTE,
    }
    writeFileSync(path.join(wdir, 'workshop.json'), `${JSON.stringify({ ...base, ...meta }, null, 2)}\n`)
    return item
}

export const readMeta = (item) => JSON.parse(readFileSync(path.join(item, 'workshop', 'workshop.json'), 'utf8'))

export function writeMeta(item, meta) {
    writeFileSync(path.join(item, 'workshop', 'workshop.json'), `${JSON.stringify(meta, null, 2)}\n`)
}

// An item as Steam lists it (the shape steam.mjs normalizes to).
export function steamItem(id, overrides = {}) {
    return {
        publishedFileId: String(id),
        title: 'My Mod',
        owner: ME,
        consumerAppId: APP_ID,
        creatorAppId: APP_ID,
        visibility: 'public',
        tags: ['Mod'],
        previewUrl: 'https://cdn.example/preview-a.png',
        timeUpdated: 1700000000,
        url: ITEM_URL(id),
        additionalPreviews: [],
        ...overrides,
    }
}

// A fake of the session steam.mjs returns. Every call is recorded in `calls`; `items` is what Steam lists by id.
// `afterSubmit(items, id, details)` may change `items` after a submission, to simulate Steam's read-back.
export function fakeSession(options = {}) {
    const calls = []
    const items = structuredClone(options.items ?? {})
    return {
        calls,
        items,
        async getItem(id) {
            calls.push(['getItem', String(id)])
            return items[String(id)] ? structuredClone(items[String(id)]) : null
        },
        whoami() {
            return { steamId64: ME, accountId: 1, name: 'tester' }
        },
        ownsApp() {
            return true
        },
        async createItem(appId) {
            calls.push(['createItem', appId])
            return options.created ?? { itemId: '900001', agreement: false }
        },
        async submit(id, details, opts) {
            calls.push(['submit', String(id), structuredClone(details), opts])
            if (options.submitError) throw new Error(options.submitError)
            options.afterSubmit?.(items, String(id), details)
            return { agreement: options.agreement ?? false }
        },
        async queryItems(query) {
            calls.push(['queryItems', query])
            return options.query ?? { totalResults: 0, returnedResults: 0, items: [] }
        },
        async subscribed() {
            calls.push(['subscribed'])
            return options.subscribed ?? []
        },
        shutdown() {
            calls.push(['shutdown'])
        },
    }
}

// A fake steam module: `connect` records each request and returns the session.
export function fakeSteam(session) {
    const connects = []
    return {
        connects,
        async connect(opts) {
            connects.push(opts)
            return session
        },
    }
}

export const submitted = (session) => session.calls.filter((c) => c[0] === 'submit')
export const sentAnything = (session) => session.calls.some((c) => c[0] === 'submit' || c[0] === 'createItem')

// A binding folder for tests: package.json with the given version and an index.js. `initBody` is the body of init().
export function fakeBinding({ version = '0.1.5', initBody = 'return { localplayer: {}, workshop: {} }', loadMarker = null } = {}) {
    const folder = path.join(tempDir('binding'), 'steamworks.js')
    mkdirSync(folder, { recursive: true })
    writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: '@hagicode/steamworks.js', version }))
    const marker = loadMarker ? `require('node:fs').writeFileSync(${JSON.stringify(loadMarker)}, 'loaded');\n` : ''
    writeFileSync(path.join(folder, 'index.js'), `${marker}module.exports.init = (appId) => { ${initBody} };\nmodule.exports.shutdown = () => {};\n`)
    return folder
}

// A PNG-sized-enough file for preview tests.
export function bigFile(file, bytes) {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, Buffer.alloc(bytes, 1))
    return file
}
