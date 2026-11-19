---
name: steamworks-workshop-update
description: "Update an existing Steam Workshop item with steamworks.js: change note, new content or preview, metadata changes, upload progress, and result checks, using the shared workshop.py upload from steamworks-workshop-publish. Use for 更新创意工坊项目 / 变更说明 / 上传进度 / publishedFileId / updateItem / 提交前核对 AppID 和项目 ID. Also covers the required items (dependencies) between Workshop items with addDependency / removeDependency: 依赖 / 前置 / required item.  Submits remote content; requires explicit confirmation of the target item and its content. Requires the steamworks-js setup first."
---

# steamworks-workshop-update

**Impact: submits remote content.** Steam documents that a submitted update cannot be cancelled. Before any submission, confirm the AppID, the item id, and the exact content with the user. Complete the setup in [`steamworks-js`](../steamworks-js/SKILL.md) first.

The update uses the same scripts and storage layout as publishing. Read [`steamworks-workshop-publish`](../steamworks-workshop-publish/SKILL.md) for the layout and the full command list; this skill covers the checks and the verification for an existing item.

## Pre-submit checklist (read-only, do all of it)

1. **Item identity:** `workshop/workshop.json` holds the intended `publishedFileId` (not `"0"`), and `appId` is the app that owns the item. Run `workshop.py status <item-dir> --remote`: it must return that id, and its owner must be the user's account.
2. **Content:** `workshop.py check <item-dir>` passes, and `pack` lists exactly the files the user intends. Check the file list for stray or secret files.
3. **Preview:** `previewPath` points to the intended image.
4. **Change note:** `changeNote` (or `--changenote`) is the required bilingual note: a `中文：` line, then an `English: ` line, short, saying what changed. Both lines are written by the agent from the user's change; the scripts refuse any other shape.
5. **Current state:** note `timeUpdated` from `status --remote` so the post-update check can show a change.
6. **Locales and titles:** run the dry-run `upload` and read its `skip:` lines and `title` lines. Only English and Simplified Chinese are sent; each skipped language is not sent, and each composed title is the one the user approved.

Show the results and the planned changes, then wait for an explicit go-ahead.

## Submit

```bash
NOTE=$'中文：修复存档读取问题，优化加载速度。\nEnglish: Fixed a save-loading bug and improved load speed.'
python3 <skill>/steamworks-workshop-publish/scripts/workshop.py upload <item-dir> --changenote "$NOTE"          # dry run: plan only
python3 <skill>/steamworks-workshop-publish/scripts/workshop.py upload <item-dir> --changenote "$NOTE" --yes    # after the go-ahead
```

Keep the stored `publishedFileId`; `upload` updates that item and never creates a second one. Progress lines show the upload status. If the user needs a visibility change, use `--visibility` for this upload only, or change `visibility` in `workshop.json` and commit it.

If the output includes `NEEDS_AGREEMENT`, the item stays hidden until the account accepts the Workshop legal agreement on the Steam website. Tell the user; do not work around it.

## Verify

- `workshop.py status <item-dir> --remote` shows the expected title, visibility, and a newer `timeUpdated`.
- Report those values, not just "the update succeeded".

## Failures

- A failed update keeps the item id. Read the item again (`status --remote`) before deciding anything: the update may have partly applied.
- Running the same `upload --yes` again is the intended retry, because it updates the same item. Do it only after the read above, and only with the same content the user approved.
- If a callback or progress output stalls, check the Steam client is still running before retrying.

## Only the preview image changed

Do not use `upload` for this. `upload` sends the content folder, the descriptions, the tags and the visibility every time, so a new preview would also publish whatever is built or edited locally to every subscriber (some items have tens of thousands). Use `preview`, which submits the preview image and the change note and nothing else:

```bash
python3 <skill>/steamworks-workshop-publish/scripts/workshop.py preview <item-dir> [--file preview.gif]            # dry run: plan only
python3 <skill>/steamworks-workshop-publish/scripts/workshop.py preview <item-dir> --check                         # read-only: owner, app, current preview from Steam
python3 <skill>/steamworks-workshop-publish/scripts/workshop.py preview <item-dir> --yes                           # after the go-ahead
# an item without workshop/workshop.json: --app <AppID> --item <id> --file <image>
# many items: --manifest manifest.json   ([{"app": 4348910, "id": "3838208693", "preview": "a/preview.gif", "name": "Mod"}, ...]), --only id,id
```

