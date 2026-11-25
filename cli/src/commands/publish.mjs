// swjs publish: creates a new Workshop item. Only an item whose publishedFileId is "0" can be published; the id Steam
// returns is written to workshop.json at once, so a later failure never leaves an unrecorded item behind.
import { CommandError } from '../errors.mjs'
import { writeMode } from '../confirm.mjs'
import { CONFIRM_ENV, buildPlan, planLines, readItemFile, recordPublishedFileId, stageItem, validateItem } from '../item.mjs'
import { itemUrl } from '../steam.mjs'
import { agreementMessage, notReady, visibilityValue } from './common.mjs'
import { sendLanguages } from './upload.mjs'

export default {
    name: 'publish',
    usage: 'publish <item-dir> [--visibility V] [--yes]',
    summary: 'Create a new Workshop item from the item folder. Without --yes it prints the plan and sends nothing.',
    options: {
        visibility: { type: 'string', help: 'public, friends, hidden or unlisted (default: visibility in workshop.json, else public)' },
        yes: { type: 'boolean', help: `send to Steam; also needs ${CONFIRM_ENV}=1 in the environment` },
    },
    notes: [
        `Writes need --yes and ${CONFIRM_ENV}=1. The caller sets the variable only after the user confirms the printed plan.`,
        'Steam must be running and logged in as the account that owns the app.',
    ],
    min: 1,
    max: 1,
    async run({ values, positionals, out, env, steam }) {
        // The guard runs first: a refused --yes reads nothing and stages nothing.
        const mode = writeMode(values, env)
        const { meta, paths } = readItemFile(positionals[0])
        if (meta.publishedFileId !== '0') {
            throw new CommandError(`${paths.file} already holds publishedFileId ${meta.publishedFileId}: the item is published. `
                + `Use \`swjs update ${positionals[0]}\`; publish creates an item only from "0".`)
        }
        const visibility = values.visibility ?? meta.visibility ?? 'public'
        visibilityValue(visibility)
        const validated = validateItem(meta, paths)
        if (validated.errors.length > 0) throw new CommandError(notReady(validated.errors))
        const plan = buildPlan(meta, paths, validated, { visibility, changeNote: validated.changeNote })
        for (const line of planLines(plan)) out.say(line)
        if (!mode.write) {
            out.say(`dry run: nothing was sent. After the user confirms this plan, run again with --yes and ${CONFIRM_ENV}=1.`)
            return 0
        }

        const staged = stageItem(paths, validated)
        const session = await steam.connect({ appId: meta.appId, env })
        let itemId = null
        let agreement = false
        try {
            const created = await session.createItem(meta.appId)
            itemId = created.itemId
            recordPublishedFileId(paths, itemId)
            out.say(`created item ${itemId}; publishedFileId recorded in workshop.json`)
            const sentAgreement = await sendLanguages(session, {
                itemId,
                appId: meta.appId,
                validated,
                staged,
                visibility,
                tags: meta.tags,
                changeNote: validated.changeNote,
                previewFile: validated.previewFile,
                out,
            })
            agreement = created.agreement || sentAgreement
        } catch (error) {
            if (itemId === null) throw error
            throw new CommandError(`${error.message}. Item ${itemId} exists on Steam and its id is recorded: run \`swjs update ${positionals[0]}\`, not publish.`)
        } finally {
            session.shutdown()
        }
        if (agreement) throw new CommandError(agreementMessage(itemId, itemUrl(itemId)))
        out.result({ publishedFileId: itemId, url: itemUrl(itemId), visibility }, [`published ${itemUrl(itemId)}`])
        return 0
    },
}
