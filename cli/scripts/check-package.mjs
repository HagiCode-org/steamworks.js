// The `prepack` guard of the CLI package. Runs before `npm pack` and `npm publish` (package.json "prepack"), and stops a
// publish that would ship the placeholder version or a loose steamworks.js dependency. CI sets the real version with
// `npm version` and pins the dependency with `npm pkg set` before it publishes.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLACEHOLDER_VERSION = '0.0.1'
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/
const REQUIRED_FILES = ['bin/swjs.mjs', 'src/cli.mjs', 'README.md', 'LICENSE']

// Returns the list of problems with the manifest and the files in `root`. An empty list means the package may be published.
export function checkManifest(pkg, root) {
    const problems = []
    if (pkg.version === PLACEHOLDER_VERSION) {
        problems.push(`package.json has the placeholder version ${PLACEHOLDER_VERSION}; CI sets the real version before publishing`)
    } else if (!SEMVER.test(String(pkg.version))) {
        problems.push(`package.json version "${pkg.version}" is not a x.y.z version`)
    }
    const dependency = pkg.dependencies?.['@hagicode/steamworks.js']
    if (dependency === undefined) {
        problems.push('the dependency @hagicode/steamworks.js is missing')
    } else if (!SEMVER.test(dependency)) {
        problems.push(`the dependency @hagicode/steamworks.js is "${dependency}"; it must be pinned to the native version (x.y.z)`)
    }
    for (const file of REQUIRED_FILES) {
        if (!existsSync(path.join(root, file))) problems.push(`missing ${file}`)
    }
    return problems
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
    const problems = checkManifest(pkg, root)
    if (problems.length === 0) {
        console.log(`check-package: ${pkg.name} ${pkg.version}, dependency @hagicode/steamworks.js ${pkg.dependencies['@hagicode/steamworks.js']}`)
        process.exit(0)
    }
    for (const problem of problems) console.error(`check-package: error: ${problem}`)
    process.exit(1)
}
