// Offline checks: no Steam client and no AppID needed. Confirms that the native module for this platform loads and that
// the package entry point exposes the functions its typings declare. The Steam calls themselves need a running client
// (see the other scripts in this directory).
const assert = require('node:assert/strict')
const steamworks = require('../index.js')

assert.equal(typeof steamworks.init, 'function', 'init is exported')
assert.equal(typeof steamworks.shutdown, 'function', 'shutdown is exported')
assert.equal(typeof steamworks.isConnected, 'function', 'isConnected is exported')
assert.equal(typeof steamworks.restartAppIfNecessary, 'function', 'restartAppIfNecessary is exported')

// The workshop namespace lives on the native binding; init() only spreads it into the client it returns.
// Load this platform's binding directly, so the dependency functions are checked without calling init.
const bindingPaths = {
    'win32-x64': '../dist/win64/steamworksjs.win32-x64-msvc.node',
    'linux-x64': '../dist/linux64/steamworksjs.linux-x64-gnu.node',
    'darwin-x64': '../dist/osx/steamworksjs.darwin-x64.node',
    'darwin-arm64': '../dist/osx/steamworksjs.darwin-arm64.node',
}
const nativeBinding = require(bindingPaths[`${process.platform}-${process.arch}`])

assert.equal(typeof nativeBinding.workshop.addDependency, 'function', 'workshop.addDependency is exported')
assert.equal(typeof nativeBinding.workshop.removeDependency, 'function', 'workshop.removeDependency is exported')

console.log('offline smoke test passed (workshop.addDependency and workshop.removeDependency are exported)')
