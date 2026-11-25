// swjs doctor: checks Node, the steamworks.js binding, the Steam client and (with --app-id) the account's ownership of the
// app. Every check is printed even when an earlier one fails. Exits 1 when a required part is missing.
import { integerOption } from '../args.mjs'
import { CommandError } from '../errors.mjs'

const MIN_NODE_MAJOR = 18

export default {
    name: 'doctor',
    usage: 'doctor [--app-id N] [--json]',
    summary: 'Check Node, the steamworks.js binding, the Steam client and the AppID. Exit 1 when a required check fails.',
    options: {
        'app-id': { type: 'string', help: 'also check that the account owns this app' },
        json: { type: 'boolean', help: 'print one JSON document on standard output' },
    },
    min: 0,
    max: 0,
    async run({ values, out, env, steam }) {
        const appId = integerOption(values, 'app-id', { commandName: 'doctor' })
        const checks = []
        const major = Number(process.versions.node.split('.')[0])
        checks.push(major >= MIN_NODE_MAJOR
            ? { name: 'node', status: 'ok', detail: `Node ${process.versions.node} (>= ${MIN_NODE_MAJOR})` }
            : { name: 'node', status: 'fail', detail: `Node ${process.versions.node} is older than ${MIN_NODE_MAJOR}` })

        let bindingOk = false
        try {
            const { folder, version } = steam.loadBinding(env)
            bindingOk = true
            checks.push({ name: 'binding', status: 'ok', detail: `steamworks.js ${version} from ${folder}` })
        } catch (error) {
            checks.push({ name: 'binding', status: 'fail', detail: error.message })
        }

        if (!bindingOk) {
            checks.push({ name: 'steam', status: 'skip', detail: 'not checked: the binding did not load' })
            checks.push({ name: 'app', status: 'skip', detail: appId === undefined ? 'not given (pass --app-id)' : 'not checked: Steam is not reachable' })
        } else {
            let session = null
            try {
                session = await steam.connect({ appId, env, checkOwnership: false })
                const who = session.whoami()
                checks.push({ name: 'steam', status: 'ok', detail: `Steam client reachable as ${who.name} (${who.steamId64})` })
                if (appId === undefined) {
                    checks.push({ name: 'app', status: 'skip', detail: 'not given (pass --app-id to check ownership)' })
                } else if (session.ownsApp(appId)) {
                    checks.push({ name: 'app', status: 'ok', detail: `this account owns app ${appId}` })
                } else {
                    checks.push({ name: 'app', status: 'fail', detail: `this account does not own app ${appId}` })
                }
            } catch (error) {
                const reason = error instanceof CommandError ? error.message : `Steam client unreachable: ${error.message}`
                checks.push({ name: 'steam', status: 'fail', detail: reason })
                checks.push({ name: 'app', status: 'skip', detail: appId === undefined ? 'not given (pass --app-id)' : 'not checked: Steam is not reachable' })
            } finally {
                if (session) session.shutdown()
            }
        }

        const failed = checks.some((c) => c.status === 'fail')
        const lines = checks.map((c) => `[${c.status === 'ok' ? 'ok' : c.status === 'fail' ? 'FAIL' : 'skip'}] ${c.name}: ${c.detail}`)
        out.result({ ok: !failed, checks }, values.json ? [] : lines)
        return failed ? 1 : 0
    },
}
