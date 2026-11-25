// swjs status: the stored identity of an item. --remote also reads the item from Steam. Local output never contacts Steam.
import { CommandError } from '../errors.mjs'
import { readItemFile } from '../item.mjs'

export default {
    name: 'status',
    usage: 'status <item-dir> [--remote] [--json]',
    summary: 'Show the stored identity of an item: AppID, publishedFileId, languages, tags. --remote adds what Steam lists.',
    options: {
        remote: { type: 'boolean', help: 'also read the item from Steam (needs a running, logged-in Steam client)' },
        json: { type: 'boolean', help: 'print one JSON document on standard output' },
    },
    min: 1,
    max: 1,
    async run({ values, positionals, out, env, steam }) {
        const { meta, paths } = readItemFile(positionals[0])
        const local = {
            appId: meta.appId,
            publishedFileId: meta.publishedFileId,
            visibility: meta.visibility ?? 'public',
            primaryLanguage: meta.primaryLanguage ?? null,
            languages: Object.keys(meta.languages ?? {}),
            tags: meta.tags ?? [],
            contentPath: meta.contentPath ?? null,
            previewPath: meta.previewPath ?? 'preview.png',
            file: paths.file,
        }
        const lines = [
            `app ${local.appId}, item ${local.publishedFileId === '0' ? '(not published yet)' : local.publishedFileId}, visibility ${local.visibility}`,
            `languages: ${local.languages.join(', ') || '(none)'}; tags: ${local.tags.join(', ') || '(none)'}`,
        ]
        const report = { local, remote: null }
        if (values.remote && meta.publishedFileId !== '0') {
            const session = await steam.connect({ appId: meta.appId, env })
            try {
                const item = await session.getItem(meta.publishedFileId)
                if (!item) throw new CommandError(`Steam returned no item ${meta.publishedFileId}`)
                report.remote = {
                    title: item.title,
                    owner: item.owner,
                    visibility: item.visibility,
                    previewUrl: item.previewUrl,
                    timeUpdated: item.timeUpdated,
                    url: item.url,
                }
                lines.push(`Steam: "${item.title}", visibility ${item.visibility}, owner ${item.owner}`, `item: ${item.url}`)
            } finally {
                session.shutdown()
            }
        } else if (values.remote) {
            lines.push('Steam: not read (publishedFileId is "0")')
        }
        out.result(report, values.json ? [] : lines)
        return 0
    },
}
