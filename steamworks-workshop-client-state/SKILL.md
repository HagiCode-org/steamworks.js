---
name: steamworks-workshop-client-state
description: "Manage the local Steam Workshop client state with steamworks.js: subscribed items, subscribe and unsubscribe, download and download progress, install location and info, and item state flags. Use for 已订阅列表 / 订阅 / 取消订阅 / 下载 / 安装位置 / 项目状态 / getSubscribedItems / subscribe / unsubscribe / download / installInfo / state. Subscribe, unsubscribe and download change account or local state, so they need confirmation. Requires the steamworks-js setup first."
---

# steamworks-workshop-client-state

Complete the setup in [`steamworks-js`](../steamworks-js/SKILL.md) first. The Steam client must be running and logged in to the account whose subscriptions are being managed.

## Calls (from the installed typings)

- `workshop.getSubscribedItems()`: read-only list of subscribed `publishedFileId`s.
- `workshop.state(itemId)`: read-only number of combined `EItemState` flags for the item on this client.
- `workshop.installInfo(itemId)`: `folder`, `sizeOnDisk`, `timestamp` of installed content, or `null`. Read-only as an API call, but see the note below.
- `workshop.downloadInfo(itemId)`: progress of a pending download, or `null`.
- `workshop.subscribe(itemId)` and `workshop.unsubscribe(itemId)`: both return promises.
- `workshop.download(itemId, highPriority)`: returns `boolean`. High priority pauses other Steam downloads.

## Impact

- **Read-only:** `getSubscribedItems`, `state`, `downloadInfo`. Run freely.
- **Account state:** `subscribe` adds the item to the user's subscriptions. `unsubscribe` removes it, and per Steam's documentation the content is removed when the game quits. Show the id and wait for a go-ahead.
- **Local files:** `download` fetches content to disk. `highPriority: true` also interrupts other Steam downloads, so only use it when the user asks.
- **Used-items list:** Steam's documentation says `GetItemInstallInfo` records the item in the user's used list. This is not verified in this skill; check the Steamworks documentation before relying on it, and tell the user before reading install info for items they did not ask about.

## Steps

1. Read first: `getSubscribedItems()` and `state(itemId)` for each target. Report what is already subscribed or installed.
2. For a change, show the target ids, the action, and the expected effect. Wait for confirmation.
3. Perform the action, then re-read `state(itemId)` and `downloadInfo(itemId)` (for downloads) to confirm the result. Report the observed state.
4. For installation location, report `installInfo(itemId).folder` as returned. Do not move or edit files in it from this skill.

## Traps

- Do not treat `state` flags as a single value; they combine, so test with bitwise checks.
- A download that returns `true` has been queued, not finished. Confirm with `downloadInfo` or `state` before reporting it as installed.
