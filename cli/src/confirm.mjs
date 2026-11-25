// The write guard. Every command that sends something to Steam, or changes the item's files in a way Steam would see,
// runs this first. Without --yes it is a dry run: the plan is printed and nothing is sent. With --yes it still refuses
// unless the caller set WORKSHOP_WRITE_CONFIRMED=1, so an accidental --yes cannot write.
import { CommandError } from './errors.mjs'
import { CONFIRM_ENV } from './item.mjs'

export function writeMode({ yes = false } = {}, env = process.env) {
    if (!yes) return { write: false }
    if (env[CONFIRM_ENV] !== '1') {
        throw new CommandError(
            `--yes needs ${CONFIRM_ENV}=1 in the environment. The caller sets it only after the dry run was shown and the user `
            + 'confirmed that exact plan. Nothing was sent.',
        )
    }
    return { write: true }
}
