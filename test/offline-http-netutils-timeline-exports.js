// Offline checks for the HTTP, networking-utils and timeline functions added in this slice. No Steam client, AppID or
// account is needed. The functions are checked for export, and for the errors they give before init() (no client is
// running in this process, so every Steam call must refuse cleanly instead of crashing).
const assert = require('node:assert/strict')

const bindingPaths = {
    'win32-x64': '../dist/win64/steamworksjs.win32-x64-msvc.node',
    'linux-x64': '../dist/linux64/steamworksjs.linux-x64-gnu.node',
    'darwin-x64': '../dist/osx/steamworksjs.darwin-x64.node',
    'darwin-arm64': '../dist/osx/steamworksjs.darwin-arm64.node',
}
const nativeBinding = require(bindingPaths[`${process.platform}-${process.arch}`])

// http namespace
for (const name of ['request', 'createCookieContainer']) {
    assert.equal(typeof nativeBinding.http[name], 'function', `http.${name} is exported`)
}
assert.equal(typeof nativeBinding.http.CookieContainer, 'function', 'http.CookieContainer is exported')
assert.equal(typeof nativeBinding.http.CookieContainer.prototype.setCookie, 'function', 'http.CookieContainer#setCookie is exported')

// networkingUtils namespace: functions added in this slice (the relay functions are checked by the smoke test)
for (const name of [
    'getLocalPingLocation',
    'parsePingLocation',
    'estimatePingBetweenLocations',
    'estimatePingFromLocalHost',
    'checkPingDataUpToDate',
    'getPingToDataCenter',
    'getDirectPingToPop',
    'getPopCount',
    'getPops',
    'getLocalTimestamp',
    'isFakeIpv4',
    'getIpv4FakeIpType',
    'getRealIdentityForFakeIp',
    'ipAddrToString',
    'parseIpAddr',
    'getIpAddrFakeIpType',
    'identityToString',
    'parseIdentity',
    'setGlobalConfigValueInt32',
    'setGlobalConfigValueFloat',
    'setGlobalConfigValueString',
    'setConnectionConfigValueInt32',
    'setConnectionConfigValueFloat',
    'setConnectionConfigValueString',
    'getConfigValue',
    'getConfigValueInfo',
    'iterateGenericEditableConfigValues',
]) {
    assert.equal(typeof nativeBinding.networkingUtils[name], 'function', `networkingUtils.${name} is exported`)
}

// timeline namespace: the 14 functions added in this slice
for (const name of [
    'addInstantaneousTimelineEvent',
    'startRangeTimelineEvent',
    'updateRangeTimelineEvent',
    'endRangeTimelineEvent',
    'removeTimelineEvent',
    'doesEventRecordingExist',
    'startGamePhase',
    'endGamePhase',
    'setGamePhaseId',
    'doesGamePhaseRecordingExist',
    'addGamePhaseTag',
    'setGamePhaseAttribute',
    'openOverlayToGamePhase',
    'openOverlayToTimelineEvent',
]) {
    assert.equal(typeof nativeBinding.timeline[name], 'function', `timeline.${name} is exported`)
}

// Before init(): every call that needs the Steam client throws (or rejects, for async calls) with the same message.
const notInitialized = /Steam client is not initialized; call init\(\) first/
assert.throws(() => nativeBinding.networkingUtils.getPopCount(), notInitialized, 'getPopCount refuses before init()')
assert.throws(() => nativeBinding.networkingUtils.getLocalTimestamp(), notInitialized, 'getLocalTimestamp refuses before init()')
assert.throws(() => nativeBinding.networkingUtils.parseIdentity('steamid:1'), notInitialized, 'parseIdentity refuses before init()')
assert.throws(() => nativeBinding.timeline.startGamePhase(), notInitialized, 'startGamePhase refuses before init()')
assert.throws(() => nativeBinding.timeline.doesEventRecordingExist(1n), notInitialized, 'doesEventRecordingExist refuses before init()')

// Input checks run before the client is needed, so they throw the same way with or without init().
assert.throws(
    () => nativeBinding.timeline.addInstantaneousTimelineEvent('ti\0tle', 'd', 'icon', 0, 0, 0),
    /NUL character/,
    'a NUL in a timeline title is refused',
)
assert.throws(
    () => nativeBinding.timeline.setGamePhaseId('x'.repeat(64)),
    /at most 63 bytes/,
    'a phase ID longer than 63 bytes is refused',
)
assert.throws(
    () => nativeBinding.timeline.endRangeTimelineEvent(-1n, 0),
    /timeline event handle/,
    'a negative event handle is refused',
)
assert.throws(
    () => nativeBinding.networkingUtils.setGlobalConfigValueString(0, 'a\0b'),
    /must not contain a NUL character|not a networking config value/,
    'a NUL in a config string is refused',
)

async function main() {
    await assert.rejects(
        nativeBinding.http.request({ method: 'GET', url: 'https://example.com/' }),
        notInitialized,
        'http.request rejects before init()',
    )
    console.log('offline http, networkingUtils and timeline exports: ok')
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
