[![Build Status](https://github.com/ducky7go/steamworks.js/actions/workflows/publish.yml/badge.svg)](https://github.com/ducky7go/steamworks.js/actions/workflows/publish.yml)
[![npm](https://img.shields.io/npm/v/@ducky7go/steamworks.js.svg)](https://npmjs.com/package/@ducky7go/steamworks.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# Steamworks.js

A modern implementation of the Steamworks SDK for HTML/JS and NodeJS based applications.

## Why

I used [greenworks](https://github.com/greenheartgames/greenworks) for a long time and it's great, but I gave up for the following reasons.

* It's not being maintained anymore.
* It's not up to date.
* It's not context-aware.
* You have to build the binaries by yourself.
* Don't have typescript definitions.
* The API it's not trustful.
* The API implement callbacks instead of return flags or promises.
* I hate C++.

## API

```js
const steamworks = require('steamworks.js')

// You can pass an appId, or don't pass anything and use a steam_appid.txt file
const client = steamworks.init(480)

// Print Steam username
console.log(client.localplayer.getName())

// Tries to activate an achievement
if (client.achievement.activate('ACHIEVEMENT')) {
    // ...
}
```

You can refer to the [declarations file](https://github.com/ducky7go/steamworks.js/blob/main/client.d.ts) to check the API support and get more detailed documentation of each function.

## Installation

To use steamworks.js you don't have to build anything, just install it from npm:

```sh
npm i @ducky7go/steamworks.js
```

### Migration from `steamworks.js`

If you were using the unscoped `steamworks.js` package, update your `package.json`:

```json
{
  "dependencies": {
    "@ducky7go/steamworks.js": "latest"
  }
}
```

Then run `pnpm install`. Your `require('steamworks.js')` statements will continue to work without changes.

### Electron

Steamworks.js is a native module and cannot be used by default in the renderer process. To enable the usage of native modules on the renderer process, the following configurations should be made on `main.js`:

```js
const mainWindow = new BrowserWindow({
    // ...
    webPreferences: {
        // ...
        contextIsolation: false,
        nodeIntegration: true
    }
})
```

To make the steam overlay working, call the `electronEnableSteamOverlay` on the end of your `main.js` file:

```js
require('steamworks.js').electronEnableSteamOverlay()
```

For the production build, copy the relevant distro files from `sdk/redistributable_bin/{YOUR_DISTRO}` into the root of your build. If you are using electron-forge, look for [#75](https://github.com/ducky7go/steamworks.js/issues/75).


## How to build

> You **only** need to build if you are going to change something on steamworks.js code, if you are looking to just consume the library or use it in your game, refer to the [installation section](#installation).

Make sure you have the latest [node.js](https://nodejs.org/en/), [Rust](https://www.rust-lang.org/tools/install) and [Clang](https://rust-lang.github.io/rust-bindgen/requirements.html). We also need [Steam](https://store.steampowered.com/about/) installed and running.

### Cloning the repository

This project uses git submodules for the steamworks-rs dependency. When cloning the repository, use:

```sh
git clone --recurse-submodules https://github.com/ducky7go/steamworks.js.git
```

If you have already cloned the repository without submodules, initialize them with:

```sh
git submodule update --init --recursive
```

### Building

Install dependencies with `pnpm install` and then run `pnpm run build:debug` to build the library.

There is no way to build for all targets easily. The good news is that you don't need to. You can develop and test on your current target, and open a PR. When the code is merged to main, a github action will build for all targets and publish a new version.

### Testing Electron

Go to the [test/electron](./test/electron) directory. There, you can run `pnpm install` and then `pnpm start` to run the Electron app.

Click "activate overlay" to test the overlay.

## Contributing

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on commit conventions and the pull request process.

## Workshop Screenshots (Additional Previews)

Besides the main preview, a Workshop item can show extra screenshots. Read them with `includeAdditionalPreviews`, and add more with `additionalPreviewPaths` (an update that carries only the new images):

```js
const steamworks = require('steamworks.js')
const client = steamworks.init(appId)

// list: each entry has urlOrVideoId, originalFilename and previewType (ItemPreviewType)
const item = await client.workshop.getItem(itemId, { includeAdditionalPreviews: true })
console.log(item.additionalPreviews)

// add: appended to the item's screenshots; no content and no title change are sent
await client.workshop.updateItem(itemId, { additionalPreviewPaths: ['/abs/path/shot-2.png'] }, appId)

// remove: pass the 0-based indexes from `additionalPreviews`; the main preview is not affected
await client.workshop.updateItem(itemId, { removeAdditionalPreviewIndexes: [0, 2] }, appId)
```

- Removals run before additions in the same update, from the highest index down. Indexes always refer to the list as it was before this update, so read the list again before removing.
- Screenshots cannot be reordered through this API. The main preview is replaced with `previewPath`, not removed.
- Steam lists screenshots by file name. Send only the files that are not listed yet, otherwise they are added again.
- Adding screenshots needs a Steam client that is running and logged in, and an account that owns the app.

## Workshop Preview and Content Updates

`updateItem` accepts every field as optional, so a call that carries only `previewPath` or only `contentPath` already updates just that part. Two explicit helpers make that intent obvious and check the path before talking to Steam:

```js
const steamworks = require('steamworks.js')
const client = steamworks.init(appId)

// replace only the main preview image; the mod files are not uploaded
await client.workshop.updateItemPreview(itemId, '/abs/path/preview.png', appId, 'New preview')

// upload only the mod folder; the preview image is not touched
await client.workshop.updateItemContent(itemId, '/abs/path/mod-folder', appId, 'Fix crash on load')
```

- Signature for both: `(itemId, path, appId?, changeNote?)`. `appId` defaults to the app the client was initialized with, and `changeNote` is optional.
- `updateItemPreview` rejects when the path is missing or is not a file. `updateItemContent` rejects when the path is missing or is not a folder. Both check before any Steam call.
- Title, description, tags and visibility are not sent, so they stay as they are. To change them together with a file, keep using `updateItem`.
- Neither helper reports upload progress. For a large content upload use `updateItemWithCallback`.

## Workshop Item Dependencies

A Workshop item can require another item, so Steam installs the required item along with it. `addDependency` and `removeDependency` take the parent and the child as `bigint` ids and resolve with the Steam result code. `1` means OK. Any other code is a Steam failure reason, and it arrives as a resolved number, not a rejection.

```js
const steamworks = require('steamworks.js')
const client = steamworks.init(appId)

const modId = 123456789n        // your mod: an item owned by the logged-in account
const requiredId = 3836453389n  // the required child item (Outing Picker)

// mark the child as required by the mod
const added = await client.workshop.addDependency(modId, requiredId)
if (added !== 1) {
  console.error(`Steam refused the dependency, result code ${added}`)
}

// remove it again; the result code is returned the same way
const removed = await client.workshop.removeDependency(modId, requiredId)
```

- Both calls need a running, logged-in Steam client, and the parent must be an item the logged-in account owns.
- An id that is negative or does not fit in 64 bits rejects before any Steam call. A failed call with no completion also rejects, and the error says the outcome is unknown, so check the item before retrying.

## Workshop Multilingual Support

Steamworks.js supports localized content for Steam Workshop items. You can update the title and description for different languages using the `language` parameter.

### Basic Usage

```js
// Update English content (backward compatible - no language specified)
await workshop.updateItem(itemId, {
  title: "My Mod",
  description: "English description"
});

// Update English content (explicitly)
await workshop.updateItem(itemId, {
  title: "My Mod",
  description: "English description",
  language: "english"
});

// Update Chinese content
await workshop.updateItem(itemId, {
  title: "我的模组",
  description: "中文描述",
  language: "schinese"
});
```

### Multiple Languages

Since Steam API only supports updating one language at a time, you need to make multiple `updateItem()` calls for each language:

```js
// Sequential updates
await workshop.updateItem(itemId, {
  title: "My Mod",
  description: "English description",
  language: "english"
});

await workshop.updateItem(itemId, {
  title: "Mon Mod",
  description: "Description française",
  language: "french"
});

await workshop.updateItem(itemId, {
  title: "Mi Mod",
  description: "Descripción en español",
  language: "spanish"
});
```

Or use `Promise.all()` for parallel updates:

```js
await Promise.all([
  workshop.updateItem(itemId, {
    title: "Mein Mod",
    description: "Deutsche Beschreibung",
    language: "german"
  }),
  workshop.updateItem(itemId, {
    title: "私のMod",
    description: "日本語の説明",
    language: "japanese"
  }),
  workshop.updateItem(itemId, {
    title: "내 모드",
    description: "한국어 설명",
    language: "korean"
  })
]);
```

### Supported Language Codes

Steam supports the following language codes:

| Code | Language | Code | Language |
|------|----------|------|----------|
| `english` | English | `schinese` | Simplified Chinese |
| `tchinese` | Traditional Chinese | `german` | German |
| `french` | French | `italian` | Italian |
| `korean` | Korean | `spanish` | Spanish |
| `russian` | Russian | `thai` | Thai |
| `japanese` | Japanese | `portuguese` | Portuguese |
| `polish` | Polish | `danish` | Danish |
| `dutch` | Dutch | `finnish` | Finnish |
| `norwegian` | Norwegian | `swedish` | Swedish |
| `hungarian` | Hungarian | `czech` | Czech |
| `romanian` | Romanian | `turkish` | Turkish |
| `brazilian` | Brazilian Portuguese | `bulgarian` | Bulgarian |
| `greek` | Greek | `arabic` | Arabic |
| `ukrainian` | Ukrainian | `vietnamese` | Vietnamese |

**Note**: If `language` is omitted, it defaults to `"english"`.

## Friends

The `friends` namespace reads the local user's friend list, friend state and avatars, and sends game invites. SteamIDs are `bigint` values.

```js
const steamworks = require('steamworks.js')
const client = steamworks.init(appId)

// 0x4 = immediate friends (FriendFlags.IMMEDIATE)
for (const friend of client.friends.getFriends(0x4)) {
  const state = client.friends.getFriendState(friend.steamId64)
  const avatar = client.friends.getMediumAvatar(friend.steamId64) // Buffer of RGBA pixels, or null
  console.log(friend.nickName ?? friend.name, state, avatar?.length ?? 0)
}

// Invite a friend to the current game with a connect string
client.friends.inviteUserToGame(friendSteamId, 'lobby=abc')

// Remove the Rich Presence keys set with localplayer.setRichPresence
client.friends.clearRichPresence()
```

- `getFriendState` returns a `FriendState` value; `getFriendGamePlayed` returns the AppID of the game a friend is playing, or `null`.
- Avatars are `null` until Steam has loaded them. Call `client.friends.requestUserInformation(steamId64, true)` to ask for a user's information, and wait for the `PersonaStateChange` callback before reading it again.
- Name and state updates arrive through `runCallbacks()`, which `init()` already calls on a timer.

## Stats, Achievements and Leaderboards

`stats` gains float stats, the achievement count and a request for another user's stats. `achievement` gains global unlock percentages. The `leaderboard` namespace finds and creates leaderboards, uploads scores and downloads entries.

```js
const steamworks = require('steamworks.js')
const client = steamworks.init(appId)

client.stats.setFloat('distance', 12.5)
console.log(client.stats.getFloat('distance')) // 12.5, or null when the stat is not defined
console.log(client.stats.getNumAchievements())

// Global unlock percentages: call the request first, then read each achievement
await client.achievement.requestGlobalPercentages()
console.log(client.achievement.getAchievedPercent('FIRST_RUN')) // 0 to 100, or null

// Leaderboards: 0 = Ascending, 0 = Numeric; upload with 0 = KeepBest, download with 0 = Global
const board = await client.leaderboard.findOrCreate('Fastest', 0, 0)
if (board) {
  const result = await board.uploadScore(0, 1234, [])   // null when Steam did not accept the upload
  const top = await board.downloadEntries(0, 0, 10, 0)  // ranks 0 to 9
  console.log(board.getName(), board.getEntryCount(), result, top)
}
```

- `requestUserStats(steamId64)` only starts the request. Its result arrives through the `UserStatsReceived` callback (see `callback.register`).
- The Promise-returning functions (`requestGlobalPercentages`, `find`, `findOrCreate`, `uploadScore`, `downloadEntries`) resolve when Steam answers. Steam delivers those answers inside `runCallbacks()`. `init()` runs it about 30 times a second, so you do not need to call it yourself while the client is initialized.
- A Promise rejects with a readable message when Steam reports a failure. When the answer is lost, the message says the outcome is unknown, so check the data before retrying an upload.

## Networking: `networking` and the New Namespaces

Two families of networking APIs coexist. The `networking` namespace is the original P2P packet API (`sendP2PPacket`, `readP2PPacket`, `acceptP2PSession`), and it is unchanged. The new `networkingSockets`, `networkingMessages` and `networkingUtils` namespaces wrap Steam's Networking Sockets, Networking Messages and Networking Utils interfaces.

- `networking` sends unreliable or reliable packets to a SteamID and reads them back in arrival order. There is no connection object, so you cannot close one peer or tell when it dropped.
- `networkingSockets` creates listen sockets and connections (by IP address or by SteamID), sends and receives messages with send flags, and groups connections into poll groups. Connections are objects with `close`, and state queries show whether each one is open.
- `networkingMessages` is connectionless, like UDP: send to a SteamID on a channel, receive by channel, and handle session requests and failures. Steam creates the underlying session implicitly.
- `networkingUtils` starts relay network access and reports its availability.

```js
const steamworks = require('steamworks.js')
const client = steamworks.init(appId)

// Relay access and authentication: start them early if you expect relayed or authenticated connections
client.networkingUtils.initRelayNetworkAccess()
console.log(client.networkingUtils.getRelayNetworkStatus()) // NetworkingAvailability value
client.networkingSockets.initAuthentication()

// Host: poll the listen socket without waiting, accept connecting peers and take the connection when it is connected
const listen = client.networkingSockets.createListenSocketIp('0.0.0.0:27015')
const event = listen.tryReceiveEvent() // null when nothing is pending
if (event && event.kind === 0 /* Connecting */) {
  event.accept()
}
if (event && event.kind === 1 /* Connected */) {
  const connection = event.takeConnection()
  connection.send(Buffer.from('hello'), 8) // 8 = reliable
  console.log(connection.receive(16))
}

// Client: connect by IP address, then close with a reason
const connection = client.networkingSockets.connectByIpAddress('203.0.113.5:27015')
connection.setUserData(1n)
connection.close(1000, 'done', true)

// Messages: accept requests from Steam users and read channel 3
client.networkingMessages.onSessionRequest((request) => request.accept())
client.networkingMessages.sendMessageToUser(friendSteamId, 8, Buffer.from('hi'), 3)
console.log(client.networkingMessages.receiveMessagesOnChannel(3, 10))
```

- Send flags are a bitmask of Steam's `k_nSteamNetworkingSend_*` values: `0` unreliable, `8` reliable, `1` no Nagle delay. Invalid addresses and closed handles fail with a readable error.
- Listen socket events and session requests are only produced while `runCallbacks()` runs. `init()` already calls it about 30 times a second.
- A connection or request you never close or answer is closed or rejected when its JavaScript object is garbage collected. Close connections explicitly.
- Connections and messages need a Steam network path, so they cannot be exercised offline. The offline smoke test only checks that these functions are exported.

## Server Browser, Timeline, Screenshots and Remote Play

`matchmakingServers` lists game servers and queries single servers. `timeline` marks game state and events for Steam's timeline. `screenshots` hooks the screenshot hotkey and adds images to the Steam library. `remotePlay` lists Remote Play Together sessions and sends invites.

```js
const steamworks = require('steamworks.js')
const client = steamworks.init(appId)

// Server list: request, read, then release it
const list = client.matchmakingServers.lanServerList(appId)
try {
  for (let i = 0; i < list.getServerCount(); i++) {
    const server = list.getServerDetails(i) // ip, port, name, map, players, maxPlayers, ping
    console.log(server.name, server.players, server.maxPlayers, server.ping)
  }
} finally {
  list.release()
}

// Single server: these are Promises and reject when the server does not answer
const ping = await client.matchmakingServers.pingServer('192.168.1.10', 27015)
const players = await client.matchmakingServers.playerDetails('192.168.1.10', 27015)
const rules = await client.matchmakingServers.serverRules('192.168.1.10', 27015)

// Timeline: 0 = Playing (the game mode values are Playing, Staging, Menus, LoadingScreen)
client.timeline.setGameMode(0)
client.timeline.addEvent('icon', 'Boss defeated', '', 0, -5, 5, 1) // clip priority 1 = Standard

// Screenshots: with the hook on, the hotkey raises ScreenshotRequested instead of Steam taking the picture
client.screenshots.hookScreenshots(true)
client.screenshots.triggerScreenshot()

// Remote Play Together
for (const session of client.remotePlay.sessions()) {
  console.log(session.sessionId, session.steamId64, client.remotePlay.sessionDetails(session.sessionId))
}
client.remotePlay.invite(friendSteamId)
```

- Steam fills a server list over time, through callbacks that `init()` pumps automatically. Read the count after a short wait, not right after the request. The single-server functions are Promises that resolve the same way.
- Release every server list request when you finish with it. Methods called after `release()` throw a readable error.
- Invalid IPv4 addresses, negative durations and strings with NUL characters are rejected with a readable error before any Steam call.
- `timeline` calls are silent when the Steam timeline interface is unavailable.

## Supplemental Functions

These functions extend existing namespaces. Nothing that existed before has changed.

```js
const client = steamworks.init(appId)

// apps: the launch command line, and a query parameter from a Steam link such as steam://run/480//mode=demo
client.apps.launchCommandLine()
client.apps.launchQueryParam('mode') // '' when the parameter is absent

// utils: overlay and UI state
client.utils.isOverlayEnabled()
client.utils.isSteamInBigPictureMode()
client.utils.getUiLanguage() // for example 'english'

// input: digital and analog action data, and the origins bound to an action
const pressed = client.input.getDigitalActionData(controllerHandle, actionHandle).state
const stick = client.input.getAnalogActionData(controllerHandle, analogHandle) // { x, y, active }
const origins = client.input.getDigitalActionOrigins(controllerHandle, actionSetHandle, actionHandle)
const label = client.input.getStringForActionOrigin(origins[0] ?? 0)

// networking: P2P packets on a channel, and closing a session
client.networking.sendP2PPacketOnChannel(friendSteamId, SendType.Reliable, Buffer.from('hi'), 2)
client.networking.isP2PPacketAvailableOnChannel(2)
client.networking.closeP2PSession(friendSteamId)

// cloud: share a file (a Promise), stop syncing it, and choose the platforms it syncs to
const shareHandle = await client.cloud.shareFile('save.json')
client.cloud.forgetFile('save.json')
client.cloud.setSyncPlatforms('save.json', 0 /* SyncPlatform.None */)
```

- `getStringForActionOrigin` and `getGlyphForActionOrigin` return an empty string for an origin number that Steam does not define.
- `getSyncPlatforms` rejects when a file syncs to a combination of platforms, because a single `SyncPlatform` value cannot describe it.
- `shareFile` resolves once Steam answers, which happens through `runCallbacks()`. `init()` runs it for you.

## Release Process

This project uses automated release management:

- **Pre-releases**: Automatically created on each push to the `main` branch for testing
- **Official releases**: Created when a version tag is pushed (e.g., `v1.2.3`)

Release notes are automatically generated from commit messages. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the commit message format.
