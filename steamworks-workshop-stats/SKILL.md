---
name: steamworks-workshop-stats
description: "Steam Workshop statistics report for each mod this Steam account published under given games: one row per mod with its current subscriber and favorite counts and its change against the previous saved day, kept in the user's cache directory. Defaults to Escape from Duckov (3167020) and Probably Stolen (4348910). Use for 创意工坊 数据 / 订阅量 / 收藏量 / 报表 / 每日变化 / 已发布模组 / Workshop stats / subscriptions / favorites questions. Requires the steamworks-js setup first."
---

# steamworks-workshop-stats

**Impact: Read-only for Steam.** The script calls only read methods (`getUserItems`, `getSteamId`, `isSubscribedApp`) and never changes the Workshop or the account. It writes one thing: the day's counts, to the current user's cache directory (see below). Complete the setup in [`steamworks-js`](../steamworks-js/SKILL.md) first: Node, `@hagicode/steamworks.js` installed globally (or `STEAMWORKS_JS`), and the Steam client running and logged in to the publishing account.

## Run

From any directory:

```bash
node <skill-dir>/scripts/mod-stats.mjs report                  # both default games, Markdown
node <skill-dir>/scripts/mod-stats.mjs report --format json    # same data as JSON
node <skill-dir>/scripts/mod-stats.mjs report --apps 3167020   # one game
```

Each run saves today's counts, then compares them with the earlier saved day. `report` starts one `collect` child per game, because steamworks.js binds the AppID given to `init()`. A failure in any game stops the report and saves nothing, so a game is never silently left out.

## Where the history lives

- **Directory:** `$XDG_CACHE_HOME/steamworks-workshop-stats/` or `~/.cache/steamworks-workshop-stats/` on Linux; `~/Library/Caches/steamworks-workshop-stats/` on macOS; `%LOCALAPPDATA%\steamworks-workshop-stats\` on Windows. The report prints the path it used.
- **Files:** `<cache>/<AppID>/<YYYY-MM-DD>.json`, one per game per day, with `schema`, `readAt`, `total`, `missing` and `items` keyed by publish id (title, visibility, subscriptions, favorites).
- **Same-day reruns** overwrite that day's file. They do not add a file.
- **Comparison base:** each game's latest file dated before the report date. The report shows the base date under each game heading. With no earlier file, the change columns read "无基线"; a mod that was not in the base file reads "新增".
- **Removed mods:** a mod in the base file that Steam no longer returns is listed under its game, not dropped silently.

## What each row shows

One row per mod, with its title, publish id, visibility, current subscriber count, subscriber change, current favorite count, favorite change, and update time (UTC). Steam's counts are current values at read time; the change is the difference from the base file. There are no totals, because the mods are reported separately.

## Steps

1. Confirm the games and AppIDs with the user. The defaults are the two monitored games; `--apps` overrides them.
2. Run `report`. The script refuses an AppID the account does not own.
3. Read the output: each row's counts and changes, the base date under each game, the removed list, and the read time and save path.
4. If a mod is missing from the table, state how many Steam returned as unreadable (the footer line).

## Traps

- **The cache is the only history.** Clearing the cache directory, or a new machine or user account, removes the comparison base. Before a cleanup, check whether the cache matters.
- **Days without a run leave gaps.** The change is against the latest saved day, which may be several days earlier. The base date shows which one.
- **Titles can contain `|`** (for example `OnePanel | 主控板`); the script escapes it so the table stays intact. Do not hand-edit the table.
- **The AppID context matters.** `init()` for one game does not list items of another; querying under the wrong AppID fails with `Could not create workshop query`.
- **Counts are as Steam reports them at read time**, not as of midnight. The read time is printed with the table.
- **Only the publishing account is seen.** A mod published from another Steam account is not in the report.