- **Checks it makes itself:** the file is PNG, JPG or GIF and at most 1,000,000 bytes; the item id is an existing one (never `0`); the item is owned by the logged-in account and belongs to the app given; afterwards the item is read back and the run fails if Steam still lists the old preview, then the live preview is downloaded and compared with the local file (a byte-identical result is reported; a re-encoded one is flagged for a look).
- **Change note:** the two-line bilingual note is required here too. The default is `中文：预览图已更新。` / `English: The preview was updated.`; pass `--changenote` for another.
- **Many items:** run the dry run and `--check` for the whole manifest first, send one low-traffic item with `--only <id>` and look at the result, then send the rest. A batch stops after three items fail in a row.
- **An animated GIF** works as the main preview. Its first frame is what a static thumbnail shows, so make that frame the full still picture.
- **Verify:** `status <item-dir> --remote` is for items with a folder; otherwise rely on the `verified:` line and `--check`. Report those lines, not just "done".

## Screenshots (extra pictures on an existing item)

Screenshots are a separate update from the content update, and they change no title or content:

```bash
python3 <skill>/steamworks-workshop-publish/scripts/workshop.py images list <item-dir>                 # read-only: what Steam has
python3 <skill>/steamworks-workshop-publish/scripts/workshop.py images upload <item-dir>               # dry run: which files would be added
python3 <skill>/steamworks-workshop-publish/scripts/workshop.py images upload <item-dir> --yes         # after the go-ahead
python3 <skill>/steamworks-workshop-publish/scripts/workshop.py images remove <item-dir> <file-name>...  # dry run: which screenshots would be removed
python3 <skill>/steamworks-workshop-publish/scripts/workshop.py images remove <item-dir> <file-name>... --yes  # after the go-ahead
```

Only the listed files that Steam does not have yet (matched by file name) are added, so a repeated run adds nothing new. Adding needs `@hagicode/steamworks.js` 0.1.4 or later; the scripts refuse older builds.

Removing needs `@hagicode/steamworks.js` 0.1.5 or later. It is one update that names the screenshots by file name, and it changes no content or title. The file name must be on Steam now (`images list` shows them); the command stops on any other name. With `--yes`, the removed entries also leave `screenshots` in `workshop.json`, so the next `images upload` does not add them back. Steam offers no call here to reorder screenshots.

## Required items (dependencies between items)

A Workshop item can require another item: Steam then installs the required item (the child) for every subscriber of the item that requires it (the parent). The calls are `workshop.addDependency(parentId, childId)` and `workshop.removeDependency(parentId, childId)`, both `bigint` ids. Read the installed `client.d.ts` first: a build that does not list them cannot do this, and a global package can be older than the repository build, so set `STEAMWORKS_JS` to the build you checked.

**Impact: changes what every subscriber of the parent installs.** Treat a write like an upload: show the plan (parent, child, add or remove) and wait for the user's go-ahead.

1. **Read the current links** (read-only): `workshop.getItem(parentId, { returnChildren: true })`, then read `children` (ids as `bigint`). Without `returnChildren` the list is not filled.
2. **Plan only the difference.** Add what is declared and missing. Removing what the declaration does not list is a separate, explicit step: a link may have been added on the item page by hand, so report such links and remove them only when the user says so.
3. **Check before writing:** the parent is owned by the logged-in account (`getItem(...).owner.steamId64` equals `localplayer.getSteamId().steamId64`); the child exists and belongs to the same app (`consumerAppId`); the child is already published (a not-yet-published item has no id, so publish it first, which also fixes the order: required items first); no item requires itself and the links form no cycle.
4. **Write:** each call resolves with the Steam result code, and `1` is OK. Any other code is Steam's refusal and arrives as a **resolved number, not a rejection**: stop on it and report the code. An id that is negative or does not fit in 64 bits rejects before any Steam call; a call that never completes rejects and says the outcome is unknown, so read the item before retrying.
5. **Read back** with `getItem(parentId, { returnChildren: true })` and compare. Steam can show the change late, so retry the read a few times before calling it a failure. Report the children you read, not "it worked".

The links change no content, title, description or version, so no upload is needed; and an `upload` never sends them. Dependencies point at an item, not at a version. A rerun after a partial failure is safe when it plans only the difference.

## Out of scope

- Deleting an item (`deleteItem` exists in the typings) is not covered here. Only call it after the user names the item id and confirms the deletion in that message.
- Votes: the checked typings do not expose them. Do not invent calls for them.
