// Argument parsing for one command, on top of node:util parseArgs. Unknown options and wrong positional counts are usage
// errors (exit 2), never silently ignored. A command declares its options as
//   { name: { type: 'string' | 'boolean', short?, help } }
// and `--help`/`-h` is added for every command by the router.
import { parseArgs } from 'node:util'
import { UsageError } from './errors.mjs'

export function parseCommandArgs(argv, command) {
    const options = { help: { type: 'boolean', short: 'h' } }
    for (const [name, def] of Object.entries(command.options ?? {})) {
        options[name] = { type: def.type, ...(def.short ? { short: def.short } : {}) }
    }
    let parsed
    try {
        parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true })
    } catch (error) {
        throw new UsageError(`swjs ${command.name}: ${error.message} (see swjs ${command.name} --help)`)
    }
    const { values, positionals } = parsed
    const min = command.min ?? 0
    const max = command.max ?? 0
    if (positionals.length < min || positionals.length > max) {
        const expected = max === Infinity ? `at least ${min}` : min === max ? `${min}` : `${min} to ${max}`
        throw new UsageError(`swjs ${command.name}: expected ${expected} argument(s), got ${positionals.length} (see swjs ${command.name} --help)`)
    }
    return { values, positionals }
}

// A whole-number option. Absent stays undefined; anything that is not a whole number at or above `min` is a usage error.
export function integerOption(values, name, { min = 1, commandName }) {
    const raw = values[name]
    if (raw === undefined) return undefined
    if (!/^\d+$/.test(raw) || Number(raw) < min) {
        throw new UsageError(`swjs ${commandName}: --${name} must be a whole number of at least ${min}, got "${raw}"`)
    }
    return Number(raw)
}

// The help text of one command: usage line, summary, and one line per option.
export function commandHelp(command) {
    const lines = [`Usage: swjs ${command.usage}`, '', command.summary, '']
    const entries = [...Object.entries(command.options ?? {}), ['help', { type: 'boolean', help: 'show this help and exit' }]]
    if (entries.length > 0) {
        lines.push('Options:')
        for (const [name, def] of entries) {
            const flag = def.type === 'string' ? `--${name} <value>` : `--${name}`
            lines.push(`  ${flag.padEnd(24)}${def.help ?? ''}`)
        }
    }
    if (command.notes) lines.push('', ...command.notes)
    return `${lines.join('\n')}\n`
}
