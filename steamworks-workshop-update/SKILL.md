---
name: steamworks-workshop-update
description: "Update an existing Steam Workshop item with steamworks.js: change note, new content or preview, metadata changes, upload progress, and result checks, using the shared workshop.py upload from steamworks-workshop-publish. Use for 更新创意工坊项目 / 变更说明 / 上传进度 / publishedFileId / updateItem / 提交前核对 AppID 和项目 ID. Submits remote content; requires explicit confirmation of the target item and its content. Requires the steamworks-js setup first."
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

## Out of scope

- Deleting an item (`deleteItem` exists in the typings) is not covered here. Only call it after the user names the item id and confirms the deletion in that message.
- Dependencies and votes: the checked typings do not expose them. Do not invent calls for them.
