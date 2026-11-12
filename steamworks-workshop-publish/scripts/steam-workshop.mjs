#!/usr/bin/env node
// steam-workshop.mjs: the Steamworks calls behind workshop.py (steamworks.js, the Steam client that is already running and
// logged in; no password). It is the engine behind `workshop.py` (`upload --yes`, `images upload --yes`, `status --remote`,
// `images list`): publishing is driven by `workshop.py upload`, not run by hand. `publish` accepts only the english and
// schinese languages and refuses any other one before it contacts Steam.
//
//   node steam-workshop.mjs publish --app <AppID> --item <id|0> --content <dir> --preview <png> \
//        --translations <json> [--tags a,b] [--visibility public|friends|hidden|unlisted] (default public) [--changenote <中文：…\nEnglish: …>]
//   node steam-workshop.mjs add-previews --app <AppID> --item <id> --files <json>   (json: array of absolute image paths)
//   node steam-workshop.mjs remove-previews --app <AppID> --item <id> --indexes <json>   (json: array of 0-based indexes into additionalPreviews)
//   node steam-workshop.mjs info --app <AppID> --item <id>
//   node steam-workshop.mjs set-preview --app <AppID> --item <id> --preview <image> [--changenote <中文：…\nEnglish: …>] [--check]
//
// --translations: [{"language", "title", "description"}, ...]; the first entry is the primary language and is sent with
// the content. Every other entry is sent as its own text-only update, so each player sees one language, never a mix.
// --tags is sent only when given (an empty value clears the tags).
// --item 0 creates a new item. Output lines: `ITEM_ID <id>` (right after creation, before the upload), `NEEDS_AGREEMENT`,
// `DONE <id>`, `URL <url>`, `PREVIEW_ADDED <file>`; `info` and `add-previews` print one `ITEM_INFO <json>` line, which
// includes `additionalPreviews` (the screenshots Steam lists for the item).
//
// add-previews sends only the extra screenshots (no content, no title change), then reads the item back and checks that
// every file is listed. It fails if Steam or the steamworks.js build did not add them.
// remove-previews sends only the removal (no content, no title change), then reads the item back and checks that every
// removed file is gone; it prints `PREVIEW_REMOVED <file>`. The indexes refer to the list `info` shows, as read just before.
// Only steamworks.js 0.1.5 and later can remove screenshots; an older build is refused before Steam is contacted.
//
// set-preview replaces only the item's main preview image: no content, title, description, tags or visibility is sent (the
// update carries previewPath and the change note, nothing else). It first reads the item and refuses when the item is not
// owned by the logged-in account or belongs to another app, then submits, then reads the item back and fails when Steam still
// lists the same preview. Output: `PREVIEW_SET <url>` (the preview Steam now lists), `NEEDS_AGREEMENT`, `DONE <id>`, `URL <url>`.
// --check is read-only: it prints `PREVIEW_CHECK <json>` (title, owner, visibility, current preview) and sends nothing.
//
// steamworks.js is found in this order: STEAMWORKS_JS (the package folder that contains index.js), else the
// @hagicode/steamworks.js package installed globally (`npm i -g @hagicode/steamworks.js@0.1.4`). Nothing is read from a fixed path.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const VISIBILITY = { public: 0, friends: 1, hidden: 2, unlisted: 3 };
const PREVIEW_TYPES = ['image', 'youtube', 'sketchfab', 'environment-horizontal-cross', 'environment-latlong', 'clip'];
const [command = '', ...rest] = process.argv.slice(2);

const opt = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? undefined : rest[i + 1];
};
const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};
const need = (name) => {
  const value = opt(name);
  if (value === undefined || value === '') fail(`missing --${name}`);
  return value;
};

const appId = Number.parseInt(need('app'), 10);
const item = need('item');
if (!Number.isInteger(appId) || appId <= 0) fail('--app must be a positive AppID');
if (!/^\d+$/.test(item)) fail('--item must be digits (0 creates an item)');

