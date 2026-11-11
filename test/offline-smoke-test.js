// Offline checks: no Steam client and no AppID needed. Confirms that the native module for this platform loads and that
// the package entry point exposes the functions its typings declare. The Steam calls themselves need a running client
// (see the other scripts in this directory).
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
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
assert.equal(typeof nativeBinding.workshop.updateItemPreview, 'function', 'workshop.updateItemPreview is exported')
assert.equal(typeof nativeBinding.workshop.updateItemContent, 'function', 'workshop.updateItemContent is exported')

// friends namespace: every function is exported without a running Steam client.
for (const name of [
    'getFriends',
    'getCoplayFriends',
    'getFriendState',
    'getFriendGamePlayed',
    'getFriendCoplayInfo',
    'getSmallAvatar',
    'getMediumAvatar',
    'getLargeAvatar',
    'requestUserInformation',
    'clearRichPresence',
    'inviteUserToGame',
    'setPlayedWith',
]) {
    assert.equal(typeof nativeBinding.friends[name], 'function', `friends.${name} is exported`)
}

// stats, achievement and leaderboard additions
for (const [namespace, name] of [
    ['stats', 'getFloat'],
    ['stats', 'setFloat'],
    ['stats', 'getNumAchievements'],
    ['stats', 'requestUserStats'],
    ['achievement', 'requestGlobalPercentages'],
    ['achievement', 'getAchievedPercent'],
    ['leaderboard', 'find'],
    ['leaderboard', 'findOrCreate'],
]) {
    assert.equal(typeof nativeBinding[namespace][name], 'function', `${namespace}.${name} is exported`)
}
for (const method of ['getName', 'getEntryCount', 'getSortMethod', 'getDisplayType', 'uploadScore', 'downloadEntries']) {
    assert.equal(typeof nativeBinding.leaderboard.Leaderboard.prototype[method], 'function', `leaderboard.Leaderboard#${method} is exported`)
}

// callback namespace: the original ten SteamCallback values keep their numbers and the new items are appended after them
const callbackEnum = nativeBinding.callback.SteamCallback
const originalCallbacks = {
    PersonaStateChange: 0,
    SteamServersConnected: 1,
    SteamServersDisconnected: 2,
    SteamServerConnectFailure: 3,
    LobbyDataUpdate: 4,
    LobbyChatUpdate: 5,
    P2PSessionRequest: 6,
    P2PSessionConnectFail: 7,
    GameLobbyJoinRequested: 8,
    MicroTxnAuthorizationResponse: 9,
}
for (const [name, value] of Object.entries(originalCallbacks)) {
    assert.equal(callbackEnum[name], value, `SteamCallback.${name} keeps its value`)
}
for (const name of [
    'DownloadItemResult',
    'UserStatsReceived',
    'UserStatsStored',
    'UserAchievementStored',
    'GameOverlayActivated',
    'GameRichPresenceJoinRequested',
    'LobbyEnter',
    'LobbyChatMsg',
    'ScreenshotRequested',
    'ScreenshotReady',
    'NewUrlLaunchParameters',
    'AuthSessionTicketResponse',
    'ValidateAuthTicketResponse',
]) {
    assert.equal(typeof callbackEnum[name], 'number', `SteamCallback.${name} is exported`)
    assert.ok(callbackEnum[name] > 9, `SteamCallback.${name} is appended after the original ten`)
}
assert.equal(typeof nativeBinding.callback.register, 'function', 'callback.register is exported')

// networking namespaces: networkingUtils, networkingMessages and networkingSockets are separate from the legacy networking namespace
for (const [namespace, name] of [
    ['networkingUtils', 'initRelayNetworkAccess'],
    ['networkingUtils', 'getRelayNetworkStatus'],
    ['networkingUtils', 'getDetailedRelayNetworkStatus'],
    ['networkingMessages', 'sendMessageToUser'],
    ['networkingMessages', 'receiveMessagesOnChannel'],
    ['networkingMessages', 'onSessionRequest'],
    ['networkingMessages', 'onSessionFailed'],
    ['networkingSockets', 'createListenSocketIp'],
    ['networkingSockets', 'createListenSocketP2P'],
    ['networkingSockets', 'connectByIpAddress'],
    ['networkingSockets', 'connectP2P'],
    ['networkingSockets', 'createPollGroup'],
    ['networkingSockets', 'initAuthentication'],
    ['networkingSockets', 'getAuthenticationStatus'],
]) {
    assert.equal(typeof nativeBinding[namespace][name], 'function', `${namespace}.${name} is exported`)
}
for (const [namespace, className, method] of [
    ['networkingMessages', 'SessionRequest', 'accept'],
    ['networkingSockets', 'ListenSocket', 'tryReceiveEvent'],
    ['networkingSockets', 'SocketEvent', 'takeConnection'],
    ['networkingSockets', 'Connection', 'send'],
    ['networkingSockets', 'Connection', 'receive'],
    ['networkingSockets', 'Connection', 'close'],
    ['networkingSockets', 'PollGroup', 'receiveMessages'],
]) {
    assert.equal(typeof nativeBinding[namespace][className].prototype[method], 'function', `${namespace}.${className}#${method} is exported`)
}
assert.equal(typeof nativeBinding.networking.sendP2PPacket, 'function', 'networking.sendP2PPacket is still exported')

