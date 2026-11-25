// swjs list: one page of Workshop items for an AppID, optionally only the signed-in user's own items, a tag or search text.
import { UsageError } from '../errors.mjs'
import { integerOption } from '../args.mjs'

export default {
    name: 'list',
    usage: 'list --app-id N [--mine] [--tag TAG] [--search TEXT] [--page P] [--json]',
    summary: 'List one page of Workshop items for an AppID. Read-only.',
    options: {
        'app-id': { type: 'string', help: 'the AppID of the game (required)' },
        mine: { type: 'boolean', help: 'only the signed-in account\'s published items' },
        tag: { type: 'string', help: 'only items carrying this tag' },
        search: { type: 'string', help: 'text to search for in titles and descriptions' },
        page: { type: 'string', help: 'the page to read (default: 1)' },
        json: { type: 'boolean', help: 'print one JSON document on standard output' },
    },
    min: 0,
    max: 0,
    async run({ values, out, env, steam }) {
        const appId = integerOption(values, 'app-id', { commandName: 'list' })
        if (appId === undefined) throw new UsageError('swjs list: --app-id is required')
        const page = integerOption(values, 'page', { commandName: 'list' }) ?? 1
        const session = await steam.connect({ appId, env })
        try {
            const result = await session.queryItems({ appId, page, mine: Boolean(values.mine), search: values.search, tag: values.tag })
            const report = { appId, page, totalResults: result.totalResults, returnedResults: result.returnedResults, items: result.items }
            const lines = [`page ${page}: ${result.returnedResults} of ${result.totalResults} item(s)`]
            for (const item of result.items) lines.push(`${item.publishedFileId}  ${item.visibility}  ${item.title}`)
            out.result(report, values.json ? [] : lines)
            return 0
        } finally {
            session.shutdown()
        }
    },
}