// The Workshop scope (locales.py in workshop.py): only english and schinese. Checked here, before steamworks.js is
// loaded or Steam is contacted, so a refused publish never reaches Steam.
const ALLOWED_LANGUAGES = ['english', 'schinese'];
function readTranslations() {
  const list = JSON.parse(readFileSync(need('translations'), 'utf8'));
  if (!Array.isArray(list) || list.length === 0
    || list.some((t) => !t.language || !t.title || !t.description)) {
    fail('--translations must be a non-empty array of {language, title, description}');
  }
  for (const t of list) {
    if (!ALLOWED_LANGUAGES.includes(t.language)) {
      fail(`language ${t.language} is not allowed: only english and schinese are published (drop it from --translations)`);
    }
  }
  return list;
}
const translations = command === 'publish' ? readTranslations() : undefined;

// Returns the package folder to load, or fails with what was tried.
function locateSteamworks() {
  if (process.env.STEAMWORKS_JS) {
    const folder = path.resolve(process.env.STEAMWORKS_JS);
    if (!existsSync(path.join(folder, 'index.js'))) fail(`no index.js in STEAMWORKS_JS (${folder})`);
    return folder;
  }
  let globalRoot = '';
  try {
    globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  } catch {
    // npm not on PATH: fall through to the message below
  }
  const folder = globalRoot ? path.join(globalRoot, '@hagicode', 'steamworks.js') : '';
  if (folder && existsSync(path.join(folder, 'index.js'))) return folder;
  fail('steamworks.js not found: install it with `npm i -g @hagicode/steamworks.js@0.1.4`, or set STEAMWORKS_JS to its package folder');
}
const folder = locateSteamworks();
const steamworks = createRequire(import.meta.url)(folder);
const steamworksVersion = JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')).version;

let client;
try {
  client = steamworks.init(appId);
} catch (e) {
  fail(`cannot reach the Steam client (start Steam and log in as the same OS user): ${e.message}`);
}
if (!client) fail('the Steam client did not initialise');
if (client.apps?.isSubscribedApp && !client.apps.isSubscribedApp(appId)) {
  fail(`this Steam account does not own app ${appId}`);
}
console.log(`steam user ${client.localplayer.getName()} (${client.localplayer.getSteamId().steamId64})`);
console.log(`steamworks.js ${steamworksVersion} from ${folder}`);

const finish = (code) => {
  if (typeof steamworks.shutdown === 'function') steamworks.shutdown();
  process.exit(code);
};

// steamworks.js starts its callback pump in init(); nothing here needs to call runCallbacks().
const json = (value) => JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));

