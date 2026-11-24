// Offline checks for the inventory namespace: no Steam client, no AppID, no Steam call is made. Confirms that the native
// module for this platform exports every inventory function and the property update class with the expected types.
const assert = require('node:assert/strict')

// Same loader as offline-smoke-test.js: load this platform's binding directly, so the namespace is checked without init().
const bindingPaths = {
    'win32-x64': '../dist/win64/steamworksjs.win32-x64-msvc.node',
    'linux-x64': '../dist/linux64/steamworksjs.linux-x64-gnu.node',
    'darwin-x64': '../dist/osx/steamworksjs.darwin-x64.node',
    'darwin-arm64': '../dist/osx/steamworksjs.darwin-arm64.node',
}
const nativeBinding = require(bindingPaths[`${process.platform}-${process.arch}`])
const inventory = nativeBinding.inventory

assert.equal(typeof inventory, 'object', 'inventory namespace is exported')

const functions = [
    'getAllItems',
    'getItemsById',
    'serializeItems',
    'deserializeResult',
    'generateItems',
    'grantPromoItems',
    'addPromoItem',
    'addPromoItems',
    'consumeItem',
    'exchangeItems',
    'transferItemQuantity',
    'sendItemDropHeartbeat',
    'triggerItemDrop',
    'tradeItems',
    'loadItemDefinitions',
    'getItemDefinitionIds',
    'getItemDefinitions',
    'getItemDefinitionProperty',
    'requestEligiblePromoItems',
    'startPurchase',
    'requestPrices',
    'getNumItemsWithPrices',
    'getItemsWithPrices',
    'getItemPrice',
    'startUpdateProperties',
    'inspectItem',
]
for (const name of functions) {
    assert.equal(typeof inventory[name], 'function', `inventory.${name} is exported`)
}

// The property update builder is a class; its methods live on the prototype.
assert.equal(typeof inventory.InventoryPropertyUpdate, 'function', 'inventory.InventoryPropertyUpdate is exported')
for (const name of ['setString', 'setBool', 'setInt64', 'setFloat', 'remove', 'submit']) {
    assert.equal(
        typeof inventory.InventoryPropertyUpdate.prototype[name],
        'function',
        `InventoryPropertyUpdate.prototype.${name} is exported`,
    )
}

console.log(
    `offline inventory exports passed (${functions.length} functions and the InventoryPropertyUpdate class are present)`,
)