// matchmakingServers, screenshots, timeline and remotePlay
for (const [namespace, name] of [
    ['matchmakingServers', 'internetServerList'],
    ['matchmakingServers', 'favoritesServerList'],
    ['matchmakingServers', 'historyServerList'],
    ['matchmakingServers', 'friendsServerList'],
    ['matchmakingServers', 'lanServerList'],
    ['matchmakingServers', 'pingServer'],
    ['matchmakingServers', 'playerDetails'],
    ['matchmakingServers', 'serverRules'],
    ['screenshots', 'hookScreenshots'],
    ['screenshots', 'isScreenshotsHooked'],
    ['screenshots', 'triggerScreenshot'],
    ['screenshots', 'addScreenshotToLibrary'],
    ['timeline', 'setGameMode'],
    ['timeline', 'setStateDescription'],
    ['timeline', 'clearStateDescription'],
    ['timeline', 'addEvent'],
    ['remotePlay', 'sessions'],
    ['remotePlay', 'sessionDetails'],
    ['remotePlay', 'invite'],
]) {
    assert.equal(typeof nativeBinding[namespace][name], 'function', `${namespace}.${name} is exported`)
}
assert.equal(typeof nativeBinding.matchmakingServers.ServerListRequest.prototype.getServerCount, 'function', 'matchmakingServers.ServerListRequest#getServerCount is exported')

// supplemental functions added to apps, utils, input, networking and cloud
for (const [namespace, name] of [
    ['apps', 'launchCommandLine'],
    ['apps', 'launchQueryParam'],
    ['utils', 'isOverlayEnabled'],
    ['utils', 'isSteamInBigPictureMode'],
    ['utils', 'getUiLanguage'],
    ['input', 'getDigitalActionData'],
    ['input', 'getAnalogActionData'],
    ['input', 'getDigitalActionOrigins'],
    ['input', 'getAnalogActionOrigins'],
    ['input', 'getStringForActionOrigin'],
    ['input', 'getGlyphForActionOrigin'],
    ['networking', 'sendP2PPacketOnChannel'],
    ['networking', 'isP2PPacketAvailableOnChannel'],
    ['networking', 'readP2PPacketFromChannel'],
    ['networking', 'closeP2PSession'],
    ['cloud', 'shareFile'],
    ['cloud', 'forgetFile'],
    ['cloud', 'getSyncPlatforms'],
    ['cloud', 'setSyncPlatforms'],
]) {
    assert.equal(typeof nativeBinding[namespace][name], 'function', `${namespace}.${name} is exported`)
}

// updateItemPreview and updateItemContent check their path before any Steam call, so a bad path rejects offline.
async function checkWorkshopPathValidation() {
    const missing = path.join(os.tmpdir(), 'steamworksjs-no-such-path')
    await assert.rejects(nativeBinding.workshop.updateItemPreview(1n, missing), /cannot be read/, 'a missing preview file rejects')
    await assert.rejects(nativeBinding.workshop.updateItemPreview(1n, os.tmpdir()), /is not a file/, 'a folder is not a preview file')
    await assert.rejects(nativeBinding.workshop.updateItemContent(1n, missing), /cannot be read/, 'a missing content folder rejects')
    await assert.rejects(nativeBinding.workshop.updateItemContent(1n, __filename), /is not a folder/, 'a file is not a content folder')
}

checkWorkshopPathValidation().then(() => {
    console.log('offline smoke test passed (workshop, friends, stats, achievement, leaderboard, callback, networking, matchmaking servers, screenshots, timeline, remote play and supplemental exports are present)')
})
