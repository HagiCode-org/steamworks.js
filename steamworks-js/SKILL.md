---
name: steamworks-js
description: Route work that uses the steamworks.js Node binding to the Steam Workshop/UGC sub-skills. Covers Node and steamworks.js environment checks, Steam client initialization, AppID confirmation, callbacks and error handling, and choosing the right steamworks-* skill. Use for Steamworks / steamworks.js / Steam API / Steam 客户端 / AppID / 创意工坊 / Workshop / UGC / 订阅 / Steam 回调 questions or code.
---

# steamworks-js (router)

This skill owns the shared setup for every `steamworks-*` skill. It does not carry the operation steps itself: once setup passes, load the sub-skill for the job.

## 1. Environment check (read-only)

- Confirm the Node version the project uses (`node -v`) and that a `steamworks.js` package is in its dependencies. Read the installed typings (`client.d.ts`) before using any call; the surface differs between builds, so do not assume a function exists because another build has it.
- Install the binding globally: `npm i -g @ducky7go/steamworks.js@0.1.4` (0.1.4 or later for Workshop screenshots; 0.1.5 or later to remove them). The shared scripts use `STEAMWORKS_JS` when it is set (a package folder containing `index.js`), otherwise the global install, and print the version they loaded. If the npm mirror in use lags the registry, add `--registry=https://registry.npmjs.org/`.
- Confirm the Steam desktop client is running and logged in to the account that will act. Steam calls fail without it.
- Confirm the AppID the code will use. Write operations must use the real AppID of the game or tool that owns the Workshop items. Never use a placeholder or a guessed value.

## 2. Initialization and callbacks

- Initialize once per process with `init(appId?)`. If the app was launched outside Steam, `restartAppIfNecessary(appId)` tells you to relaunch through Steam.
- `init()` starts the callback pump itself (a 30 Hz timer in the checked build), so async results and progress events arrive without a manual loop. Do not add `runCallbacks()` calls; check the installed build's `index.js` if in doubt.
- Call `shutdown()` when the process exits; it stops that timer.

## 3. Errors

- Promises reject with the Steam error. Show the message and the call that failed.
- Do not retry a write (create, update, subscribe, download) automatically. Read the item's state first, then decide with the user. A failed upload after an item was created keeps that item's id: the next attempt updates that id, and must never create a second item.

## 4. Route to a sub-skill

| Job | Sub-skill | Impact |
| --- | --- | --- |
| Lists, search, tags, item details, user lists, paging | [`steamworks-workshop-query`](../steamworks-workshop-query/SKILL.md) | Read-only |
| Create an item, first upload of content and preview, set title/description/tags/visibility; shared `workshop.py` and per-item `workshop/` layout | [`steamworks-workshop-publish`](../steamworks-workshop-publish/SKILL.md) | Submits remote content |
| Change an existing item, change note, upload progress and result check | [`steamworks-workshop-update`](../steamworks-workshop-update/SKILL.md) | Submits remote content |
| Subscribe, unsubscribe, download, install location, item state | [`steamworks-workshop-client-state`](../steamworks-workshop-client-state/SKILL.md) | Changes account subscriptions or local files |
| Report of our published mods per game: one row per mod with subscriptions and favorites, change against the previous saved day in the user's cache directory | [`steamworks-workshop-stats`](../steamworks-workshop-stats/SKILL.md) | Read-only for Steam; writes its own daily cache files |

Other Steamworks modules (cloud, stats/achievements, identity/social, overlay/input) are planned as later phases and have no skill yet. Do not improvise them from this skill.

## 5. Operation impact rules

- **Read-only:** queries, `state`, `installInfo`, `downloadInfo`, `getSubscribedItems`. Run freely.
- **Account or local state:** `subscribe`, `unsubscribe`, `download`. Show the target `publishedFileId` and the expected effect, then wait for the user's go-ahead.
- **Remote submission:** `createItem`, `updateItem`, `updateItemWithCallback`. Before calling, state the AppID, the `publishedFileId` (or that a new item will be created), the content path, and the preview path. Steam documents that a submitted update cannot be cancelled, so get explicit confirmation of the exact content. Removing screenshots is also an `updateItem`, with `removeAdditionalPreviewIndexes` (0.1.5 or later): 0-based indexes into `additionalPreviews` as read just before the call. Confirm the item and the file names first; the shared scripts do this through `workshop.py images remove`.
- **Destructive:** `deleteItem` appears in the typings but has no phase-1 skill. Do not call it without a per-item confirmation from the user that names the id.
- Verify the outcome with a read (`getItem`, `state`) after every write, and report the evidence, not the expectation.

## 6. Safety

- Never print or commit Steam credentials, Web API keys or session tokens.
- Do not treat publisher administration (Workshop moderation, Publisher Web API keys) as client-side work. It needs a separate server-side process with its own access control.
