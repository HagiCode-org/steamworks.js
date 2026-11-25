// swjs check: validates an item folder offline and reports every problem. Sends nothing to Steam.
import { readItemFile, validateItem } from '../item.mjs'

export default {
    name: 'check',
    usage: 'check <item-dir> [--json]',
    summary: 'Validate an item folder offline and report every problem. Exit 0 when nothing is wrong, 1 otherwise. Sends nothing.',
    options: { json: { type: 'boolean', help: 'print one JSON document on standard output' } },
    min: 1,
    max: 1,
    async run({ positionals, out }) {
        const { meta, paths } = readItemFile(positionals[0])
        const v = validateItem(meta, paths)
        const report = {
            ok: v.errors.length === 0,
            errors: v.errors,
            warnings: v.warnings,
            languages: v.languages.map((l) => l.code),
            skipped: v.skipped,
            contentFiles: v.files.length,
        }
        const lines = []
        if (report.ok) lines.push(`ok: ${v.files.length} content file(s); languages ${report.languages.join(', ')}`)
        for (const w of v.warnings) lines.push(`warning: ${w}`)
        for (const s of v.skipped) lines.push(`skip: ${s} (not english or schinese; not uploaded)`)
        for (const e of v.errors) lines.push(`problem: ${e}`)
        out.result(report, lines)
        return report.ok ? 0 : 1
    },
}
