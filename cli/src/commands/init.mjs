// swjs init: creates workshop/ for an item. It never overwrites: if any file it would create already exists, nothing is written.
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { UsageError, CommandError } from '../errors.mjs'
import { integerOption } from '../args.mjs'
import { DEFAULT_LANGUAGES, itemPaths, normalizeLanguage } from '../item.mjs'

const DESCRIPTION_TEMPLATE = 'TODO: replace with the Steam BBCode description for this item (at most 8000 bytes).\n'
const GITIGNORE = '# Local build output of swjs pack and publish (regenerated on every run)\n.build/\n'

export default {
    name: 'init',
    usage: 'init <item-dir> --app-id <AppID> [--languages english,schinese]',
    summary: 'Create workshop/ with a template workshop.json, description files and a .gitignore. Never overwrites a file.',
    options: {
        'app-id': { type: 'string', help: 'the Steam AppID of the game (required)' },
        languages: { type: 'string', help: 'english, schinese or both (default: both)' },
    },
    min: 1,
    max: 1,
    async run({ values, positionals, out }) {
        const paths = itemPaths(positionals[0])
        const appId = integerOption(values, 'app-id', { commandName: 'init' })
        if (appId === undefined) throw new UsageError('swjs init: --app-id is required (the Steam AppID of the game)')
        const raw = values.languages ?? DEFAULT_LANGUAGES.join(',')
        const codes = []
        for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
            const code = normalizeLanguage(part)
            if (code === null) {
                throw new UsageError(`swjs init: --languages ${part}: only english and schinese are supported (en and zh-CN also work); other locales are never uploaded`)
            }
            if (codes.includes(code)) throw new UsageError(`swjs init: --languages lists ${code} twice`)
            codes.push(code)
        }
        if (codes.length === 0) throw new UsageError('swjs init: --languages needs english, schinese or both')
        if (!existsSync(paths.item) || !statSync(paths.item).isDirectory()) throw new CommandError(`${paths.item} is not a folder`)

        const descriptions = codes.map((code) => path.join(paths.metaDir, `description.${code}.txt`))
        const targets = [paths.file, path.join(paths.metaDir, '.gitignore'), ...descriptions]
        const existing = targets.filter((file) => existsSync(file))
        if (existing.length > 0) {
            throw new CommandError(`refusing to overwrite ${existing.join(', ')}: init never overwrites a file. Nothing was written.`)
        }

        mkdirSync(paths.metaDir, { recursive: true })
        const languages = {}
        codes.forEach((code, i) => {
            languages[code] = { title: 'TODO title', description: path.basename(descriptions[i]) }
            writeFileSync(descriptions[i], DESCRIPTION_TEMPLATE, { flag: 'wx' })
        })
        const meta = {
            schema: 1,
            appId,
            publishedFileId: '0',
            visibility: 'public',
            primaryLanguage: codes[0],
            languages,
            contentPath: 'TODO folder to upload, relative to workshop/',
            previewPath: 'preview.png',
            tags: [],
            changeNote: '',
        }
        writeFileSync(paths.file, `${JSON.stringify(meta, null, 2)}\n`, { flag: 'wx' })
        writeFileSync(path.join(paths.metaDir, '.gitignore'), GITIGNORE, { flag: 'wx' })
        out.say(`created ${paths.metaDir}/: workshop.json, description files for ${codes.join(', ')}, .gitignore`)
        out.say('next: set contentPath, write the titles and descriptions, add preview.png, set "tags" and changeNote, then run `swjs check`')
        return 0
    },
}
