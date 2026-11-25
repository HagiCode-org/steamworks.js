# @hagicode/steamworks-js-cli (SWJS)

`swjs` is the command line of the HagiCode Steamworks JS CLI. It publishes, updates and inspects Steam Workshop items through the Steam client that is already running and logged in on this machine, so no password is typed. It is a separate package: it depends on [`@hagicode/steamworks.js`](https://www.npmjs.com/package/@hagicode/steamworks.js), which provides the native binding.

## Requirements

- Node.js 18.3 or later.
- A running, logged-in Steam client, signed in as the account that owns the app (for any command that talks to Steam).
- The `@hagicode/steamworks.js` native module for your platform (installed with this package). `swjs check`, `swjs pack`, `swjs init` and every dry run work without Steam.

## Install

```sh
npm i -g @hagicode/steamworks-js-cli
swjs --version
swjs doctor --app-id 4348910
```

`swjs doctor` checks Node, the binding, the Steam client and (with `--app-id`) that the account owns the app. Every check is printed, and the exit code is 1 when a required part is missing.

## Item folder

Each Workshop item keeps its metadata in `<item-dir>/workshop/`, using the same layout as the `steamworks-workshop-publish` agent skill, so a folder can be handled by either:

```sh
swjs init ./my-mod --app-id 4348910      # creates workshop/ with templates; never overwrites
# edit workshop/workshop.json, the description files and workshop/preview.png
swjs check ./my-mod                       # every problem at once; exit 1 when something is wrong
swjs pack ./my-mod                        # stages the content in workshop/.build/
```

The important fields of `workshop/workshop.json`:

| Field | Meaning |
| --- | --- |
| `appId` | The Steam AppID of the game. |
| `publishedFileId` | `"0"` until the first `publish`. Written once by `publish`, then only read. |
| `visibility` | `public` (default), `friends`, `hidden` or `unlisted`. |
| `primaryLanguage` | `english` or `schinese`. |
| `languages` | `english` and/or `schinese` with `{title, description}`. Other languages are skipped with a `skip:` line and never sent. |
| `titles` | Optional `{"en": "...", "zh-CN": "..."}`; the title Steam shows is composed from both. |
| `contentPath` | The folder to upload, relative to `workshop/`. |
| `include` | Optional glob patterns relative to `contentPath`. |
| `previewPath` | The main preview, relative to `workshop/` (default `preview.png`). |
| `screenshots` | Extra screenshots, relative to `workshop/`. |
| `tags` | Required. `[]` for none. |
| `changeNote` | Required for `update`: two lines, `中文：…` then `English: …`, under 300 characters. |

Limits are counted in UTF-8 bytes: a title is at most 128 bytes and a description at most 8000 bytes.

## Commands

| Command | What it does | Sends to Steam |
| --- | --- | --- |
| `swjs init <dir> --app-id N [--languages english,schinese]` | Create `workshop/` with templates. Never overwrites a file. | No |
| `swjs check <dir> [--json]` | Validate offline and report every problem. | No |
| `swjs pack <dir>` | Validate, then stage content in `workshop/.build/`. | No |
| `swjs publish <dir> [--visibility V] [--yes]` | Create a new item and record its id once. | Yes, with `--yes` |
| `swjs update <dir> [--changenote TEXT] [--yes]` | Update the item named by `publishedFileId` and read it back. | Yes, with `--yes` |
| `swjs preview <dir> [--file IMAGE] [--changenote TEXT] [--yes]` | Replace only the main preview. | Yes, with `--yes` |
| `swjs images list <dir> [--json]` | Show the screenshots Steam has and the ones listed in `workshop.json`. | No |
| `swjs images upload <dir> [--yes]` | Add the listed screenshots Steam does not have yet. | Yes, with `--yes` |
| `swjs images remove <dir> <name>... [--yes]` | Remove the named screenshots and drop them from `workshop.json`. Needs steamworks.js 0.1.5 or later. | Yes, with `--yes` |
| `swjs status <dir> [--remote] [--json]` | The stored identity; `--remote` also reads Steam. | Read-only |
| `swjs item <id> --app-id N [--json]` | One Workshop item. | Read-only |
| `swjs list --app-id N [--mine] [--tag T] [--search S] [--page P] [--json]` | One page of items for an app. | Read-only |
| `swjs subscribed [--json]` | The items the account is subscribed to, with state. | Read-only |
| `swjs doctor [--app-id N] [--json]` | Environment checks. | Read-only |

Run `swjs <command> --help` for the options of one command.

## Writes are dry runs first

Every command that changes something on Steam prints its plan and sends nothing unless `--yes` is given. `--yes` alone is not enough: it also needs `WORKSHOP_WRITE_CONFIRMED=1` in the environment, and the refusal is printed before anything is staged or sent.

```sh
swjs publish ./my-mod                       # dry run: prints the plan
WORKSHOP_WRITE_CONFIRMED=1 swjs publish ./my-mod --yes
```

The variable is for the person or the script that runs the command after it has seen the plan. The CLI cannot check who set it; it guards against accidental writes.

`publish` creates an item only from `publishedFileId` `"0"`, and refuses an item that already has an id (use `update`). `update`, `preview` and `images` refuse an item the logged-in account does not own, or that belongs to another app.

## Output and exit codes

- Text is printed on standard output. Errors and refusals go to standard error.
- `--json` (read commands) prints exactly one JSON document on standard output; everything else goes to standard error.
- Exit codes: `0` success, `1` a failure or a refused write, `2` a usage error.

## Environment

| Variable | Use |
| --- | --- |
| `WORKSHOP_WRITE_CONFIRMED=1` | Required together with `--yes` for every write. |
| `STEAMWORKS_JS` | A folder with `index.js` (a `@hagicode/steamworks.js` package folder) to use instead of the installed dependency. |

## Not in this version

- Subscribe, unsubscribe, vote, favorite and playtime writes.
- Workshop videos, metadata, key-value tags and content descriptors.
- Tag names are required but not checked against the list Steam declares for the game.

## Maintainers

The CLI is released by the same `publish.yml` run as `@hagicode/steamworks.js`: a `v*` tag publishes both to npm `latest`, and a push to `main` publishes both to `dev`, with the same version. The `deploy-cli` job runs after `deploy` and pins `@hagicode/steamworks.js` to that exact version before it publishes. The package `@hagicode/steamworks-js-cli` needs an npm trusted publisher (or publish access) for `publish.yml` before its first release. That is set up on npmjs.com, outside this repository.

Tests run offline with `node --test test/*.test.mjs` from this folder. `prepack` runs `scripts/check-package.mjs`, which refuses the placeholder version and an unpinned dependency.

## License

MIT. See [LICENSE](./LICENSE).
