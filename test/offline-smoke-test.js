// Offline checks: no Steam client and no AppID needed. Confirms that the native module for this platform loads and that
// the package entry point exposes the functions its typings declare. The Steam calls themselves need a running client
// (see the other scripts in this directory).
const assert = require('node:assert/strict')
const steamworks = require('../index.js')

assert.equal(typeof steamworks.init, 'function', 'init is exported')
assert.equal(typeof steamworks.shutdown, 'function', 'shutdown is exported')
assert.equal(typeof steamworks.isConnected, 'function', 'isConnected is exported')
assert.equal(typeof steamworks.restartAppIfNecessary, 'function', 'restartAppIfNecessary is exported')

console.log('offline smoke test passed')
