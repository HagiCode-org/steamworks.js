# steamworks.js

## Overview

- `@hagicode/steamworks.js`: Node/Electron bindings for the Steamworks SDK. A Rust native layer (`napi` 2.16 + `napi-derive`, crate `steamworksjs`, `cdylib`) wraps `steamworks-rs`, with a thin JS loader (`index.js`) and hand-maintained type declarations.
- `package.json` is committed with `"version": "0.0.1"`. CI sets the real version with `npm version` before building and publishing; do not bump it for a release.
- The README presents this as a replacement for greenworks. The upstream repo was not verified: no `upstream` remote is configured in this checkout.

## Layout

- `src/lib.rs`, `src/client.rs`, `src/api/*.rs`: one Rust module per Steam feature (`achievement`, `apps`, `auth`, `callback`, `cloud`, `input`, `localplayer`, `matchmaking`, `networking`, `overlay`, `stats`, `utils`, `workshop`, `workshop_item`).
- `vendor/steamworks-rs`: git submodule (`https://github.com/HagiCode-org/steamworks-rs.git`), a path dependency with features `serde` and `raw-bindings`. Do not edit it. In a non-recursive clone it is empty; run `git submodule update --init --recursive` before building.
- `build.js`: copies the Steam redistributable from `vendor/steamworks-rs/steamworks-sys/lib/steam/redistributable_bin/<folder>` into `dist/<folder>`, then runs `napi build` for the chosen target. It passes `--dts ../../client.d.ts`, so the build regenerates `client.d.ts`.
- `index.js` loads `dist/<win64|linux64|osx>/steamworksjs.<triple>.node`. Supported: win32-x64, linux-x64, darwin-x64, darwin-arm64.
- Type declarations: `client.d.ts` is generated and tracked in git. `index.d.ts` and `callbacks.d.ts` are hand-written.
- `scripts/check-package.js`: the `prepack` guard. It fails if a platform's native module or the Steam redistributable is missing, or if `package.json` still has `0.0.1`.
- `test/`: Node smoke scripts (`offline-smoke-test.js`, `auth.js`, `workshop.js`, ...), `test/electron/` app, `test/typescript/` type-check project.
- Agent skills (Steam Workshop workflows): one top-level folder per skill, each with `SKILL.md` plus `scripts/`, `references/` and `templates/` where needed. Folders: `steamworks-js/` (router), `steamworks-workshop-publish/`, `steamworks-workshop-update/`, `steamworks-workshop-query/`, `steamworks-workshop-client-state/`, `steamworks-workshop-stats/`.
- Skill tests stay outside the skill folders, in `tests/steamworks/`. This is not the same as `test/` above.

## Skills

- Skill index:
  - [`steamworks-js`](steamworks-js/SKILL.md): router for the steamworks.js binding (setup, client init, AppID, callbacks, sub-skill choice).
  - [`steamworks-workshop-query`](steamworks-workshop-query/SKILL.md): read-only Workshop queries.
  - [`steamworks-workshop-publish`](steamworks-workshop-publish/SKILL.md): publish new items; submits remote content.
  - [`steamworks-workshop-update`](steamworks-workshop-update/SKILL.md): update existing items; submits remote content.
  - [`steamworks-workshop-client-state`](steamworks-workshop-client-state/SKILL.md): subscriptions, downloads, install info; changes account or local state.
  - [`steamworks-workshop-stats`](steamworks-workshop-stats/SKILL.md): read-only subscriber and favorite report with daily cache.
- Run the skill tests from the repo root: `node --test tests/steamworks/*.test.mjs`. The publish scripts call `python3`, so it must be on `PATH`.
- Each `SKILL.md` frontmatter `name` must equal its folder name, and `steamworks-js/SKILL.md` must link to every sub-skill. `tests/steamworks/skill.test.mjs` checks both.
- The skills are not part of the npm package. `package.json` `files` lists only `dist/*`, `index.js`, `*.d.ts` and `README.md`; keep it that way. Check with `npm pack --dry-run --ignore-scripts`.
- Other projects can use a skill by symlinking its folder into their own `.claude/skills/`.
- Settings that must not be committed stay out of the repo. The scripts read `STEAMWORKS_JS`, `WORKSHOP_TAGS_FILE` and `XDG_CACHE_HOME` from the environment.

## Documentation site

