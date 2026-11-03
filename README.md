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
```

- Screenshots are append-only in this API: there is no call to remove or reorder them.
- Steam lists screenshots by file name. Send only the files that are not listed yet, otherwise they are added again.
- Adding screenshots needs a Steam client that is running and logged in, and an account that owns the app.

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

## Release Process

This project uses automated release management:

- **Pre-releases**: Automatically created on each push to the `main` branch for testing
- **Official releases**: Created when a version tag is pushed (e.g., `v1.2.3`)

Release notes are automatically generated from commit messages. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the commit message format.
