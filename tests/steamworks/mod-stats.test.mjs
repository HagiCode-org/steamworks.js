import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'steamworks-workshop-stats', 'scripts', 'mod-stats.mjs');
const {
  cacheRoot, loadPrevious, saveSnapshot, toRow, buildReport, renderMarkdown,
} = await import(pathToFileURL(SCRIPT).href);

// A stand-in for steamworks.js. Read calls only; anything else is not implemented, so a write would fail the run.
const FAKE_STEAMWORKS = `
const fs = require('fs');
const DATA = JSON.parse(process.env.FAKE_STEAM_DATA);
const log = (e) => { if (process.env.FAKE_STEAM_LOG) fs.appendFileSync(process.env.FAKE_STEAM_LOG, JSON.stringify(e) + '\\n'); };
const PAGE = 2;
module.exports = {
  init(appId) {
    log({ call: 'init', appId });
    return {
      apps: { isSubscribedApp: (id) => DATA.owned.includes(id) },
      localplayer: { getSteamId: () => ({ accountId: 1234, steamId64: '76561190000000000' }) },
      workshop: {
        async getUserItems(page, accountId, listType, itemType, sort, appIds) {
          log({ call: 'getUserItems', appId, page, creator: appIds.creator });
          const all = DATA.items[String(appId)] ?? [];
          const slice = all.slice((page - 1) * PAGE, page * PAGE);
          return {
            items: slice.map((x) => (x === null ? undefined : x)),
            returnedResults: slice.length,
            totalResults: all.length,
            wasCached: false,
          };
        },
      },
    };
  },
  shutdown() {},
};
`;

const item = (id, title, subs, fav, visibility = 0) => ({
  publishedFileId: id, title, visibility, timeUpdated: 1793754318,
  statistics: { numSubscriptions: subs, numFavorites: fav },
});

// Day 1 (2026-11-02) and day 2 (2026-11-03) readings of two games.
const DAY1 = {
  owned: [111, 222],
  items: {
    111: [item('A1', 'Alpha | 主控板', 100, 10), item('B2', 'Beta', 300, 30), null],
    222: [item('C3', 'Gamma', 5, 1, 2)],
  },
};
const DAY2 = {
  owned: [111, 222],
  items: {
    111: [item('B2', 'Beta', 350, 31), item('A1', 'Alpha | 主控板', 120, 12), item('D4', 'Delta', 1, 0)],
    222: [],
  },
};

function withFixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mod-stats-'));
  try {
    const steam = path.join(dir, 'steamworks.js');
    fs.mkdirSync(steam);
    fs.writeFileSync(path.join(steam, 'index.js'), FAKE_STEAMWORKS);
    const cache = path.join(dir, 'cache');
    const log = path.join(dir, 'calls.log');
    return fn({ dir, steam, cache, log });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const run = (args, f, data) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, STEAMWORKS_JS: f.steam, FAKE_STEAM_DATA: JSON.stringify(data), FAKE_STEAM_LOG: f.log },
  });