- `docs/` is a self-contained Astro + Starlight site with its own `package.json`, `pnpm-workspace.yaml` and `pnpm-lock.yaml`. Install and run it from `docs/` with `pnpm install --frozen-lockfile`. The root `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml` must not reference it.
- `docs/src/content/docs/generated/` holds the guide and skill pages built from `README.md` and `*/SKILL.md`. It is git-ignored, and it is never edited by hand. Change `README.md` or the `SKILL.md`, then run `pnpm run import:sources`. `dev`, `build` and `check` run it first.
- `docs/src/content/docs/index.mdx` is the only hand-written page.
- Each `README.md` `##` section must be mapped to a guide page in `docs/scripts/page-map.mjs` or listed in `excludedSections`. Adding a section fails the import until it is mapped, and a renamed heading fails until the map is updated. A new skill folder needs no map change.
- Tests for the importer: `pnpm exec node --test test/import-sources.test.mjs`, run from `docs/`.
- Commands, all run from `docs/`: `pnpm run dev` (local server), `pnpm run build` (writes `docs/dist/`), `pnpm run check` (type and content check), `pnpm run test` (the suite; the site tests read `dist/`, so build first), and `pnpm run verify` (registry check, check, build, test in that order). CI and the publication build both run `verify`.
- Payload contract: after `pnpm run build`, `node scripts/stage-payload.mjs` writes `.deploy/gh-pages/` at the repository root with `esa.jsonc` and `wrangler.jsonc` (copied from `.github/gh-pages/`) and `dist/`. It exits non-zero, naming the item, when one is missing. `.deploy/` is git-ignored.
- `.github/workflows/docs-deploy-gh-pages.yml` publishes that payload to the `gh-pages` branch, only from `main`, as one commit with Jekyll disabled. It is isolated from `publish.yml` and the native and npm pipelines, and the docs tests fail if those workflows gain a build, publish or release step.
- gh-pages is a publication artifact, and hosting is separate. Hosting, DNS and activating `steamworks.hagicode.com` for the payload are operations outside this repo.

## Build, test, format

- Needs Node, pnpm, Rust, Clang, and an initialized `vendor/steamworks-rs`. Run `pnpm install`, then `pnpm run build:debug` (or `pnpm run build` for `--release`). Build only your own platform locally; CI builds all targets. `pnpm run prune` removes `dist`, `target` and `client.d.ts`.
- Format: `pnpm run format` (`cargo clippy --fix --allow-staged && cargo fmt`). CI runs `cargo fmt --all --check` and `cargo clippy`.
- Offline check, no Steam client needed: `pnpm run test:offline`.
- TypeScript check (what `typescript-smoke-test.yml` runs): `cd test/typescript && pnpm install`, then `pnpm run test:types` (`tsc --noEmit --strict index.ts`).
- Other scripts in `test/` need a running Steam client and an AppID (default 480 in examples); see `test/README.md`. Electron: `cd test/electron && pnpm install && pnpm start`.
- JS/TS style (`.prettierrc`): single quotes, no semicolons, trailing commas, 4-space indent, print width 140, LF.

## Release

Publishing is done by `.github/workflows/publish.yml`. Version rules come from the tag or from `GitVersion.yml`.

- Official release: publish the draft release that `release-draft-action.yml` keeps up to date (see below), or push a `v*` tag by hand, for example `git tag v0.5.0 && git push origin v0.5.0`. Either way the tag triggers `publish.yml`. CI strips the `v` and publishes that version to the npm `latest` dist-tag. Users install with `npm i @hagicode/steamworks.js`.
- Dev build: every push to `main` publishes GitVersion's `fullSemVer` to the npm `dev` dist-tag. Users install with `npm i @hagicode/steamworks.js@dev`.
- The dev version comes from GitVersion, not from the GitHub API. `GitVersion.yml` sets the `main` branch to label `dev` with a Patch increment, computed from the git tags. Pushes to other branches and pull requests build but do not publish; the deploy job runs only for pushes to `HagiCode-org/steamworks.js`.
- GitVersion needs tags and full history. Every checkout in `publish.yml` uses `fetch-depth: 0` and `submodules: recursive`; keep both if you edit the workflow.
- Release drafts: `.github/workflows/release-draft-action.yml` runs `HagiCode-org/hagi-release-drafter` (pinned to a tag) on every push to `main` and on manual dispatch (optional `version` input, stable `X.Y.Z` only). It creates or updates one draft release and never publishes it. The version comes from Conventional Commits since the last release tag (`feat` bumps minor, `!` or `BREAKING CHANGE:` bumps minor while major is 0, anything else bumps patch). Publishing the draft in the GitHub UI creates the `vX.Y.Z` tag, which triggers `publish.yml`. PR labels are not used. Keep `fetch-depth: 0` and `fetch-tags: true` on its checkout.
- `publish.yml` fails if the committed `client.d.ts` differs from the native build. After changing the Rust API, rebuild and commit `client.d.ts`.

## Conventions

- Conventional Commits (`feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, ...). Mark breaking changes with `!` after the type or a `BREAKING CHANGE:` footer (`CONTRIBUTING.md`). Release notes are generated from commit messages by hagi-release-drafter; a commit subject containing `skip-release-notes` is left out.
- Behavior or spec changes follow the OpenSpec workflow.
- Update `client.d.ts` and `index.d.ts` together with the Rust API.
- Workshop language codes are Steam API names (`english`, `schinese`, `french`, ...), passed as `language` to `updateItem` (see the README "Workshop Multilingual Support" section).
- Changing the submodule pointer requires the matching commit to be pushed to `HagiCode-org/steamworks-rs` first.

## Gotchas

- `test/README.md` gives `node tests/additional-previews-smoke-test.js`. The directory is `test/`, so run `node test/additional-previews-smoke-test.js`.
- The README's production Electron section says to copy from `sdk/redistributable_bin/...`. `build.js` takes the files from `vendor/steamworks-rs/steamworks-sys/lib/steam/redistributable_bin/` instead.
- Runtime tests need Steam running and an AppID, from `steam_appid.txt` or `init(appId)`.
