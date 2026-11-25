// swjs images list|upload|remove: the extra screenshots (Steam "additional previews") of an existing item. Each write is a
// separate update that sends only the screenshots; the item's title, content and tags are not touched.
import path from 'node:path'
import { UsageError, CommandError } from '../errors.mjs'
import { writeMode } from '../confirm.mjs'
import { CONFIRM_ENV, readItemFile, validateScreenshots, writeItemFile } from '../item.mjs'
import { assertOwned, requirePublished } from './common.mjs'

const ACTIONS = ['list', 'upload', 'remove']
const ADD_NEED = { version: '0.1.4', feature: 'add screenshots' }
const REMOVE_NEED = { version: '0.1.5', feature: 'remove screenshots' }

export default {
    name: 'images',
    usage: 'images list|upload|remove <item-dir> [names...] [--yes] [--json]',
    summary: 'List, add or remove the extra screenshots of an item. upload adds the screenshots listed in workshop.json that Steam does not have yet; remove deletes the named ones.',
    options: {
        yes: { type: 'boolean', help: `send to Steam (upload, remove); also needs ${CONFIRM_ENV}=1 in the environment` },
        json: { type: 'boolean', help: 'list only: print one JSON document on standard output' },
    },
    notes: [
        'Steam keeps the file names. Screenshots are matched by file name, so running upload twice adds nothing the second time.',
        'remove needs steamworks.js 0.1.5 or later, and drops the removed names from screenshots in workshop.json as well.',
    ],
    min: 2,
    max: Infinity,
    async run({ values, positionals, out, env, steam }) {
        const [action, dir, ...names] = positionals
        if (!ACTIONS.includes(action)) throw new UsageError(`swjs images: the action must be ${ACTIONS.join(', ')}, got "${action}"`)
        if (action !== 'remove' && names.length > 0) throw new UsageError(`swjs images ${action}: takes no names after the item folder`)
        if (action === 'remove' && names.length === 0) throw new UsageError('swjs images remove: name the screenshots to remove (file names as images list shows them)')
        if (action === 'list' && values.yes) throw new UsageError('swjs images list sends nothing; --yes does not apply')
        if (action !== 'list' && values.json) throw new UsageError(`swjs images ${action}: --json applies to images list only`)

        const { meta, paths } = readItemFile(dir)
        const publishedFileId = requirePublished(meta, paths, `images ${action}`)
        if (action === 'list') return list({ meta, publishedFileId, values, out, env, steam })

        const mode = writeMode(values, env)
        if (action === 'upload') return upload({ meta, paths, publishedFileId, mode, out, env, steam })
        return remove({ meta, paths, publishedFileId, names, mode, out, env, steam })
    },
}

async function list({ meta, publishedFileId, values, out, env, steam }) {
    const session = await steam.connect({ appId: meta.appId, env })
    try {
        const item = await session.getItem(publishedFileId)
        if (!item) throw new CommandError(`Steam returned no item ${publishedFileId}`)
        const onSteam = item.additionalPreviews.map((p) => p.originalFilename)
        const listed = (meta.screenshots ?? []).map((rel) => path.basename(rel))
        const report = {
            publishedFileId,
            onSteam,
            listedInWorkshopJson: listed,
            missingOnSteam: listed.filter((n) => !onSteam.includes(n)),
            notListedInWorkshopJson: onSteam.filter((n) => !listed.includes(n)),
        }
        const lines = [
            `on Steam (${onSteam.length}): ${onSteam.join(', ') || '(none)'}`,
            `listed in workshop.json (${listed.length}): ${listed.join(', ') || '(none)'}`,
            `to upload: ${report.missingOnSteam.join(', ') || '(none)'}`,
        ]
        out.result(report, values.json ? [] : lines)
        return 0
    } finally {
        session.shutdown()
    }
}

