#!/usr/bin/env node
// mod-stats.mjs: Steam Workshop statistics for the items this Steam account published under each game, one row per mod.
//
//   node mod-stats.mjs report [--apps 3167020,4348910] [--date YYYY-MM-DD] [--cache-dir <dir>] [--format md|json]
//   node mod-stats.mjs collect --app <AppID>      (one game per process: steamworks.js binds the AppID given to init())
//
// Steam is only read. Each report also saves the counts it read to the current user's cache directory:
//   <cache>/steamworks-workshop-stats/<AppID>/<YYYY-MM-DD>.json
// One file per game per day; a later run on the same day rewrites that day's file. Changes are measured against the
// latest file dated before the report's date, so the base date is shown. --date and --cache-dir are for tests.
//
// The cache is the only history: clearing the cache directory deletes the comparison base.
//
// steamworks.js is found like steam-workshop.mjs: STEAMWORKS_JS (a package folder with index.js), else the global
// @hagicode/steamworks.js install. The Steam client must be running and logged in to the publishing account.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_APPS = [3167020, 4348910];
export const GAME_NAMES = {
  3167020: 'Escape from Duckov (鸭科夫)',
  4348910: 'Probably Stolen (深空当铺)',
};
const VISIBILITY = ['public', 'friends', 'hidden', 'unlisted'];
const USER_LIST_PUBLISHED = 0; // UserListType.Published
const UGC_TYPE_ITEMS = 0; // UGCType.Items
const SORT_CREATION_DESC = 1; // UserListOrder.CreationOrderDesc
const MAX_PAGES = 200;
const MARK = 'MOD_STATS_JSON ';
const DATE_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const SELF = fileURLToPath(import.meta.url);

const num = (v) => (v === undefined || v === null ? null : Number(v));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localToday = (now = new Date()) => ymd(now);

