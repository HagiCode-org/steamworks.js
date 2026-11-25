// Helpers shared by the command modules. Pure checks plus one function that sends an item's languages to Steam.
import { CommandError } from '../errors.mjs'
import { VISIBILITY, hasOwnVisibility } from '../item.mjs'

export function visibilityValue(name) {
    if (!hasOwnVisibility(name)) {
        throw new CommandError(`--visibility must be one of ${Object.keys(VISIBILITY).join(', ')}`)
    }
    return VISIBILITY[name]
}

export function requirePublished(meta, paths, commandName) {
    if (meta.publishedFileId === '0') {
        throw new CommandError(`${paths.file} has publishedFileId "0": the item is not on Steam yet. Run \`swjs publish\` first (${commandName} changes an existing item).`)
    }
    return meta.publishedFileId
}

// Refuses an item this account does not own or that belongs to another app. Nothing has been sent when this throws.
export function assertOwned(item, { steamId64, appId }) {
    if (item.owner !== steamId64) {
        throw new CommandError(`item ${item.publishedFileId} is owned by ${item.owner ?? 'someone else'}, not by the logged-in account ${steamId64}; nothing was sent`)
    }
    if (String(item.consumerAppId) !== String(appId)) {
        throw new CommandError(`item ${item.publishedFileId} belongs to app ${item.consumerAppId}, not ${appId}; nothing was sent`)
    }
}

export function notReady(errors) {
    return `not ready for the Workshop:\n  - ${errors.join('\n  - ')}`
}

export function agreementMessage(itemId, url) {
    return `Steam reports that the Workshop legal agreement is not accepted for this account. The item ${itemId} stays hidden until `
        + `the agreement is accepted on the Steam website with this account: ${url}`
}
