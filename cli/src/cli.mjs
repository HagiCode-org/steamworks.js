// The router: global --help and --version, the command table, per-command --help, usage errors and exit codes.
// main() takes argv and an io object, so tests drive the whole CLI with a fake Steam client and captured output.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCommandArgs, commandHelp } from './args.mjs'
import { commands } from './commands/index.mjs'
import { CommandError, EXIT_FAILURE, EXIT_OK, UsageError } from './errors.mjs'
import { createOutput } from './output.mjs'
import { defaultSteam } from './steam.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export function packageVersion() {
    return JSON.parse(readFileSync(path.join(HERE, '..', 'package.json'), 'utf8')).version
}

function programHelp() {
    const width = Math.max(...commands.map((c) => c.name.length)) + 2
    const lines = [
        'swjs: HagiCode Steamworks JS CLI. Publish and inspect Steam Workshop items through the running, logged-in Steam client.',
        '',
        'Usage: swjs <command> [options]',
        '',
        'Commands:',
        ...commands.map((c) => `  ${c.name.padEnd(width)}${c.summary}`),
        '',
        'Global options:',
        '  --help, -h       show help (also after a command name: swjs publish --help)',
        '  --version, -v    print the package version',
        '',
        `Writes to Steam are dry runs unless --yes is given, and then also need ${'WORKSHOP_WRITE_CONFIRMED=1'} in the environment.`,
        'Exit codes: 0 success, 1 failure or refused write, 2 usage error.',
    ]
    return `${lines.join('\n')}\n`
}

async function dispatch(argv, io) {
    const [first] = argv
    if (argv.length === 0 || first === '--help' || first === '-h') {
        io.stdout.write(programHelp())
        return EXIT_OK
    }
    if (first === '--version' || first === '-v') {
        io.stdout.write(`${packageVersion()}\n`)
        return EXIT_OK
    }
    const command = commands.find((c) => c.name === first)
    if (!command) {
        throw new UsageError(`unknown command "${first}". Available commands: ${commands.map((c) => c.name).join(', ')}. Run swjs --help.`)
    }
    const rest = argv.slice(1)
    if (rest.includes('--help') || rest.includes('-h')) {
        io.stdout.write(commandHelp(command))
        return EXIT_OK
    }
    const { values, positionals } = parseCommandArgs(rest, command)
    const out = createOutput({ stdout: io.stdout, stderr: io.stderr, json: Boolean(values.json) })
    const code = await command.run({ values, positionals, out, env: io.env, steam: io.steam, stdout: io.stdout, stderr: io.stderr })
    return code ?? EXIT_OK
}

// Runs one CLI invocation and returns its exit code. io: { stdout, stderr, env, steam } (all optional).
export async function main(argv, io = {}) {
    const context = {
        stdout: io.stdout ?? process.stdout,
        stderr: io.stderr ?? process.stderr,
        env: io.env ?? process.env,
        steam: io.steam ?? defaultSteam,
    }
    try {
        return await dispatch(argv, context)
    } catch (error) {
        if (error instanceof UsageError || error instanceof CommandError) {
            context.stderr.write(`error: ${error.message}\n`)
            return error.exitCode
        }
        context.stderr.write(`error: ${error?.message ?? error}\n`)
        return EXIT_FAILURE
    }
}
