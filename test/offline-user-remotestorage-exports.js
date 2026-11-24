// Offline checks for the ISteamUser additions (localplayer and auth namespaces) and the ISteamRemoteStorage user-file
// and UGC additions (cloud namespace). No Steam client and no AppID are needed. Nothing here reaches a Steam call that
// needs init(); the argument checks that run before the client is touched are exercised instead.
const assert = require('node:assert/strict')

// Load this platform's native binding directly, the same way test/offline-smoke-test.js does.
const bindingPaths = {
    'win32-x64': '../dist/win64/steamworksjs.win32-x64-msvc.node',
    'linux-x64': '../dist/linux64/steamworksjs.linux-x64-gnu.node',
    'darwin-x64': '../dist/osx/steamworksjs.darwin-x64.node',
    'darwin-arm64': '../dist/osx/steamworksjs.darwin-arm64.node',
}
const nativeBinding = require(bindingPaths[`${process.platform}-${process.arch}`])
const { localplayer, auth, cloud } = nativeBinding

// ISteamUser functions added to the localplayer namespace, in the order of the ISteamUser header.
const localplayerFunctions = [
    'getHSteamUser',
    'trackAppUsageEvent',
    'getUserDataFolder',
    'startVoiceRecording',
    'stopVoiceRecording',
    'getAvailableVoice',
    'getVoice',
    'decompressVoice',
    'getVoiceOptimalSampleRate',
    'isBehindNat',
    'advertiseGame',
    'getGameBadgeLevel',
    'isPhoneVerified',
    'isTwoFactorEnabled',
    'isPhoneIdentifying',
    'isPhoneRequiringVerification',
    'getMarketEligibility',
    'getDurationControl',
    'setDurationControlOnlineState',
]
for (const name of localplayerFunctions) {
    assert.equal(typeof localplayer[name], 'function', `localplayer.${name} is exported`)
}

// ISteamUser encrypted app ticket and store auth URL, in the auth namespace.
for (const name of ['requestEncryptedAppTicket', 'getEncryptedAppTicket', 'requestStoreAuthUrl']) {
    assert.equal(typeof auth[name], 'function', `auth.${name} is exported`)
}

// ISteamRemoteStorage user-file and UGC additions, in the cloud namespace.
const cloudFunctions = [
    'getQuota',
    'writeFileAsync',
    'openWriteStream',
    'beginFileWriteBatch',
    'endFileWriteBatch',
    'getLocalFileChanges',
    'downloadUgc',
    'downloadUgcToLocation',
    'getUgcDownloadProgress',
    'getUgcDetails',
    'readUgc',
    'getCachedUgcCount',
    'getCachedUgcHandle',
]
for (const name of cloudFunctions) {
    assert.equal(typeof cloud[name], 'function', `cloud.${name} is exported`)
}
for (const method of ['writeChunk', 'close', 'cancel']) {
    assert.equal(typeof cloud.FileWriteStream.prototype[method], 'function', `cloud.FileWriteStream#${method} is exported`)
}

// Numeric enums keep the SDK values; the Unknown sentinel is -1 and is not an SDK value.
const expectEnum = (enumObject, values, label) => {
    for (const [name, value] of Object.entries(values)) {
        assert.equal(enumObject[name], value, `${label}.${name} is ${value}`)
    }
}
expectEnum(localplayer.VoiceResult, { Ok: 0, NotInitialized: 1, NotRecording: 2, NoData: 3, BufferTooSmall: 4, DataCorrupted: 5, Restricted: 6, UnsupportedCodec: 7, ReceiverOutOfDate: 8, ReceiverDidNotAnswer: 9, Unknown: -1 }, 'localplayer.VoiceResult')
expectEnum(localplayer.DurationControlOnlineState, { Offline: 1, Online: 2, OnlineHighPri: 3 }, 'localplayer.DurationControlOnlineState')
expectEnum(cloud.LocalFileChangeType, { Invalid: 0, FileUpdated: 1, FileDeleted: 2, Unknown: -1 }, 'cloud.LocalFileChangeType')
expectEnum(cloud.FilePathType, { Invalid: 0, Absolute: 1, ApiFilename: 2, Unknown: -1 }, 'cloud.FilePathType')
expectEnum(cloud.UgcReadAction, { ContinueReadingUntilFinished: 0, ContinueReading: 1, Close: 2 }, 'cloud.UgcReadAction')

// Argument checks that run before any Steam call: no client is needed to reach them.
// BigInt ids must be non-negative and below 2^64.
assert.throws(() => cloud.getUgcDetails(-1n), /handle/, 'getUgcDetails rejects a negative handle and names the argument')
assert.throws(() => cloud.getUgcDownloadProgress(1n << 64n), /handle/, 'getUgcDownloadProgress rejects a handle of 2^64')
// A NUL character in a cloud file name is refused before the stream is opened.
assert.throws(() => cloud.openWriteStream('save\0name'), 'openWriteStream rejects a NUL in the name')

async function main() {
    // writeFileAsync rejects on a NUL in the name; nothing is sent.
    await assert.rejects(cloud.writeFileAsync('save\0name', Buffer.from([1, 2, 3])), 'writeFileAsync rejects a NUL in the name')
    // downloadUgc and downloadUgcToLocation reject a negative handle before the download starts.
    await assert.rejects(cloud.downloadUgc(-1n, 0), 'downloadUgc rejects a negative handle')
    await assert.rejects(cloud.downloadUgcToLocation(-1n, 'C:/tmp/file.bin', 0), 'downloadUgcToLocation rejects a negative handle')
    // readUgc checks the handle before it reads.
    assert.throws(() => cloud.readUgc(-1n, Buffer.alloc(4), 0, cloud.UgcReadAction.Close), 'readUgc rejects a negative handle')
    console.log('offline user + remote storage exports: ok')
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