async function upload({ meta, paths, publishedFileId, mode, out, env, steam }) {
    const shots = validateScreenshots(meta, paths)
    if (shots.errors.length > 0) throw new CommandError(`screenshots: ${shots.errors.join('; ')}`)
    if (shots.files.length === 0) {
        out.say('no screenshots are listed in workshop.json: nothing to add')
        return 0
    }
    if (!mode.write) {
        out.say(`item ${publishedFileId}: screenshots listed in workshop.json: ${shots.files.map((f) => path.basename(f)).join(', ')}`)
        out.say('with --yes, the ones Steam does not list yet are sent, matched by file name; nothing else is sent.')
        out.say(`dry run: nothing was sent. After the user confirms this plan, run again with --yes and ${CONFIRM_ENV}=1.`)
        return 0
    }
    const session = await steam.connect({ appId: meta.appId, env, need: ADD_NEED })
    try {
        const before = await session.getItem(publishedFileId)
        if (!before) throw new CommandError(`Steam returned no item ${publishedFileId}; nothing was sent`)
        assertOwned(before, { steamId64: session.whoami().steamId64, appId: meta.appId })
        const onSteam = new Set(before.additionalPreviews.map((p) => p.originalFilename))
        const missing = shots.files.filter((f) => !onSteam.has(path.basename(f)))
        if (missing.length === 0) {
            out.result({ publishedFileId, added: [] }, [`item ${publishedFileId}: every listed screenshot is on Steam already`])
            return 0
        }
        await session.submit(publishedFileId, { additionalPreviewPaths: missing }, { appId: meta.appId })
        const after = await session.getItem(publishedFileId)
        const still = missing.map((f) => path.basename(f)).filter((n) => !(after?.additionalPreviews ?? []).some((p) => p.originalFilename === n))
        if (still.length > 0) {
            throw new CommandError(`Steam does not list ${still.join(', ')} after the update; the file was refused or this steamworks.js build does not apply additionalPreviewPaths`)
        }
        const added = missing.map((f) => path.basename(f))
        out.result({ publishedFileId, added }, added.map((n) => `added screenshot ${n}`))
        return 0
    } finally {
        session.shutdown()
    }
}

async function remove({ meta, paths, publishedFileId, names, mode, out, env, steam }) {
    if (!mode.write) {
        out.say(`item ${publishedFileId}: screenshots to remove: ${names.join(', ')}`)
        out.say('with --yes, each name must be on Steam now (images list shows them); nothing else changes.')
        out.say(`dry run: nothing was sent. After the user confirms this plan, run again with --yes and ${CONFIRM_ENV}=1.`)
        return 0
    }
    const session = await steam.connect({ appId: meta.appId, env, need: REMOVE_NEED })
    try {
        const before = await session.getItem(publishedFileId)
        if (!before) throw new CommandError(`Steam returned no item ${publishedFileId}; nothing was sent`)
        assertOwned(before, { steamId64: session.whoami().steamId64, appId: meta.appId })
        const indexes = names.map((n) => {
            const i = before.additionalPreviews.findIndex((p) => p.originalFilename === n)
            if (i === -1) throw new CommandError(`Steam lists no screenshot named ${n} on item ${publishedFileId}; nothing was sent (run images list)`)
            return i
        })
        await session.submit(publishedFileId, { removeAdditionalPreviewIndexes: indexes }, { appId: meta.appId })
        const after = await session.getItem(publishedFileId)
        const still = names.filter((n) => (after?.additionalPreviews ?? []).some((p) => p.originalFilename === n))
        if (still.length > 0) throw new CommandError(`Steam still lists ${still.join(', ')} after the update; nothing was dropped from workshop.json`)
        meta.screenshots = (meta.screenshots ?? []).filter((rel) => !names.includes(path.basename(rel)))
        writeItemFile(paths, meta)
        out.result({ publishedFileId, removed: names }, names.map((n) => `removed screenshot ${n}`))
        return 0
    } finally {
        session.shutdown()
    }
}
