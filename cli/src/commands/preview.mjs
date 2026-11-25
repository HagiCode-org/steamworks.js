// swjs preview: replaces only the main preview image of an existing item. It sends the preview and the change note and
// nothing else, so content, title, description, tags and visibility on Steam are left as they are.
import fs from 'node:fs'
import path from 'node:path'
import { CommandError } from '../errors.mjs'
import { writeMode } from '../confirm.mjs'
import { CONFIRM_ENV, IMAGE_EXTENSIONS, PREVIEW_MAX_BYTES, PREVIEW_NOTE, changeNoteProblems, readItemFile } from '../item.mjs'
import { itemUrl } from '../steam.mjs'
import { assertOwned, requirePublished } from './common.mjs'

export default {
    name: 'preview',
    usage: 'preview <item-dir> [--file IMAGE] [--changenote TEXT] [--yes]',
    summary: 'Replace only the main preview of an existing item (PNG, JPG or GIF, at most 1,000,000 bytes).',
    options: {
        file: { type: 'string', help: 'the image to send (default: previewPath from workshop.json)' },
        changenote: { type: 'string', help: 'the change note for this update (default: the preview note)' },
        yes: { type: 'boolean', help: `send to Steam; also needs ${CONFIRM_ENV}=1 in the environment` },
    },
    min: 1,
    max: 1,
    async run({ values, positionals, out, env, steam }) {
        const mode = writeMode(values, env)
        const { meta, paths } = readItemFile(positionals[0])
        const publishedFileId = requirePublished(meta, paths, 'preview')
        const file = values.file ? path.resolve(values.file) : path.resolve(paths.metaDir, meta.previewPath ?? 'preview.png')
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new CommandError(`preview image ${file} does not exist`)
        if (!IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
            throw new CommandError(`preview ${file}: use ${IMAGE_EXTENSIONS.join(', ')}`)
        }
        const size = fs.statSync(file).size
        if (size > PREVIEW_MAX_BYTES) throw new CommandError(`preview ${file} is ${size} bytes; Steam accepts at most ${PREVIEW_MAX_BYTES}`)
        const changeNote = (values.changenote ?? PREVIEW_NOTE).trim()
        const problems = changeNoteProblems(changeNote)
        if (problems.length > 0) throw new CommandError(`change note: ${problems.join('; ')}`)

        out.say(`item ${publishedFileId} (app ${meta.appId}): main preview ${file} (${size} bytes)`)
        out.say('sends only the main preview and the change note; content, title, description, tags and visibility are not sent')
        for (const line of changeNote.split('\n')) out.say(`  ${line}`)
        if (!mode.write) {
            out.say(`dry run: nothing was sent. After the user confirms this plan, run again with --yes and ${CONFIRM_ENV}=1.`)
            return 0
        }

        const session = await steam.connect({ appId: meta.appId, env })
        try {
            const before = await session.getItem(publishedFileId)
            if (!before) throw new CommandError(`Steam returned no item ${publishedFileId}; nothing was sent`)
            assertOwned(before, { steamId64: session.whoami().steamId64, appId: meta.appId })
            await session.submit(publishedFileId, { previewPath: file, changeNote }, { appId: meta.appId })
            const after = await session.getItem(publishedFileId)
            if (!after?.previewUrl || after.previewUrl === before.previewUrl) {
                throw new CommandError(`Steam still lists the same preview for item ${publishedFileId} after the update; check the item page`)
            }
            out.result(
                { publishedFileId, previewUrl: after.previewUrl, url: itemUrl(publishedFileId) },
                [`preview of item ${publishedFileId} replaced: ${after.previewUrl}`, `item: ${itemUrl(publishedFileId)}`],
            )
        } finally {
            session.shutdown()
        }
        return 0
    },
}
