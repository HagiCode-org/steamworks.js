// swjs update: changes an existing item (content, preview, metadata, change note). It updates the item named by
// publishedFileId only, never edits that id, and reads the item back after the write.
import { CommandError } from '../errors.mjs'
import { writeMode } from '../confirm.mjs'
import { CONFIRM_ENV, buildPlan, planLines, readItemFile, stageItem, validateItem } from '../item.mjs'
import { assertOwned, agreementMessage, notReady, requirePublished } from './common.mjs'
import { sendLanguages } from './upload.mjs'
import { itemUrl } from '../steam.mjs'

export default {
    name: 'update',
    usage: 'update <item-dir> [--changenote TEXT] [--yes]',
    summary: 'Update the existing item named by publishedFileId: content, preview, tags, visibility and the change note.',
    options: {
        changenote: { type: 'string', help: 'the bilingual change note for this update only (中文：…, then English: …)' },
        yes: { type: 'boolean', help: `send to Steam; also needs ${CONFIRM_ENV}=1 in the environment` },
    },
    notes: [
        `Writes need --yes and ${CONFIRM_ENV}=1. The change note is required: a two-line 中文/English note.`,
    ],
    min: 1,
    max: 1,
    async run({ values, positionals, out, env, steam }) {
        const mode = writeMode(values, env)
        const { meta, paths } = readItemFile(positionals[0])
        const publishedFileId = requirePublished(meta, paths, 'update')
        const validated = validateItem(meta, paths, { changeNote: values.changenote })
        if (validated.errors.length > 0) throw new CommandError(notReady(validated.errors))
        const visibility = meta.visibility ?? 'public'
        const plan = buildPlan({ ...meta, publishedFileId }, paths, validated, { visibility, changeNote: validated.changeNote })
        for (const line of planLines(plan)) out.say(line)
        if (!mode.write) {
            out.say(`dry run: nothing was sent. After the user confirms this plan, run again with --yes and ${CONFIRM_ENV}=1.`)
            return 0
        }

        const staged = stageItem(paths, validated)
        const session = await steam.connect({ appId: meta.appId, env })
        try {
            const before = await session.getItem(publishedFileId)
            if (!before) throw new CommandError(`Steam returned no item ${publishedFileId}; nothing was sent`)
            const me = session.whoami()
            assertOwned(before, { steamId64: me.steamId64, appId: meta.appId })
            const agreement = await sendLanguages(session, {
                itemId: publishedFileId,
                appId: meta.appId,
                validated,
                staged,
                visibility,
                tags: meta.tags,
                changeNote: validated.changeNote,
                previewFile: validated.previewFile,
                out,
            })
            const after = await session.getItem(publishedFileId)
            if (!after) throw new CommandError(`Steam returned no item ${publishedFileId} after the update`)
            if (agreement) throw new CommandError(agreementMessage(publishedFileId, itemUrl(publishedFileId)))
            out.result(
                { publishedFileId, url: after.url, title: after.title, visibility: after.visibility },
                [`updated ${after.url}`, `read back: title "${after.title}", visibility ${after.visibility}`],
            )
        } finally {
            session.shutdown()
        }
        return 0
    },
}
