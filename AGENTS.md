# steamworks.js

## Overview

- `@ducky7go/steamworks.js`: Node/Electron bindings for the Steamworks SDK. A Rust native layer (`napi` 2.16 + `napi-derive`, crate `steamworksjs`, `cdylib`) wraps `steamworks-rs`, with a thin JS loader (`index.js`) and hand-maintained type declarations.
- `package.json` is committed with `"version": "0.0.1"`. CI sets the real version with `npm version` before building and publishing; do not bump it for a release.
- The README presents this as a replacement for greenworks. The upstream repo was not verified: no `upstream` remote is configured in this checkout.

## Layout

- `src/lib.rs`, `src/client.rs`, `src/api/*.rs`: one Rust module per Steam feature (`achievement`, `apps`, `auth`, `callback`, `cloud`, `input`, `localplayer`, `matchmaking`, `networking`, `overlay`, `stats`, `utils`, `workshop`, `workshop_item`).
- `vendor/steamworks-rs`: git submodule (`https://github.com/ducky7go/steamworks-rs.git`), a path dependency with features `serde` and `raw-bindings`. Do not edit it. In a non-recursive clone it is empty; run `git submodule update --init --recursive` before building.
- `build.js`: copies the Steam redistributable from `vendor/steamworks-rs/steamworks-sys/lib/steam/redistributable_bin/<folder>` into `dist/<folder>`, then runs `napi build` for the chosen target. It passes `--dts ../../client.d.ts`, so the build regenerates `client.d.ts`.
- `index.js` loads `dist/<win64|linux64|osx>/steamworksjs.<triple>.node`. Supported: win32-x64, linux-x64, darwin-x64, darwin-arm64.
- Type declarations: `client.d.ts` is generated and tracked in git. `index.d.ts` and `callbacks.d.ts` are hand-written.
- `scripts/check-package.js`: the `prepack` guard. It fails if a platform's native module or the Steam redistributable is missing, or if `package.json` still has `0.0.1`.
- `test/`: Node smoke scripts (`offline-smoke-test.js`, `auth.js`, `workshop.js`, ...), `test/electron/` app, `test/typescript/` type-check project.

## Build, test, format

- Needs Node, pnpm, Rust, Clang, and an initialized `vendor/steamworks-rs`. Run `pnpm install`, then `pnpm run build:debug` (or `pnpm run build` for `--release`). Build only your own platform locally; CI builds all targets. `pnpm run prune` removes `dist`, `target` and `client.d.ts`.
- Format: `pnpm run format` (`cargo clippy --fix --allow-staged && cargo fmt`). CI runs `cargo fmt --all --check` and `cargo clippy`.
- Offline check, no Steam client needed: `pnpm run test:offline`.
- TypeScript check (what `typescript-smoke-test.yml` runs): `cd test/typescript && pnpm install`, then `pnpm run test:types` (`tsc --noEmit --strict index.ts`).
- Other scripts in `test/` need a running Steam client and an AppID (default 480 in examples); see `test/README.md`. Electron: `cd test/electron && pnpm install && pnpm start`.
- JS/TS style (`.prettierrc`): single quotes, no semicolons, trailing commas, 4-space indent, print width 140, LF.

## Release

Publishing is done by `.github/workflows/publish.yml`. Version rules come from the tag or from `GitVersion.yml`.

- Official release: push a `v*` tag, for example `git tag v0.5.0 && git push origin v0.5.0`. CI strips the `v` and publishes that version to the npm `latest` dist-tag. Users install with `npm i @ducky7go/steamworks.js`.
- Dev build: every push to `main` publishes GitVersion's `fullSemVer` to the npm `dev` dist-tag. Users install with `npm i @ducky7go/steamworks.js@dev`.
- The dev version comes from GitVersion, not from the GitHub API. `GitVersion.yml` sets the `main` branch to label `dev` with a Patch increment, computed from the git tags. Pushes to other branches and pull requests build but do not publish; the deploy job runs only for pushes to `ducky7go/steamworks.js`.
- GitVersion needs tags and full history. Every checkout in `publish.yml` uses `fetch-depth: 0` and `submodules: recursive`; keep both if you edit the workflow.
- `publish.yml` fails if the committed `client.d.ts` differs from the native build. After changing the Rust API, rebuild and commit `client.d.ts`.

## Conventions

- Conventional Commits (`feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, ...). Mark breaking changes with `BREAKING CHANGE:` in the body (`CONTRIBUTING.md`). Release notes are generated from commit messages.
- Behavior or spec changes follow the OpenSpec workflow.
- Update `client.d.ts` and `index.d.ts` together with the Rust API.
- Workshop language codes are Steam API names (`english`, `schinese`, `french`, ...), passed as `language` to `updateItem` (see the README "Workshop Multilingual Support" section).
- Changing the submodule pointer requires the matching commit to be pushed to `ducky7go/steamworks-rs` first.

## Gotchas

- `test/README.md` gives `node tests/additional-previews-smoke-test.js`. The directory is `test/`, so run `node test/additional-previews-smoke-test.js`.
- The README's production Electron section says to copy from `sdk/redistributable_bin/...`. `build.js` takes the files from `vendor/steamworks-rs/steamworks-sys/lib/steam/redistributable_bin/` instead.
- Runtime tests need Steam running and an AppID, from `steam_appid.txt` or `init(appId)`.
