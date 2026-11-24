// Offline checks for the stats, achievement ranking, leaderboard, utils and apps additions. No Steam client and no AppID are
// needed: this loads the native module for this platform and checks that every added function is exported with the right type.
// The Steam calls themselves need a running client and are not run here.
const assert = require('node:assert/strict')

// Load this platform's binding directly, the same way test/offline-smoke-test.js does, so no init() call is made.
const bindingPaths = {
    'win32-x64': '../dist/win64/steamworksjs.win32-x64-msvc.node',
    'linux-x64': '../dist/linux64/steamworksjs.linux-x64-gnu.node',
    'darwin-x64': '../dist/osx/steamworksjs.darwin-x64.node',
    'darwin-arm64': '../dist/osx/steamworksjs.darwin-arm64.node',
}
const nativeBinding = require(bindingPaths[`${process.platform}-${process.arch}`])

// stats: user and global stats, average-rate stats and the current player count
for (const name of [
    'getUserInt',
    'getUserFloat',
    'updateAvgRateStat',
    'requestGlobalStats',
    'getGlobalInt',
    'getGlobalFloat',
    'getGlobalIntHistory',
    'getGlobalFloatHistory',
    'getNumberOfCurrentPlayers',
]) {
    assert.equal(typeof nativeBinding.stats[name], 'function', `stats.${name} is exported`)
}

// achievement: the global unlock ranking
assert.equal(typeof nativeBinding.achievement.getMostAchievedAchievements, 'function', 'achievement.getMostAchievedAchievements is exported')

// leaderboard: methods on the Leaderboard object
for (const method of ['attachUgc', 'downloadEntriesForUsers']) {
    assert.equal(typeof nativeBinding.leaderboard.Leaderboard.prototype[method], 'function', `leaderboard.Leaderboard#${method} is exported`)
}

// utils: the ISteamUtils additions
for (const name of [
    'getSecondsSinceAppActive',
    'getSecondsSinceComputerActive',
    'getConnectedUniverse',
    'getCurrentBatteryPower',
    'getIpcCallCount',
    'overlayNeedsPresent',
    'checkFileSignature',
    'getEnteredGamepadTextLength',
    'isSteamRunningInVr',
    'setOverlayNotificationInset',
    'isVrHeadsetStreamingEnabled',
    'setVrHeadsetStreamingEnabled',
    'isSteamChinaLauncher',
    'initFilterText',
    'filterText',
    'getIpv6ConnectivityState',
    'setGameLauncherMode',
    'dismissGamepadTextInput',
    'dismissFloatingGamepadTextInput',
]) {
    assert.equal(typeof nativeBinding.utils[name], 'function', `utils.${name} is exported`)
}

// apps: the ISteamApps additions, including the proof-of-purchase requests
for (const name of [
    'getEarliestPurchaseUnixTime',
    'getDlcs',
    'installDlc',
    'uninstallDlc',
    'markContentCorrupt',
    'getInstalledDepots',
    'getDlcDownloadProgress',
    'getFileDetails',
    'isSubscribedFromFamilySharing',
    'getTimedTrial',
    'setDlcContext',
    'getBetas',
    'setActiveBeta',
    'requestProofOfPurchaseKey',
    'requestAllProofOfPurchaseKeys',
]) {
    assert.equal(typeof nativeBinding.apps[name], 'function', `apps.${name} is exported`)
}

// The enums keep the SDK numbers, so a value read from Steam can be compared directly
assert.equal(nativeBinding.utils.Universe.Public, 1, 'utils.Universe.Public is 1 (EUniverse)')
assert.equal(nativeBinding.utils.Universe.Dev, 4, 'utils.Universe.Dev is 4 (EUniverse)')
assert.equal(nativeBinding.utils.FileSignatureStatus.ValidSignature, 1, 'FileSignatureStatus.ValidSignature is 1')
assert.equal(nativeBinding.utils.FileSignatureStatus.NoSignaturesFoundForThisApp, 3, 'FileSignatureStatus.NoSignaturesFoundForThisApp is 3')
assert.equal(nativeBinding.utils.Ipv6Protocol.Http, 1, 'utils.Ipv6Protocol.Http is 1')
assert.equal(nativeBinding.utils.Ipv6Protocol.Udp, 2, 'utils.Ipv6Protocol.Udp is 2')
assert.equal(nativeBinding.utils.Ipv6ConnectivityState.Bad, 2, 'utils.Ipv6ConnectivityState.Bad is 2')
assert.equal(nativeBinding.utils.TextFilteringContext.GameContent, 1, 'utils.TextFilteringContext.GameContent is 1')
assert.equal(nativeBinding.utils.TextFilteringContext.Name, 3, 'utils.TextFilteringContext.Name is 3')

// The new callback is registered on the SteamCallback enum and is a number, like the others
assert.equal(
    typeof nativeBinding.callback.SteamCallback.AppProofOfPurchaseKeyResponse,
    'number',
    'SteamCallback.AppProofOfPurchaseKeyResponse is exported',
)

console.log('offline stats, utils and apps exports: ok')
