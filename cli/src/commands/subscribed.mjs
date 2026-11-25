// swjs subscribed: the Workshop items the signed-in user is subscribed to, with their state and install status. Read-only:
// it never subscribes, unsubscribes or downloads.
import { integerOption } from '../args.mjs'

export default {
    name: 'subscribed',
    usage: 'subscribed [--app-id N] [--json]',
    summary: 'List the Workshop items the signed-in user is subscribed to. Read-only.',
    options: {
        'app-id': { type: 'string', help: 'the AppID to start the Steam session for (optional; the client picks one when omitted)' },
        json: { type: 'boolean', help: 'print one JSON document on standard output' },
    },
    min: 0,
    max: 0,
    async run({ values, out, env, steam }) {
        const appId = integerOption(values, 'app-id', { commandName: 'subscribed' })
        const session = await steam.connect({ appId, env, checkOwnership: appId !== undefined })
        try {
            const items = await session.subscribed()
            const lines = [`${items.length} subscribed item(s)`]
            for (const item of items) {
                lines.push(`${item.publishedFileId}  state ${item.state}  ${item.installed ? 'installed' : 'not installed'}  ${item.title ?? '(title unknown)'}`)
            }
            out.result({ count: items.length, items }, values.json ? [] : lines)
            return 0
        } finally {
            session.shutdown()
        }
    },
}