// The current user's cache directory for this skill. Linux: $XDG_CACHE_HOME or ~/.cache; macOS: ~/Library/Caches;
// Windows: %LOCALAPPDATA%.
export function cacheRoot({ cacheDir, env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (cacheDir) return path.resolve(cacheDir);
  const base = platform === 'win32'
    ? env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    : platform === 'darwin'
      ? path.join(home, 'Library', 'Caches')
      : env.XDG_CACHE_HOME || path.join(home, '.cache');
  return path.join(base, 'steamworks-workshop-stats');
}

// Converts one steamworks.js WorkshopItem into the plain row this skill reports.
export function toRow(item) {
  const s = item.statistics ?? {};
  const id = String(item.publishedFileId);
  return {
    publishedFileId: id,
    title: String(item.title ?? ''),
    visibility: VISIBILITY[item.visibility] ?? String(item.visibility),
    subscriptions: num(s.numSubscriptions),
    favorites: num(s.numFavorites),
    updated: item.timeUpdated ? new Date(Number(item.timeUpdated) * 1000).toISOString() : null,
    url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
  };
}

// Latest saved snapshot for one game dated before `today`, or null when there is none.
export function loadPrevious(root, appId, today) {
  const dir = path.join(root, String(appId));
  if (!existsSync(dir)) return null;
  const dates = readdirSync(dir)
    .map((name) => name.match(DATE_FILE)?.[1])
    .filter((d) => d && d < today)
    .sort();
  const last = dates.at(-1);
  if (!last) return null;
  const data = JSON.parse(readFileSync(path.join(dir, `${last}.json`), 'utf8'));
  if (data.schema !== 1 || typeof data.items !== 'object' || data.items === null) {
    throw new Error(`snapshot ${last}.json for app ${appId} is not a schema 1 file`);
  }
  return { date: last, items: data.items };
}

// Writes the day's snapshot for one game, replacing that day's file atomically.
export function saveSnapshot(root, game, today, readAt) {
  const dir = path.join(root, String(game.appId));
  mkdirSync(dir, { recursive: true });
  const items = Object.fromEntries(
    game.items.map((i) => [i.publishedFileId, { title: i.title, visibility: i.visibility, subscriptions: i.subscriptions, favorites: i.favorites }]),
  );
  const file = path.join(dir, `${today}.json`);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ schema: 1, appId: game.appId, date: today, readAt, total: game.total, missing: game.missing, items }, null, 2)}\n`);
  renameSync(tmp, file);
  return file;
}

const delta = (now, before) => (now === null || now === undefined || before === null || before === undefined ? null : Number(now) - Number(before));

// Builds the report from per-game collect results plus each game's previous snapshot (or null).
// Each item carries its own change; items are sorted by subscriptions, highest first, unknown counts last.
export function buildReport(games, { today, readAt = new Date().toISOString() }) {
  return {
    readAt,
    today,
    games: games.map((g) => {
      const prev = g.previous ?? null;
      const items = g.items
        .map((it) => {
          const before = prev?.items[it.publishedFileId];
          return {
            ...it,
            isNew: Boolean(prev) && !before,
            subscriptionsChange: delta(it.subscriptions, before?.subscriptions),
            favoritesChange: delta(it.favorites, before?.favorites),
          };
        })
        .sort((a, b) => (b.subscriptions ?? -1) - (a.subscriptions ?? -1));
      const now = new Set(g.items.map((i) => i.publishedFileId));
      const removed = prev
        ? Object.entries(prev.items)
          .filter(([id]) => !now.has(id))
          .map(([id, v]) => ({ publishedFileId: id, title: v.title ?? '' }))
        : [];
      return {
        appId: g.appId,
        name: GAME_NAMES[g.appId] ?? String(g.appId),
        total: g.total,
        missing: g.missing,
        baseDate: prev?.date ?? null,
        items,
        removed,
      };
    }),
  };
}

const cell = (v) => (v === null || v === undefined || v === '' ? '—' : String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '));
const changeText = (it, field) => {
  if (it.isNew) return '新增';
  const v = it[field];
  if (v === null) return '—';
  return v > 0 ? `+${v}` : String(v);
};

export function renderMarkdown(report, { cacheDir } = {}) {
  const out = [
    '# Steam Workshop 模组数据报表',
    '',
    `- 读取时间（UTC）：${report.readAt}`,
    `- 报表日期：${report.today}`,
    ...(cacheDir ? [`- 本次保存位置：${cacheDir}`] : []),
    '',
  ];
  for (const g of report.games) {
    out.push(`## ${g.name}，AppID ${g.appId}`, '');
    out.push(g.baseDate
      ? `对比基准：${g.baseDate}（上一次保存的记录）`
      : '对比基准：无。这是第一次保存，变化列暂时显示"无基线"。',
    '');
    out.push('| 模组 | 发布 ID | 可见性 | 订阅量 | 订阅变化 | 收藏量 | 收藏变化 | 更新时间（UTC） |');
    out.push('| --- | --- | --- | ---: | ---: | ---: | ---: | --- |');
    for (const it of g.items) {
      const noBase = g.baseDate === null;
      out.push(
        `| ${cell(it.title || '（无标题）')} | ${cell(it.publishedFileId)} | ${cell(it.visibility)} | ${cell(it.subscriptions)} | ${noBase ? '无基线' : changeText(it, 'subscriptionsChange')} | ${cell(it.favorites)} | ${noBase ? '无基线' : changeText(it, 'favoritesChange')} | ${cell(it.updated)} |`,
      );
    }
    out.push('');
    if (g.missing) out.push(`> Steam 返回了 ${g.missing} 个无法读取的项目，未列入上表。`, '');
    if (g.removed.length) {
      out.push(`> 上次记录中有、本次 Steam 已查不到的项目（${g.removed.length} 个）：`);
      for (const r of g.removed) out.push(`> - ${cell(r.title || '（无标题）')}，发布 ID ${r.publishedFileId}`);
      out.push('');
    }
  }
  return out.join('\n');
}

// Reads every published item of one game through the running Steam client. Steam's page numbers start at 1.
export async function collectGame(steamworks, appId) {
  const client = steamworks.init(appId);
  if (!client) throw new Error('the Steam client did not initialise');
  if (client.apps?.isSubscribedApp && !client.apps.isSubscribedApp(appId)) {
    throw new Error(`this Steam account does not own app ${appId}`);
  }
  const accountId = client.localplayer.getSteamId().accountId;
  const items = [];
  let missing = 0;
  let total = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await client.workshop.getUserItems(
      page, accountId, USER_LIST_PUBLISHED, UGC_TYPE_ITEMS, SORT_CREATION_DESC,
      { creator: appId, consumer: appId }, {},
    );
    total = r.totalResults;
    if (!r.returnedResults) break;
    for (const it of r.items ?? []) {
      if (it) items.push(toRow(it));
      else missing++;
    }
    if (items.length + missing >= total) break;
  }
  if (total === null || items.length + missing < total) {
    throw new Error(`incomplete read: got ${items.length + missing} of ${total ?? '?'} items`);
  }
  return { appId, total, missing, items };
}

