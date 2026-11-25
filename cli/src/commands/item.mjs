// swjs item <id>: one Workshop item as Steam lists it. Read-only.
import { CommandError, UsageError } from '../errors.mjs'
import { integerOption } from '../args.mjs'

export default {
    name: 'item',
    usage: 'item <id> --app-id N [--json]',
    summary: 'Show one Workshop item: title, owner, visibility, tags, URL. Read-only.',
    options: {
        'app-id': { type: 'string', help: 'the AppID of the game the item belongs to (required)' },
        json: { type: 'boolean', help: 'print one JSON document on standard output' },
    },
    min: 1,
    max: 1,
    async run({ values, positionals, out, env, steam }) {
        const id = positionals[0]
        if (!/^\d+$/.test(id) || id === '0') throw new UsageError(`swjs item: the id must be a Workshop item id, got "${id}"`)
        const appId = integerOption(values, 'app-id', { commandName: 'item' })
        if (appId === undefined) throw new UsageError('swjs item: --app-id is required')
        const session = await steam.connect({ appId, env })
        try {
            const item = await session.getItem(id)
            if (!item) throw new CommandError(`Steam returned no item ${id}`)
            const lines = [
                `"${item.title}"`,
                `owner ${item.owner}, visibility ${item.visibility}, app ${item.consumerAppId}`,
                `tags: ${item.tags.join(', ') || '(none)'}`,
                `url: ${item.url}`,
            ]
            out.result(item, values.json ? [] : lines)
            return 0
        } finally {
            session.shutdown()
        }
    },
}