// Reads the item as Steam shows it, including the additional previews (screenshots).
async function readItem(itemId) {
  const info = await client.workshop.getItem(BigInt(itemId), { includeAdditionalPreviews: true });
  if (!info) throw new Error(`Steam returned no item ${itemId}`);
  return {
    publishedFileId: info.publishedFileId,
    title: info.title,
    visibility: Object.keys(VISIBILITY).find((k) => VISIBILITY[k] === info.visibility) ?? info.visibility,
    timeUpdated: info.timeUpdated,
    tags: info.tags,
    additionalPreviews: (info.additionalPreviews ?? []).map((p) => ({
      originalFilename: p.originalFilename,
      urlOrVideoId: p.urlOrVideoId,
      previewType: PREVIEW_TYPES[p.previewType] ?? p.previewType,
    })),
    url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${info.publishedFileId}`,
  };
}

// One update submission; resolves with the callback data, and reports whether the account must accept the agreement.
function submit(itemId, details, label) {
  return new Promise((resolve, reject) => {
    client.workshop.updateItemWithCallback(
      itemId, details, appId,
      (data) => resolve({ agreement: Boolean(data?.needsToAcceptAgreement) }),
      (err) => reject(new Error(err?.message ?? String(err))),
      (p) => {
        if (p.total > 0n) process.stdout.write(`\r${label} status ${p.status}: ${p.progress}/${p.total} bytes   `);
      },
      200,
    );
  });
}

if (command === 'info') {
  try {
    console.log(`ITEM_INFO ${json(await readItem(item))}`);
    finish(0);
  } catch (e) {
    console.error(`error: ${e.message ?? e}`);
    finish(1);
  }
} else if (command === 'add-previews') {
  // Screenshot upload is in steamworks.js 0.1.4 and later (UgcUpdate.additionalPreviewPaths).
  const [major, minor, patch] = steamworksVersion.split('-')[0].split('.').map(Number);
  if (major === 0 && (minor < 1 || (minor === 1 && patch < 4))) {
    fail(`steamworks.js ${steamworksVersion} cannot add screenshots; install @hagicode/steamworks.js@0.1.4 or later`);
  }
  const files = JSON.parse(readFileSync(need('files'), 'utf8'));
  if (!Array.isArray(files) || files.length === 0 || files.some((f) => typeof f !== 'string' || !path.isAbsolute(f))) {
    fail('--files must be a non-empty JSON array of absolute image paths');
  }
  for (const f of files) if (!existsSync(f)) fail(`${f} does not exist`);
  const itemId = BigInt(item);
  try {
    const before = new Set((await readItem(itemId)).additionalPreviews.map((p) => p.originalFilename));
    const { agreement } = await submit(itemId, { additionalPreviewPaths: files }, 'screenshots');
    process.stdout.write('\n');
    const after = (await readItem(itemId)).additionalPreviews.map((p) => p.originalFilename);
    const missing = [];
    for (const f of files) {
      const name = path.basename(f);
      if (after.includes(name)) {
        if (!before.has(name)) console.log(`PREVIEW_ADDED ${name}`);
      } else {
        missing.push(name);
      }
    }
    if (agreement) console.log('NEEDS_AGREEMENT');
    if (missing.length > 0) {
      console.error(`error: Steam does not list ${missing.join(', ')} after the update. Either this steamworks.js build does not `
        + 'apply additionalPreviewPaths (check STEAMWORKS_JS against the source that adds it), or Steam refused the file.');
      finish(1);
    }
    console.log(`ITEM_INFO ${json(await readItem(itemId))}`);
    finish(0);
  } catch (e) {
    console.error(`\nerror: ${e.message ?? e}`);
    finish(1);
  }
} else if (command === 'remove-previews') {
  // Removing screenshots is in steamworks.js 0.1.5 and later (UgcUpdate.removeAdditionalPreviewIndexes).
  const [major, minor, patch] = steamworksVersion.split('-')[0].split('.').map(Number);
  if (major === 0 && (minor < 1 || (minor === 1 && patch < 5))) {
    fail(`steamworks.js ${steamworksVersion} cannot remove screenshots; install @hagicode/steamworks.js@0.1.5 or later`);
  }
  const indexes = JSON.parse(readFileSync(need('indexes'), 'utf8'));
  if (!Array.isArray(indexes) || indexes.length === 0 || indexes.some((i) => !Number.isInteger(i) || i < 0)) {
    fail('--indexes must be a non-empty JSON array of 0-based integers');
  }
  const itemId = BigInt(item);
  try {
    const before = (await readItem(itemId)).additionalPreviews;
    const outOfRange = indexes.filter((i) => i >= before.length);
    if (outOfRange.length > 0) {
      fail(`Steam lists ${before.length} additional preview(s) for item ${item}; there is no index ${outOfRange.join(', ')}`);
    }
    const names = indexes.map((i) => before[i].originalFilename);
    const { agreement } = await submit(itemId, { removeAdditionalPreviewIndexes: indexes }, 'remove screenshots');
    process.stdout.write('\n');
    const after = (await readItem(itemId)).additionalPreviews.map((p) => p.originalFilename);
    const still = names.filter((n) => after.includes(n));
    if (agreement) console.log('NEEDS_AGREEMENT');
    if (still.length > 0) {
      console.error(`error: Steam still lists ${still.join(', ')} after the update. Either this steamworks.js build does not apply `
        + 'removeAdditionalPreviewIndexes (install 0.1.5 or later), or Steam refused the change.');
      finish(1);
    }
    for (const n of names) console.log(`PREVIEW_REMOVED ${n}`);
    console.log(`ITEM_INFO ${json(await readItem(itemId))}`);
    finish(0);
  } catch (e) {
    console.error(`\nerror: ${e.message ?? e}`);
    finish(1);
  }
} else if (command === 'publish') {
  const content = path.resolve(need('content'));
  const preview = path.resolve(need('preview'));
  const visibilityName = opt('visibility') ?? 'public';
  const changeNote = opt('changenote') ?? '';
  if (!changeNote.trim()) fail('--changenote is required: a change note with a "中文：" line and an "English: " line');
  const tagsArg = opt('tags');
  const tags = tagsArg === undefined ? undefined : tagsArg.split(',').map((t) => t.trim()).filter(Boolean);
  if (!(visibilityName in VISIBILITY)) fail(`--visibility must be one of ${Object.keys(VISIBILITY).join(', ')}`);
  for (const p of [content, preview]) if (!existsSync(p)) fail(`${p} does not exist`);

  const [primary, ...others] = translations;
  let itemId;
  let agreement = false;
  try {
    if (item === '0') {
      const created = await client.workshop.createItem(appId);
      if (!created.itemId || created.itemId === 0n) fail('Steam did not create the item');
      itemId = created.itemId;
      agreement ||= Boolean(created.needsToAcceptAgreement);
      console.log(`ITEM_ID ${itemId}`);
    } else {
      itemId = BigInt(item);
    }

    const main = await submit(itemId, {
      title: primary.title,
      description: primary.description,
      language: primary.language,
      changeNote,
      previewPath: preview,
      contentPath: content,
      visibility: VISIBILITY[visibilityName],
      ...(tags === undefined ? {} : { tags }),
    }, `upload ${primary.language}`);
    agreement ||= main.agreement;
    console.log(`\nprimary language ${primary.language}: content, preview, title and description set`);

    for (const t of others) {
      const r = await submit(itemId, { title: t.title, description: t.description, language: t.language }, `text ${t.language}`);
      agreement ||= r.agreement;
      console.log(`\nlanguage ${t.language}: title and description set`);
    }
  } catch (e) {
    console.error(`\nerror: ${e.message}`);
    if (itemId !== undefined) console.error(`item ${itemId} exists on Steam; the next upload with this id is an update`);
    finish(1);
  }

  console.log(`DONE ${itemId}`);
  if (agreement) {
    console.log('NEEDS_AGREEMENT');
    console.log('The item stays hidden until the Workshop legal agreement is accepted on the Steam website with this account.');
  }
  console.log(`URL https://steamcommunity.com/sharedfiles/filedetails/?id=${itemId}`);
  finish(0);
} else if (command === 'set-preview') {
  if (item === '0') fail('--item must be an existing item (0 would create one; use `publish`)');
  const checkOnly = rest.includes('--check');
  const changeNote = opt('changenote') ?? '';
  const preview = path.resolve(need('preview'));
  if (!existsSync(preview)) fail(`${preview} does not exist`);
  if (!checkOnly && !changeNote.trim()) fail('--changenote is required: a change note with a "中文：" line and an "English: " line');
  try {
    const me = String(client.localplayer.getSteamId().steamId64);
    const before = await client.workshop.getItem(BigInt(item), {});
    if (!before) fail(`Steam returned no item ${item}`);
    const owner = String(before.owner?.steamId64 ?? '');
    const summary = {
      publishedFileId: String(before.publishedFileId), title: before.title, owner, visibility: before.visibility,
      consumerAppId: before.consumerAppId, preview: before.previewUrl ?? null,
    };
    if (owner !== me) fail(`item ${item} is owned by ${owner || 'someone else'}, not by the logged-in account ${me}; nothing was sent`);
    if (before.consumerAppId !== appId) fail(`item ${item} belongs to app ${before.consumerAppId}, not ${appId}; nothing was sent`);
    if (checkOnly) {
      console.log(`PREVIEW_CHECK ${json(summary)}`);
      finish(0);
    }
    const result = await submit(BigInt(item), { previewPath: preview, changeNote }, 'preview');
    const after = await client.workshop.getItem(BigInt(item), {});
    if (!after?.previewUrl || after.previewUrl === before.previewUrl) {
      fail(`Steam still lists the same preview for item ${item} after the update; check the item page before trying again`);
    }
    console.log(`PREVIEW_SET ${after.previewUrl}`);
    if (result.agreement) {
      console.log('NEEDS_AGREEMENT');
      console.log('The item stays hidden until the Workshop legal agreement is accepted on the Steam website with this account.');
    }
    console.log(`DONE ${item}`);
    console.log(`URL https://steamcommunity.com/sharedfiles/filedetails/?id=${item}`);
    finish(0);
  } catch (e) {
    console.error(`\nerror: ${e.message ?? e}`);
    finish(1);
  }
} else {
  fail('usage: steam-workshop.mjs publish|add-previews|remove-previews|set-preview|info --app <AppID> --item <id> [...]');
}
