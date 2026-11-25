// swjs pack: runs the same validation as check, then stages the included files and translations.json in workshop/.build/.
import { CommandError } from '../errors.mjs'
import { readItemFile, stageItem, validateItem } from '../item.mjs'
import { notReady } from './common.mjs'

export default {
    name: 'pack',
    usage: 'pack <item-dir>',
    summary: 'Validate the item, then stage the content in workshop/.build/ (regenerated each run). Sends nothing.',
    options: {},
    min: 1,
    max: 1,
    async run({ positionals, out }) {
        const { meta, paths } = readItemFile(positionals[0])
        const v = validateItem(meta, paths)
        if (v.errors.length > 0) throw new CommandError(notReady(v.errors))
        const staged = stageItem(paths, v)
        out.say(`staged ${staged.files} content file(s) in ${staged.contentDir}`)
        out.say(`wrote ${staged.translations}`)
        return 0
    },
}
