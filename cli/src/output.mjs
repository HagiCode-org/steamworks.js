// Output printers. Text goes to standard output by default. With --json, standard output holds exactly one JSON document
// and every other line (progress, plans, warnings) goes to standard error, so a script can parse stdout directly.

export function createOutput({ stdout, stderr, json = false }) {
    const bigintSafe = (_key, value) => (typeof value === 'bigint' ? value.toString() : value)
    return {
        json,
        // A line of narration: a plan, progress, a note. Standard error in JSON mode.
        say(line = '') {
            (json ? stderr : stdout).write(`${line}\n`)
        },
        // The result of a command. JSON mode prints the document; text mode prints the given lines.
        result(value, lines = []) {
            if (json) {
                stdout.write(`${JSON.stringify(value, bigintSafe, 2)}\n`)
                return
            }
            for (const line of lines) stdout.write(`${line}\n`)
        },
        warn(line) {
            stderr.write(`warning: ${line}\n`)
        },
        error(line) {
            stderr.write(`error: ${line}\n`)
        },
    }
}
