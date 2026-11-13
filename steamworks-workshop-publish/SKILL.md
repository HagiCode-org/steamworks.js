---
name: steamworks-workshop-publish
description: Publish a new Steam Workshop item or update one with steamworks.js, through the running Steam client without a password. Provides the shared scripts (workshop.py init/check/pack/upload/status and steam-workshop.mjs) and the per-item storage layout (workshop/workshop.json, descriptions, preview, publishedFileId). Items default to public; a private (hidden) test upload is optional. Covers per-language titles and descriptions, tags, extra screenshots (list and add), replacing only the main preview (`workshop.py preview`, animated GIF allowed), the Workshop legal agreement, and the item id that must be kept. Use for 创意工坊 发布 / 首次上传 / 预览图 / 标题描述 / 更新说明 (变更说明, bilingual, required) / 可见性 / 协议提示 / publishedFileId / workshop.json / createItem. Submits remote content; needs explicit confirmation. Every write to Steam (upload, preview, images upload, images remove) needs a confirmed dry run first: the write runs with WORKSHOP_WRITE_CONFIRMED=1 (see Confirmed writes). Requires the steamworks-js setup first.
---

# steamworks-workshop-publish

**Impact: submits remote content.** Nothing is sent to Steam unless `upload` gets `--yes`, and a submitted update cannot be cancelled. Every `--yes` that writes to Steam (`upload`, `preview`, `images upload`, `images remove`) also needs `WORKSHOP_WRITE_CONFIRMED=1`, which the caller sets only after the user confirms the dry run (see [Confirmed writes](#confirmed-writes)). Before `--yes`, confirm with the user: the account, the AppID, the item (new, or which `publishedFileId`), the visibility, the files, and the preview.

Complete the setup in [`steamworks-js`](../steamworks-js/SKILL.md) first: Node, `@hagicode/steamworks.js` 0.1.4 or later installed globally (or `STEAMWORKS_JS`), a running logged-in Steam client, and an account that owns the app. Screenshot uploads need 0.1.4 or later, and removing screenshots needs 0.1.5 or later; the scripts refuse older builds.

## Where the data lives

Each item keeps its data in `<item-dir>/workshop/` inside its own project. The scripts here hold no project data. Read [`references/item-layout.md`](references/item-layout.md) for the `workshop.json` schema, visibility names, and the migration steps.

**Duckov mods** keep their source in `<mod>/assets/` (`info.ini` with `publishedFileId`, `description/<lang>.md`, `preview.png`), not in `workshop/`. `scripts/duckov-to-workshop.py` creates the `workshop/` folder from those files (Markdown converted to Steam BBCode, the first `# ` heading as the title, the `publishedFileId` kept as it is). The game build is separate: `contentPath` points at the built mod folder.

## Languages, titles and the one upload route

Only English (`english`, also `en`) and Simplified Chinese (`schinese`, also `zh-CN`) are uploaded. Every other language in
`workshop.json` is skipped: `check`, `pack` and `upload` print `skip: <code> (not en or zh-CN; not uploaded)` for it, and the
exit code stays 0. A skipped language is never sent, and text that already exists on Steam for it is left as it is.

Titles can be composed from two segments in the optional `titles` object (`"en"` and `"zh-CN"`). The Chinese entry reads
Chinese first, then English; the English entry reads English first, then Chinese; the separator is ` | ` (defined once in
`scripts/locales.py`). A composed title is at most 128 characters and is checked before anything is staged. Without `titles`,
each stored title is uploaded unchanged. The composition happens in memory: `workshop.json` is never rewritten.

`workshop.py upload` is the single route to Steam. `check`, `pack`, and the dry-run `upload` (read the `skip:` lines and the
`title` lines) run without any variable. `upload --yes` needs `WORKSHOP_WRITE_CONFIRMED=1` (see [Confirmed writes](#confirmed-writes)).
`scripts/steam-workshop.mjs` is the engine behind `upload`: it refuses any language other than `english` and `schinese` before
it contacts Steam, and it is not run by hand to publish.

## Confirmed writes

Every command that writes to Steam takes `--yes` and needs `WORKSHOP_WRITE_CONFIRMED=1` in its environment: `upload`, `preview`
(every mode), `images upload` and `images remove`. Without the variable, `--yes` is refused before anything is read or staged.
Dry runs (no `--yes`) and the read-only commands (`check`, `pack`, `tags`, `status`, `images list`, `videos list`, `preview --check`)
need no variable and send nothing.

The variable belongs to the caller that runs the publish (a script, a CI job, or an agent acting for the user), not to someone
typing commands. The caller follows this order:

1. Run the command without `--yes`. This dry run prints the plan. `preview --check` also reads the item from Steam and changes nothing.
2. Show the plan to the user: the account, the AppID, the item, the visibility, the files, the preview, the change note and, for
   images, the file names.
3. After the user confirms that exact plan, run the same command with `--yes` and `WORKSHOP_WRITE_CONFIRMED=1` in its environment.

The script cannot check who set the variable or whether the user really confirmed. It stops accidental writes; it does not grant
authorization. Do not set the variable to skip step 2. How a particular runner wires these steps belongs in that runner's own
documentation, not here.

Read-only commands and dry runs need no confirmation. The `preview` direct modes (`--app/--item/--file` for an item without a
`workshop/` folder, and `--manifest` for many items) need the same variable for `--yes` as the item-folder mode.

## Tags

Tags belong to each game, so this skill never adds, guesses or copies them. The item's own `workshop.json` names its tags:

- `"tags"` is required. Use `[]` when the item has none: `check` reports an empty list as a warning, and an upload then clears the tags the item has on Steam.
- `check` (and so `pack` and `upload`) verifies every tag against the list Steam declares for the item's `appId`. The list is the Ready to use tag list of the game's public Workshop page, `https://steamcommunity.com/workshop/browse/?appid=<AppID>` (its `declaredTags.readytouse_tags`). A name must match exactly, as Steam writes it; `check` stops on any other name.
- `workshop.py tags <item-dir>` prints that list for the game and the item's current tags. It is read-only. Choose tags from its output.
- The list is cached for 24 hours under `$XDG_CACHE_HOME/steamworks-workshop-publish/` (default `~/.cache/`). When the page cannot be read, an older cache is used with a warning; with no cache at all, `check` stops and says why. `WORKSHOP_TAGS_FILE` (a JSON list of names) replaces the page, for offline work; it applies to every item in the run, whatever its `appId`, so set it for one game at a time. `WORKSHOP_BROWSE_URL` replaces the page address.

## Change note (更新说明)

Every upload carries a change note, and it is required: `check`, `pack` and `upload` refuse an item without one, and `upload --changenote` must pass the same rule. Steam takes one change note per submission, so the Chinese and English notes go into the same text, in this shape (two lines, Chinese first):

```
中文：修复存档读取问题，优化加载速度。
English: Fixed a save-loading bug and improved load speed.
```

The rule (`locales.change_note_problems`, the same one for `workshop.json` and `--changenote`):

- Exactly two non-empty lines. The first starts with `中文：` (or `中文:`) and has Chinese text; the second starts with `English:` and has English words and no Chinese characters.
- Short: at most 300 characters for the whole note, with no `TODO` or `{{ }}` placeholder.
- The note is stored in `workshop/workshop.json` as `changeNote`. A `--changenote` value replaces it for one upload only.

Write the note from what changed in this build, in one or two short sentences per language. The note is sent with the primary language's content update only; the text-only updates for the other language carry no change note. The Steam page's rendering of the line break is not verified by these scripts.

## Scripts

Run from any directory; `<item-dir>` is the folder that owns the item.

| Command | What it does | Sends to Steam |
| --- | --- | --- |
| `scripts/duckov-to-workshop.py <mod-dir> --content <built folder> [--app-id N] [--descriptions DIR] [--force]` | Creates `workshop/` from a Duckov `assets/` folder: `workshop.json`, `description.<code>.txt` (BBCode), `preview.png`, `.gitignore`. Only `en.md` and `zh.md` are converted; any other `<lang>.md` gets a `skip:` line. Keeps `publishedFileId`. Writes nothing to Steam. | No |
| `scripts/workshop.py init <item-dir> --app-id N --languages english,schinese` | Creates `workshop/` with a template `workshop.json` (`"tags": []`, to be set), description files, and `.gitignore`. Never overwrites. Languages: `english` and/or `schinese` (default both; `en` and `zh-CN` also accepted); any other code is refused. | No |
| `scripts/workshop.py check <item-dir>` | Validates the schema, titles, descriptions, preview, `contentPath`, `include`, placeholders, and `tags` (required; each one checked against the game's declared Workshop tags, see [Tags](#tags)). Reads the public Workshop page for the tag list; sends nothing to Steam. | No |
| `scripts/workshop.py tags <item-dir>` | Prints the Workshop tags Steam declares for the item's `appId`, and the item's own `tags`. | Read-only (public page) |
| `scripts/workshop.py pack <item-dir>` | Runs `check`, then stages the included files and `translations.json` in `workshop/.build/`. | No |
| `scripts/workshop.py upload <item-dir> [--visibility V] [--changenote T]` | Dry run: prints the plan, the `skip:` lines, the composed titles and the change note (`T` is the two-line bilingual note, see [Change note](#change-note-更新说明)). | No |
| `scripts/workshop.py upload <item-dir> ... --yes` | Packs, then creates or updates the item; saves the new `publishedFileId` the moment Steam returns it. Needs `WORKSHOP_WRITE_CONFIRMED=1` (see [Confirmed writes](#confirmed-writes)). | **Yes**, with the variable |
| `scripts/workshop.py status <item-dir> [--remote]` | Shows the stored identity; `--remote` reads the item from Steam. | Read-only |
| `scripts/workshop.py images list <item-dir>` | Lists the screenshots Steam has for the item and the ones listed in `workshop.json`. | Read-only |
| `scripts/workshop.py images upload <item-dir> [--yes]` | Adds the listed screenshots that Steam does not have yet (matched by file name). Sends no content and changes no title. | Dry run; **Yes** with `--yes` and `WORKSHOP_WRITE_CONFIRMED=1` |
| `scripts/workshop.py preview <item-dir> [--file IMAGE] [--changenote T]` (or `--app N --item ID --file IMAGE`, or `--manifest FILE [--only IDS]`) | Dry run: prints which items get which preview file and the change note. `--check` reads each item from Steam (owner, app, current preview) and sends nothing. | Dry run; read-only with `--check` |
| `scripts/workshop.py preview ... --yes` | Replaces **only the main preview** of existing items, in one update each. Sends no content, title, description, tags or visibility (`upload` resends all of them). Refuses an item the logged-in account does not own or that belongs to another app, reads the item back and fails if Steam still lists the old preview, then downloads the live preview and compares it with the local file. PNG, JPG or GIF (an animated GIF is allowed), at most 1,000,000 bytes. Needs `WORKSHOP_WRITE_CONFIRMED=1`. | **Yes**, with the variable |
| `scripts/workshop.py videos list <item-dir> [--remote]` | Lists the `videos` in `workshop.json` with their YouTube links; with `--remote` also says which ones Steam shows and which Steam shows that are not listed. | Read-only |
| `scripts/workshop.py images remove <item-dir> <file-name>... [--yes]` | Removes the named screenshots from the item on Steam, in one update. Each name must be on Steam now (`images list`); an unknown name stops the run. Changes no content or title. With `--yes`, also drops those entries from `screenshots` in `workshop.json`. | Dry run; **Yes** with `--yes` and `WORKSHOP_WRITE_CONFIRMED=1` |

Under the hood, `upload --yes` runs `scripts/steam-workshop.mjs publish`. It sends the item's `tags` every time (an empty list clears them), creates the item (only when `publishedFileId` is `"0"`), sends the primary language with the content and preview, and then sends each other language as a text-only update.

## Steps

1. **Build the mod**: the project's build produces the folder that is uploaded. For a Duckov mod: `dotnet build <csproj> -c Release -m:1 -p:DeployMod=true -p:ModsDirectory=<dir>/`, which creates `<dir>/<name>/`. Set the version in `assets/info.ini` first (this is the project's own version; Steam does not read it).
2. **Set up the item**: a Duckov mod runs `duckov-to-workshop.py` with `--content` pointing at that build folder; any other item runs `init` once and then writes the titles, descriptions, and preview. Set `include` if the built folder holds more than the game accepts. Set `tags` from `workshop.py tags <item-dir>`, the game's own list; never copy them from another game's item. Write `changeNote` as the two-line bilingual note (see [Change note](#change-note-更新说明)); `check` fails until it is there.
3. **Check**: `check`, then `pack`. Read the staged file list against what the game accepts.
4. **Dry run**: `upload <item-dir>` with no `--yes`. Show the printed plan to the user, including the skip lines, the composed titles and the change note (both the Chinese and the English line).
5. **Upload as public** (the default): after the user confirms the dry run, `upload --yes` with `WORKSHOP_WRITE_CONFIRMED=1`, with `visibility` `public` from `workshop.json`. Open the item URL and confirm it shows.
6. **Private test only when the user asks**: pass `--visibility hidden` for that upload, check it as the owner, then upload again with `--visibility public` (or set `visibility` back in `workshop.json`) after the user confirms.
7. **Commit** the `workshop/` folder with the new `publishedFileId` (only the `workshop/` paths of that item). Never commit `.build/`.
8. **Report** what was verified: the item id and URL, the visibility Steam returned, which languages were sent, and whether the item was seen as owner or anonymously.

## Pictures on the item

A Workshop item has four kinds of pictures. Only the first three go to Steam through this skill; they are not the same thing.

| Picture | Where it lives | How it is sent |
| --- | --- | --- |
| Main preview (the image in the Mods list and on the item page) | `workshop/preview.png` (`previewPath`) | `upload --yes`, with the content |
| Extra screenshots (Steam "additional previews", shown on the item page) | `workshop/<dir>/*.png` listed in `screenshots` | `images upload --yes` to add, `images remove --yes` to remove (both need `WORKSHOP_WRITE_CONFIRMED=1`); a separate update each time |
| Images inside the game folder | the project's `contentPath` | `upload --yes`; players download them with the mod |
| Steam video previews (YouTube links) | `videos` in `workshop.json` (a record, not a sender) | **Not sent by this skill.** Added by hand on the item page; `videos list` shows what is recorded and, with `--remote`, what Steam shows |

Main preview only: when just the preview image changes (a redrawn picture, or an animated GIF in place of a PNG), use `preview`, not `upload`. `upload` always sends the content folder, the descriptions, the tags and the visibility with it, so a preview refresh would also push whatever is built and written locally to every subscriber. The order is: `preview <item-dir>` (dry run), `preview <item-dir> --check` (reads the item from Steam), then `preview <item-dir> --yes` with `WORKSHOP_WRITE_CONFIRMED=1` after the user confirms. `--manifest` takes a JSON list of `{app, id, preview[, name]}` for many items at once and follows the same order. The default change note is the bilingual `中文：预览图已更新。 / English: The preview was updated.`; pass `--changenote` for another one.

Screenshots: `images list` first (read-only) to see what Steam has. `images upload` adds only the listed files Steam does not list yet, matched by file name, so running it twice adds nothing the second time. Steam keeps the file names; two screenshots with the same name are refused by `check`. To remove one, run `images remove <item-dir> <file-name>` first (a dry run prints the plan), then `--yes` with `WORKSHOP_WRITE_CONFIRMED=1` after the user confirms the item and the names. It needs steamworks.js 0.1.5 or later. Steam offers no call to reorder screenshots. The removed name is also dropped from `screenshots` in `workshop.json`; without that step the next `images upload --yes` would add the file back.

## Videos

Steam takes a Workshop video only as a **YouTube link**. The steamworks.js build in use (`@hagicode/steamworks.js` 0.1.5-dev.6) can read a video preview (`urlOrVideoId`, `previewType` `youtube`) but has no call to add one, so no script here sends a video. The flow is: make the video with any video tool, upload it to YouTube, add the link on the item page as the owner, then record it in `workshop.json`:

```json
"videos": [ { "youtubeId": "dQw4w9WgXcQ", "title": "Demo (English)" } ]
```

`check` validates the list (the 11-character id, not a URL; a title; no duplicates). `upload` prints that videos are not part of the upload. `videos list <item-dir> --remote` compares the list with what Steam shows (read-only).

## Rules and traps

- **Confirmed writes.** Every `--yes` that writes to Steam (`upload`, `preview`, `images upload`, `images remove`) is refused unless `WORKSHOP_WRITE_CONFIRMED=1` is set, and the caller sets it only after the user has confirmed the dry run. This stops accidents; it does not check who set the variable. Do not set it to skip the confirmation, and do not publish from a shell by any other route.
- **Keep the id.** `upload` saves `publishedFileId` as soon as Steam creates the item, before the content upload. If the upload then fails (for example `there isn't a network connection to steam`), the item exists: run the same command again, which updates it. Never clear the id, and never create a second item to "fix" a failure. Confirm the stored id with `status --remote` first if in doubt.
- **Tags are per game.** The same tag name can be missing for one game and present for another. `check` refuses a tag the item's game does not declare and an item with no `tags` key, before anything is sent. The dry run of `upload` prints the tags it would send. An item that already exists on Steam keeps its old tags until an `upload --yes` sends a `tags` list.
- **Agreement.** If Steam reports `NEEDS_AGREEMENT`, the item stays hidden until the account accepts the Workshop legal agreement on the Steam website. Tell the user; do not try to work around it.
- **Description length is counted in UTF-8 bytes, not characters.** Steam refuses a description over 8000 bytes with `error: a parameter is invalid`. Cyrillic and CJK text takes 2-3 bytes per character, so a 5,900-character Russian text can be 8,700 bytes. `check` and `duckov-to-workshop.py` count bytes and report the size; keep every language under 8000 bytes (the scripts warn at 7200).
- **A failed language leaves a partial update.** `upload --yes` sends the primary language with the content first, then each other language in turn. When one language is refused, the content and the languages before it have already changed on Steam, and the rest still show the old text. Fix the text, then run the same `upload --yes` again: the item is updated, not recreated. Do not treat a partially updated item as published.
- **`contentPath` is a build output, not a source folder.** A path in a scratch folder is not committed, so rebuild before each upload. The scripts refuse a missing folder but cannot tell whether it is the current build: rebuild, then `check`.
- **Preview only.** The Steamworks binding accepts a `previewPath` on its own, but no script here exposes that. Updating only the preview is therefore done with a full `upload --yes` (content and descriptions are sent again). A preview-only command is not implemented.
- **Titles** are counted in characters (`128`), and the composed title is what is counted when `titles` is set. This is not verified against Steam's byte count; the Duckov titles are far below the limit.
- **Descriptions are never mixed.** Each player sees the description in their own language and falls back to the primary one. Put one language per description file, never two in one. Titles are the exception: a composed title carries both segments on purpose (see above).
- **Anonymous checks.** Steam answers repeated anonymous requests to an item page with HTTP 429. Do not loop; check later or in a logged-in browser.
- **Steam credentials.** Never ask for, print or store a password. The scripts use the running client only. `steamcmd` (password and Steam Guard) is not used here; if the user wants it, they run it in their own terminal.
- **Game rules stay with the project.** Which files the game loads, banned assemblies, capability declarations and version lists are project knowledge. The project's build step and its `include` list enforce them; this skill does not know them.
- **Deleting** an item is not part of this skill. Only the user decides that, per item.