const listFiles = (dir) => {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else out.push(path.relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
};

test('cacheRoot uses the current user cache directory on each platform', () => {
  assert.equal(cacheRoot({ env: { XDG_CACHE_HOME: '/x/cache' }, platform: 'linux', home: '/h' }), path.join('/x/cache', 'steamworks-workshop-stats'));
  assert.equal(cacheRoot({ env: {}, platform: 'linux', home: '/h' }), path.join('/h', '.cache', 'steamworks-workshop-stats'));
  assert.equal(cacheRoot({ env: {}, platform: 'darwin', home: '/h' }), path.join('/h', 'Library', 'Caches', 'steamworks-workshop-stats'));
  assert.equal(cacheRoot({ env: { LOCALAPPDATA: 'C:\\L' }, platform: 'win32', home: '/h' }), path.join('C:\\L', 'steamworks-workshop-stats'));
  assert.equal(cacheRoot({ cacheDir: 'rel' }), path.resolve('rel'));
});

test('toRow maps visibility, counts and time, and leaves unknown counts null', () => {
  const row = toRow(item('C3', 'Gamma', 5, 1, 2));
  assert.equal(row.publishedFileId, 'C3');
  assert.equal(row.visibility, 'hidden');
  assert.equal(row.subscriptions, 5);
  assert.equal(row.favorites, 1);
  assert.equal(row.updated, new Date(1793754318 * 1000).toISOString());
  assert.equal(toRow({ publishedFileId: 9n, title: 'x', statistics: {} }).subscriptions, null);
});

test('saveSnapshot then loadPrevious returns the latest earlier day only', () => {
  withFixture((f) => {
    const game = { appId: 111, total: 2, missing: 0, items: [toRow(item('A1', 'Alpha', 100, 10))] };
    saveSnapshot(f.cache, game, '2026-11-01', 'T1');
    saveSnapshot(f.cache, game, '2026-11-02', 'T2');
    assert.equal(loadPrevious(f.cache, 111, '2026-11-03').date, '2026-11-02');
    assert.equal(loadPrevious(f.cache, 111, '2026-11-02').date, '2026-11-01', 'the same day is not its own base');
    assert.equal(loadPrevious(f.cache, 111, '2026-11-01'), null);
    assert.equal(loadPrevious(f.cache, 999, '2026-11-03'), null);
    assert.equal(loadPrevious(f.cache, 111, '2026-11-03').items.A1.subscriptions, 100);
  });
});

test('buildReport gives each mod its own change, marks new mods and lists removed ones', () => {
  const previous = { date: '2026-11-02', items: { A1: { title: 'Alpha', subscriptions: 100, favorites: 10 }, B2: { title: 'Beta', subscriptions: 300, favorites: 30 }, Z9: { title: 'Gone', subscriptions: 4, favorites: 0 } } };
  const games = [{ appId: 111, total: 3, missing: 0, previous, items: [toRow(item('B2', 'Beta', 350, 31)), toRow(item('A1', 'Alpha', 120, 12)), toRow(item('D4', 'Delta', 1, 0))] }];
  const report = buildReport(games, { today: '2026-11-03', readAt: 'T' });
  const [g] = report.games;
  assert.equal(g.baseDate, '2026-11-02');
  assert.deepEqual(g.items.map((i) => i.publishedFileId), ['B2', 'A1', 'D4']);
  assert.equal(g.items[0].subscriptionsChange, 50);
  assert.equal(g.items[0].favoritesChange, 1);
  assert.equal(g.items[1].subscriptionsChange, 20);
  assert.equal(g.items[2].isNew, true);
  assert.equal(g.items[2].subscriptionsChange, null);
  assert.deepEqual(g.removed, [{ publishedFileId: 'Z9', title: 'Gone' }]);
});

test('renderMarkdown has one row per mod, no totals, pipes escaped and base dates shown', () => {
  const games = [{ appId: 111, total: 2, missing: 1, previous: { date: '2026-11-02', items: { A1: { title: 'Alpha | 主控板', subscriptions: 90, favorites: 9 } } }, items: [toRow(item('A1', 'Alpha | 主控板', 100, 10)), toRow(item('B2', 'Beta', 300, 30))] }];
  const md = renderMarkdown(buildReport(games, { today: '2026-11-03', readAt: 'T' }));
  assert.match(md, /对比基准：2026-11-02/);
  assert.match(md, /\| Alpha \\\| 主控板 \| A1 \| public \| 100 \| \+10 \| 10 \| \+1 \|/);
  assert.match(md, /\| Beta \| B2 \| public \| 300 \| 新增 \| 30 \| 新增 \|/);
  assert.doesNotMatch(md, /合计/);
  assert.match(md, /Steam 返回了 1 个无法读取/);
});

test('two days of reports: changes against the previous day, same-day reruns overwrite, only the cache is written', () => {
  withFixture((f) => {
    const apps = '111,222';
    const r1 = run(['report', '--apps', apps, '--date', '2026-11-02', '--cache-dir', f.cache, '--format', 'json'], f, DAY1);
    assert.equal(r1.status, 0, r1.stderr);
    const first = JSON.parse(r1.stdout);
    assert.equal(first.games[0].baseDate, null, 'the first save has no base');
    assert.equal(first.games[0].items[0].subscriptionsChange, null);

    const r2 = run(['report', '--apps', apps, '--date', '2026-11-03', '--cache-dir', f.cache, '--format', 'json'], f, DAY2);
    assert.equal(r2.status, 0, r2.stderr);
    const second = JSON.parse(r2.stdout);
    const g111 = second.games[0];
    assert.equal(g111.baseDate, '2026-11-02');
    const b2 = g111.items.find((i) => i.publishedFileId === 'B2');
    const a1 = g111.items.find((i) => i.publishedFileId === 'A1');
    const d4 = g111.items.find((i) => i.publishedFileId === 'D4');
    assert.equal(b2.subscriptionsChange, 50);
    assert.equal(b2.favoritesChange, 1);
    assert.equal(a1.subscriptionsChange, 20);
    assert.equal(a1.favoritesChange, 2);
    assert.equal(d4.isNew, true);
    assert.deepEqual(second.games[1].removed, [{ publishedFileId: 'C3', title: 'Gamma' }]);

    // A rerun on the same day rewrites that day's file and still compares with 2026-11-02.
    const r3 = run(['report', '--apps', apps, '--date', '2026-11-03', '--cache-dir', f.cache, '--format', 'json'], f, DAY2);
    assert.equal(r3.status, 0, r3.stderr);
    assert.equal(JSON.parse(r3.stdout).games[0].baseDate, '2026-11-02');

    assert.deepEqual(listFiles(f.cache), [
      path.join('111', '2026-11-02.json'),
      path.join('111', '2026-11-03.json'),
      path.join('222', '2026-11-02.json'),
      path.join('222', '2026-11-03.json'),
    ]);
    const saved = JSON.parse(fs.readFileSync(path.join(f.cache, '111', '2026-11-03.json'), 'utf8'));
    assert.equal(saved.items.B2.subscriptions, 350);
    assert.equal(saved.items.D4.subscriptions, 1);

    // Steam was only read; the fixture folder holds nothing but the fake and the test's own call log.
    const calls = fs.readFileSync(f.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l).call);
    assert.deepEqual([...new Set(calls)].sort(), ['getUserItems', 'init']);
    assert.deepEqual(listFiles(f.dir).filter((n) => !n.startsWith('cache')).sort(), ['calls.log', path.join('steamworks.js', 'index.js')]);
  });
});

test('a game the account does not own stops the report and saves nothing', () => {
  withFixture((f) => {
    const r = run(['report', '--apps', '111,333', '--date', '2026-11-03', '--cache-dir', f.cache], f, DAY1);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /333: this Steam account does not own app 333/);
    assert.doesNotMatch(r.stdout, /Beta/, 'no partial report may be printed');
    assert.deepEqual(listFiles(f.cache), [], 'no snapshot may be saved for a failed report');
  });
});