function loadSteamworks() {
  let folder;
  if (process.env.STEAMWORKS_JS) {
    folder = path.resolve(process.env.STEAMWORKS_JS);
  } else {
    let root = '';
    try {
      root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    } catch {
      // npm not on PATH: reported below
    }
    folder = root ? path.join(root, '@hagicode', 'steamworks.js') : '';
  }
  if (!folder || !existsSync(path.join(folder, 'index.js'))) {
    throw new Error('steamworks.js not found: npm i -g @hagicode/steamworks.js@0.1.4, or set STEAMWORKS_JS');
  }
  return createRequire(import.meta.url)(folder);
}

const parseApps = (text) =>
  text.split(',').map((s) => {
    const n = Number.parseInt(s.trim(), 10);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`bad AppID in --apps: ${s}`);
    return n;
  });

function parseOptions(rest) {
  return (name) => {
    const i = rest.indexOf(`--${name}`);
    return i === -1 ? undefined : rest[i + 1];
  };
}

async function runCollect(rest) {
  const opt = parseOptions(rest);
  const appId = Number.parseInt(opt('app') ?? '', 10);
  if (!Number.isInteger(appId) || appId <= 0) throw new Error('collect needs --app <AppID>');
  const steamworks = loadSteamworks();
  let data;
  try {
    data = await collectGame(steamworks, appId);
  } finally {
    if (typeof steamworks.shutdown === 'function') steamworks.shutdown();
  }
  // steamworks.js keeps a callback timer alive, so exit explicitly once the JSON line has been written.
  process.stdout.write(`${MARK}${JSON.stringify(data)}\n`, () => process.exit(0));
}

// Runs one `collect` child per game, so each game is read under its own AppID.
function collectInChild(appId) {
  const r = spawnSync(process.execPath, [SELF, 'collect', '--app', String(appId)], {
    encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024, env: process.env,
  });
  const label = GAME_NAMES[appId] ?? String(appId);
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  if (r.status !== 0) {
    const last = (r.stderr || '').trim().split('\n').filter(Boolean).pop() ?? '';
    throw new Error(`${label}: ${last.replace(/^error:\s*/, '') || `collect exited ${r.status}`}`);
  }
  const line = (r.stdout || '').split('\n').reverse().find((l) => l.startsWith(MARK));
  if (!line) throw new Error(`${label}: no data from collect`);
  return JSON.parse(line.slice(MARK.length));
}

async function runReport(rest) {
  const opt = parseOptions(rest);
  const apps = opt('apps') ? parseApps(opt('apps')) : DEFAULT_APPS;
  const today = opt('date') ?? localToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('--date must be YYYY-MM-DD');
  const format = opt('format') ?? 'md';
  if (!['md', 'json'].includes(format)) throw new Error('--format must be md or json');
  const root = cacheRoot({ cacheDir: opt('cache-dir') });
  // Games are read one after another; one failure stops the report and nothing is saved, so no game is silently missing.
  const collected = apps.map(collectInChild);
  const games = collected.map((g) => ({ ...g, previous: loadPrevious(root, g.appId, today) }));
  const report = buildReport(games, { today });
  for (const g of games) saveSnapshot(root, g, today, report.readAt);
  report.cacheDir = root;
  process.stdout.write(format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : `${renderMarkdown(report, { cacheDir: root })}\n`);
}

export async function main(argv) {
  const [command = '', ...rest] = argv;
  if (command === 'collect') return runCollect(rest);
  if (command === 'report') return runReport(rest);
  throw new Error('usage: mod-stats.mjs report [--apps A,B] [--date YYYY-MM-DD] [--cache-dir dir] [--format md|json]');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`error: ${e.message ?? e}`);
    process.exit(1);
  });
}
