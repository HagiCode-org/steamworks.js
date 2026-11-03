// Runs before `npm pack` and `npm publish` (package.json "prepack"). Stops a publish that would ship without a native
// binary for one of the supported platforms, or with the placeholder version committed in package.json.
//
// Local dry runs can relax the checks with STEAMWORKS_PACK_CHECK=loose (problems become warnings). CI never sets it.
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const loose = process.env.STEAMWORKS_PACK_CHECK === 'loose'

const required = [
    'index.js',
    'index.d.ts',
    'client.d.ts',
    'callbacks.d.ts',
    'README.md',
    'LICENSE',
    // one native module per supported platform, and the Steam redistributable it loads
    'dist/win64/steamworksjs.win32-x64-msvc.node',
    'dist/win64/steam_api64.dll',
    'dist/linux64/steamworksjs.linux-x64-gnu.node',
    'dist/linux64/libsteam_api.so',
    'dist/osx/steamworksjs.darwin-x64.node',
    'dist/osx/steamworksjs.darwin-arm64.node',
    'dist/osx/libsteam_api.dylib',
]

const problems = required
    .filter((file) => !fs.existsSync(path.join(root, file)))
    .map((file) => `missing ${file}`)

if (pkg.version === '0.0.1') {
    problems.push('package.json has the placeholder version 0.0.1; CI sets the real version before publishing (npm version <x>)')
}

if (problems.length === 0) {
    console.log(`check-package: ${required.length} files present, version ${pkg.version}`)
    process.exit(0)
}

for (const problem of problems) console.error(`check-package: ${loose ? 'warning' : 'error'}: ${problem}`)
process.exit(loose ? 0 : 1)
