import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLISH = path.join(ROOT, 'steamworks-workshop-publish');
const WORKSHOP = path.join(PUBLISH, 'scripts', 'workshop.py');
const hasPython = spawnSync('python3', ['--version']).status === 0;
const hasNode = spawnSync('node', ['--version']).status === 0;
const skip = !hasPython || !hasNode ? 'python3 and node are required' : false;

const FAKE_ITEM_ID = '3900000001';

// A stand-in for steamworks.js: records every call and behaves as FAKE_STEAM_MODE says.
const FAKE_STEAMWORKS = `
const fs = require('fs');
const path = require('path');
const mode = process.env.FAKE_STEAM_MODE || 'ok';
const statePath = process.env.FAKE_STEAM_STATE;
const readState = () => (statePath && fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { previews: [] });
const writeState = (s) => { if (statePath) fs.writeFileSync(statePath, JSON.stringify(s)); };
const log = (entry) => { if (process.env.FAKE_STEAM_LOG) fs.appendFileSync(process.env.FAKE_STEAM_LOG, JSON.stringify(entry) + '\\n'); };
const client = {
  localplayer: { getName: () => 'tester', getSteamId: () => ({ steamId64: '76561190000000000' }) },
  apps: { isSubscribedApp: () => true },
  workshop: {
    async createItem(appId) {
      log({ call: 'createItem', appId });
      return { itemId: BigInt(${FAKE_ITEM_ID}), needsToAcceptAgreement: mode === 'agreement' };
    },
    updateItemWithCallback(itemId, details, appId, ok, err) {
      log({
        call: 'update', itemId: String(itemId), language: details.language, title: details.title ?? null, visibility: details.visibility ?? null,
        changeNote: details.changeNote ?? null, tags: details.tags ?? null, contentPath: details.contentPath ?? null,
        additionalPreviewPaths: details.additionalPreviewPaths ?? null,
        removeAdditionalPreviewIndexes: details.removeAdditionalPreviewIndexes ?? null,
      });
      if (details.removeAdditionalPreviewIndexes && mode !== 'no-remove-support') {
        // Like steamworks.js: removes by 0-based index into the current list, highest index first.
        const s = readState();
        for (const i of [...new Set(details.removeAdditionalPreviewIndexes)].sort((a, b) => b - a)) s.previews.splice(i, 1);
        writeState(s);
      }
      if (details.additionalPreviewPaths && mode !== 'no-preview-support') {
        const s = readState();
        for (const f of details.additionalPreviewPaths) {
          const name = path.basename(f);
          if (!s.previews.some((x) => x.originalFilename === name)) {
            s.previews.push({ urlOrVideoId: 'https://steam.example/' + name, originalFilename: name, previewType: 0 });
          }
        }
        writeState(s);
      }
      setImmediate(() => {
        if (mode === 'fail-update') err(new Error("there isn't a network connection to steam or it failed to connect"));
        else ok({ itemId, needsToAcceptAgreement: mode === 'agreement' });
      });
    },
    async getItem(id, config) {
      log({ call: 'getItem', itemId: String(id), includeAdditionalPreviews: config?.includeAdditionalPreviews ?? false });
      const item = { publishedFileId: id, title: 'Fake title', visibility: 2, timeUpdated: 1700000000, tags: ['a'] };
      if (config?.includeAdditionalPreviews) item.additionalPreviews = readState().previews;
      return item;
    },
  },
};
module.exports = { init(appId) { log({ call: 'init', appId }); return client; }, shutdown() {} };
`;

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'steamworks-workshop-'));
  const fakeDir = path.join(base, 'steamworks.js');
  fs.mkdirSync(fakeDir);
  fs.writeFileSync(path.join(fakeDir, 'index.js'), FAKE_STEAMWORKS);
  fs.writeFileSync(path.join(fakeDir, 'package.json'), JSON.stringify({ name: '@hagicode/steamworks.js', version: '0.1.4' }));
  const item = path.join(base, 'MyMod');
  fs.mkdirSync(path.join(item, 'build'), { recursive: true });
  fs.writeFileSync(path.join(item, 'build', 'manifest.xml'), '<Manifest />\n');
  fs.writeFileSync(path.join(item, 'build', 'MyMod.dll'), 'dll');
  fs.writeFileSync(path.join(item, 'build', 'MyMod.pdb'), 'debug symbols');
  fs.writeFileSync(path.join(item, 'build', 'preview-source.psd'), 'source art');
  // The tags Steam declares for the fixture game, saved as a list so no test needs the network.
  const tagsFile = path.join(base, 'declared-tags.json');
  fs.writeFileSync(tagsFile, JSON.stringify(['Mod', 'Gameplay', 'UI']));
  return { base, fakeDir, item, tagsFile, log: path.join(base, 'steam.log'), state: path.join(base, 'steam-state.json') };
}

function run(args, env = {}, f) {
  const r = spawnSync('python3', [WORKSHOP, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env, STEAMWORKS_JS: f.fakeDir, FAKE_STEAM_LOG: f.log, FAKE_STEAM_STATE: f.state,
      WORKSHOP_TAGS_FILE: f.tagsFile, XDG_CACHE_HOME: path.join(f.base, 'cache'), ...env,
    },
  });
  return { code: r.status, out: r.stdout, err: r.stderr, text: r.stdout + r.stderr };
}

const calls = (f) => (fs.existsSync(f.log) ? fs.readFileSync(f.log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const readMeta = (f) => JSON.parse(fs.readFileSync(path.join(f.item, 'workshop', 'workshop.json'), 'utf8'));

const TITLES = { english: 'My mod', schinese: '我的模组' };
// The change note: two lines, Chinese first, then English (the rule is locales.change_note_problems).
const CHANGE_NOTE = '中文：修复存档读取问题，优化加载速度。\nEnglish: Fixed a save-loading bug and improved load speed.';

function fillIn(f) {
  const meta = readMeta(f);
  for (const code of Object.keys(meta.languages)) {
    fs.writeFileSync(path.join(f.item, 'workshop', meta.languages[code].description), `[h1]${TITLES[code]}[/h1]\n`);
    meta.languages[code].title = TITLES[code];
  }
  fs.writeFileSync(path.join(f.item, 'workshop', 'preview.png'), 'png-bytes');
  meta.contentPath = '../build';
  meta.include = ['manifest.xml', '*.dll'];
  meta.changeNote = CHANGE_NOTE;
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
}

test('init creates the storage layout and refuses to overwrite', { skip }, () => {
  const f = fixture();
  const first = run(['init', f.item, '--app-id', '4348910', '--languages', 'english,schinese'], {}, f);
  assert.equal(first.code, 0, first.text);
  const meta = readMeta(f);
  assert.equal(meta.appId, 4348910);
  assert.equal(meta.publishedFileId, '0');
  assert.equal(meta.visibility, 'public', 'new items are public by default');
  assert.equal(meta.primaryLanguage, 'english');
  assert.ok(fs.existsSync(path.join(f.item, 'workshop', 'description.schinese.txt')));
  assert.ok(fs.readFileSync(path.join(f.item, 'workshop', '.gitignore'), 'utf8').includes('.build/'));
  const again = run(['init', f.item, '--app-id', '4348910'], {}, f);
  assert.equal(again.code, 1);
  assert.match(again.err, /never overwrites/);
});

test('check rejects the template until placeholders and contentPath are filled in', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  const r = run(['check', f.item], {}, f);
  assert.equal(r.code, 1);
  assert.match(r.err, /placeholder/);
  assert.match(r.err, /contentPath/);
});

test('pack stages only the included files and writes translations with the primary language first', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english,schinese'], {}, f);
  fillIn(f);
  const r = run(['pack', f.item], {}, f);
  assert.equal(r.code, 0, r.text);
  const staged = fs.readdirSync(path.join(f.item, 'workshop', '.build', 'content')).sort();
  assert.deepEqual(staged, ['MyMod.dll', 'manifest.xml']);
  const texts = JSON.parse(fs.readFileSync(path.join(f.item, 'workshop', '.build', 'translations.json'), 'utf8'));
  assert.deepEqual(texts.map((t) => t.language), ['english', 'schinese']);
  assert.equal(texts[1].title, '我的模组');
});

test('the change note is required: check, pack and upload refuse a missing or one-language note and send nothing', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english,schinese'], {}, f);
  fillIn(f);
  const meta = readMeta(f);
  meta.changeNote = '';
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  const empty = run(['check', f.item], {}, f);
  assert.equal(empty.code, 1);
  assert.match(empty.err, /changeNote.*empty/);
  assert.equal(run(['pack', f.item], {}, f).code, 1);
  assert.equal(run(['upload', f.item, '--yes'], {}, f).code, 1);

  // With a valid stored note, a --changenote override is checked on its own.
  meta.changeNote = CHANGE_NOTE;
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  for (const note of ['Fixed a save bug and more', '中文：修复存档读取问题', 'English: Fixed bugs\n中文：修复问题', 'x'.repeat(301)]) {
    const r = run(['upload', f.item, '--yes', '--changenote', note], {}, f);
    assert.equal(r.code, 1, `refused: ${note.slice(0, 20)}`);
    assert.match(r.err, /change note for this upload/);
  }
  assert.equal(calls(f).length, 0, 'nothing reached Steam');
  assert.equal(readMeta(f).publishedFileId, '0');
});

test('a bilingual --changenote replaces the stored note for that upload only', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  const override = '中文：更新了物品说明。\nEnglish: Updated the item description.';
  const r = run(['upload', f.item, '--yes', '--changenote', override], {}, f);
  assert.equal(r.code, 0, r.text);
  const update = calls(f).find((x) => x.call === 'update');
  assert.equal(update.changeNote, override);
  assert.equal(readMeta(f).changeNote, CHANGE_NOTE, 'workshop.json keeps its own note');
});

test('check refuses a .git folder inside the upload', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  fs.mkdirSync(path.join(f.item, 'build', '.git'));
  fs.writeFileSync(path.join(f.item, 'build', '.git', 'HEAD'), 'ref');
  const { include, ...rest } = readMeta(f);  // no include list: every file, including .git, would be uploaded
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(rest, null, 2));
  const r = run(['check', f.item], {}, f);
  assert.equal(r.code, 1);
  assert.match(r.err, /\.git folder/);
});

test('upload without --yes sends nothing and changes nothing', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english,schinese'], {}, f);
  fillIn(f);
  const r = run(['upload', f.item], {}, f);
  assert.equal(r.code, 0, r.text);
  assert.match(r.out, /dry run: nothing was sent/);
  assert.equal(calls(f).length, 0);
  assert.equal(readMeta(f).publishedFileId, '0');
});

test('first upload creates the item, saves its id at once, and a second upload only updates it', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english,schinese'], {}, f);
  fillIn(f);
  const first = run(['upload', f.item, '--yes', '--changenote', CHANGE_NOTE], {}, f);
  assert.equal(first.code, 0, first.text);
  assert.equal(readMeta(f).publishedFileId, FAKE_ITEM_ID);
  assert.match(first.out, /saved publishedFileId/);
  let c = calls(f);
  assert.equal(c.filter((x) => x.call === 'createItem').length, 1);
  const updates = c.filter((x) => x.call === 'update');
  assert.deepEqual(updates.map((u) => u.language), ['english', 'schinese']);
  assert.equal(updates[0].visibility, 0, 'the first upload is public by default');
  assert.equal(updates[0].changeNote, CHANGE_NOTE, 'the bilingual note is sent with the primary language');
  assert.equal(updates[1].changeNote, null, 'the text-only update carries no change note');
  assert.match(first.out, new RegExp(`URL https://steamcommunity.com/sharedfiles/filedetails/\\?id=${FAKE_ITEM_ID}`));

  fs.rmSync(f.log, { force: true });
  const second = run(['upload', f.item, '--yes', '--visibility', 'hidden'], {}, f);
  assert.equal(second.code, 0, second.text);
  c = calls(f);
  assert.equal(c.filter((x) => x.call === 'createItem').length, 0, 'an existing id must never create a second item');
  assert.ok(c.filter((x) => x.call === 'update').every((u) => u.itemId === FAKE_ITEM_ID));
  assert.equal(readMeta(f).publishedFileId, FAKE_ITEM_ID);
  assert.equal(c.filter((x) => x.call === 'update')[0].visibility, 2, 'the private test sends Steam private');
  assert.equal(readMeta(f).visibility, 'public', 'the override applies to that upload only');
});

test('a failed upload keeps the item id and says to run the same command again', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  const r = run(['upload', f.item, '--yes'], { FAKE_STEAM_MODE: 'fail-update' }, f);
  assert.equal(r.code, 1);
  assert.equal(readMeta(f).publishedFileId, FAKE_ITEM_ID, 'the created item id must survive the failure');
  assert.match(r.err, /run the same command again/);

  fs.rmSync(f.log, { force: true });
  const retry = run(['upload', f.item, '--yes'], {}, f);
  assert.equal(retry.code, 0, retry.text);
  assert.equal(calls(f).filter((x) => x.call === 'createItem').length, 0);
});

test('the Workshop agreement prompt is reported', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  const r = run(['upload', f.item, '--yes'], { FAKE_STEAM_MODE: 'agreement' }, f);
  assert.equal(r.code, 0, r.text);
  assert.match(r.out, /NEEDS_AGREEMENT/);
  assert.match(r.text, /legal agreement/);
});

test('status --remote reads the stored item from Steam', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  const meta = readMeta(f);
  meta.publishedFileId = FAKE_ITEM_ID;
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  const r = run(['status', f.item, '--remote'], {}, f);
  assert.equal(r.code, 0, r.text);
  const info = JSON.parse(r.out.match(/ITEM_INFO (.*)/)[1]);
  assert.equal(info.publishedFileId, FAKE_ITEM_ID);
  assert.equal(info.title, 'Fake title');
  assert.equal(info.visibility, 'hidden');
});

test('upload fails clearly when steamworks.js is neither configured nor installed globally', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  // Only node is on PATH, so `npm root -g` cannot find the globally installed package. Nothing reaches Steam.
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'steamworks-node-only-'));
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  const python = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).stdout.trim();
  fs.symlinkSync(python, path.join(bin, 'python3'));
  const env = { ...process.env, PATH: bin, FAKE_STEAM_LOG: f.log };
  delete env.STEAMWORKS_JS;
  const r = spawnSync('python3', [WORKSHOP, 'upload', f.item, '--yes'], { encoding: 'utf8', env });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /npm i -g @hagicode\/steamworks\.js@0\.1\.4/);
  assert.equal(readMeta(f).publishedFileId, '0');
  assert.equal(calls(f).length, 0);
});

test('the shipped skill has no project data and no hard-coded user paths', () => {
  for (const file of ['scripts/workshop.py', 'scripts/steam-workshop.mjs', 'SKILL.md', 'references/item-layout.md']) {
    const text = fs.readFileSync(path.join(PUBLISH, file), 'utf8');
    assert.doesNotMatch(text, /\/home\/[^/\s'"]+\/|Stonlen|Probably Stolen|ducky-cli/i, `${file} must stay generic`);
  }
});

const setRemoteId = (f) => {
  const meta = readMeta(f);
  meta.publishedFileId = FAKE_ITEM_ID;
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
};
const updates = (f) => calls(f).filter((x) => x.call === 'update');

test('tags are sent with the primary update, and an empty list clears them', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  const meta = readMeta(f);
  meta.tags = ['Mod', 'Gameplay'];
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  const r = run(['upload', f.item, '--yes'], {}, f);
  assert.equal(r.code, 0, r.text);
  assert.deepEqual(updates(f)[0].tags, ['Mod', 'Gameplay']);

  fs.rmSync(f.log, { force: true });
  meta.tags = [];
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  assert.equal(run(['upload', f.item, '--yes'], {}, f).code, 0);
  assert.deepEqual(updates(f)[0].tags, [], 'an explicit empty list is sent, so Steam clears the tags');
});

test('init writes an empty tags list, and check reports it as a warning until the game tags are set', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  assert.deepEqual(readMeta(f).tags, []);
  fillIn(f);
  const r = run(['check', f.item], {}, f);
  assert.equal(r.code, 0, r.text);
  assert.match(r.out, /^warning: "tags" is empty/m);
});

test('a workshop.json without a tags key stops before Steam is called', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  const meta = readMeta(f);
  delete meta.tags;
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  const r = run(['upload', f.item, '--yes'], {}, f);
  assert.equal(r.code, 1);
  assert.match(r.err, /"tags" is required/);
  assert.equal(calls(f).length, 0, 'no Steam call may happen when tags are missing');
});

test('a tag Steam does not declare for the game stops check, pack and upload before Steam is called', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  const meta = readMeta(f);
  meta.tags = ['Mod', 'Quest'];
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  for (const args of [['check'], ['pack'], ['upload', '--yes']]) {
    const r = run([args[0], f.item, ...args.slice(1)], {}, f);
    assert.equal(r.code, 1, `${args.join(' ')}: ${r.text}`);
    assert.match(r.err, /tags Quest are not Workshop tags Steam declares for app 4348910/);
  }
  assert.equal(calls(f).length, 0);
});

test('the tags command prints the declared list and the item tags, read-only', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  const r = run(['tags', f.item], {}, f);
  assert.equal(r.code, 0, r.text);
  assert.match(r.out, /^app 4348910: 3 Workshop tag\(s\) declared by Steam/m);
  assert.match(r.out, /^ {2}Gameplay$/m);
  assert.match(r.out, /^workshop\.json tags: \(none\)$/m);
  assert.equal(calls(f).length, 0);
});

test('an unreadable tag source stops check with the reason, and a missing override file is an error', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  // No override and no cache: the Workshop page is the only source, and it cannot be reached.
  const offline = run(['check', f.item], { WORKSHOP_TAGS_FILE: '', WORKSHOP_BROWSE_URL: 'http://127.0.0.1:9/' }, f);
  assert.equal(offline.code, 1);
  assert.match(offline.err, /cannot check the tags: the Workshop page for app 4348910 could not be read/);
  const missing = run(['check', f.item], { WORKSHOP_TAGS_FILE: path.join(f.base, 'nope.json') }, f);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /WORKSHOP_TAGS_FILE .* cannot be read/);
});

test('an older cached tag list is used with a note when the Workshop page cannot be read', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  const cacheDir = path.join(f.base, 'cache', 'steamworks-workshop-publish');
  fs.mkdirSync(cacheDir, { recursive: true });
  const threeDaysAgo = Date.now() / 1000 - 3 * 24 * 3600;
  fs.writeFileSync(path.join(cacheDir, 'declared-tags-4348910.json'),
    JSON.stringify({ app_id: 4348910, url: 'saved', fetched_at: threeDaysAgo, tags: ['Mod', 'Gameplay'] }));
  const meta = readMeta(f);
  meta.tags = ['Mod'];
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  const r = run(['check', f.item], { WORKSHOP_TAGS_FILE: '', WORKSHOP_BROWSE_URL: 'http://127.0.0.1:9/' }, f);
  assert.equal(r.code, 0, r.text);
  assert.match(r.out, /warning: the Workshop page could not be read .*using the tag list saved 72 hour/);
});

test('the Workshop tag parser reads the Ready to use list from a page, raw or escaped', () => {
  const page = '{"declaredTags":{"guide_tags":[],"readytouse_tags":[{"name":"","tags":[{"name":"Mod"},{"name":"UI"}]}]}}';
  const escaped = JSON.stringify(page).slice(1, -1); // the form the page takes inside a JavaScript string
  const script = `import json,sys; sys.path.insert(0, ${JSON.stringify(path.join(PUBLISH, 'scripts'))});
import workshop_tags as w
print(json.dumps([w.parse_declared_tags(sys.argv[1]), w.parse_declared_tags(sys.argv[2])]))
try:
    w.parse_declared_tags('<html>no tag object</html>')
except ValueError as e:
    print('ERR', e)`;
  const r = spawnSync('python3', ['-I', '-c', script, page, escaped], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const [raw, esc] = JSON.parse(r.stdout.trim().split('\n')[0]);
  assert.deepEqual(raw, ['Mod', 'UI']);
  assert.deepEqual(esc, ['Mod', 'UI']);
  assert.match(r.stdout, /ERR the page has no declaredTags object/);
});

test('images list shows the screenshots on Steam next to the ones listed in workshop.json', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  setRemoteId(f);
  fs.mkdirSync(path.join(f.item, 'workshop', 'screens'));
  for (const n of ['shot1.png', 'shot2.png']) fs.writeFileSync(path.join(f.item, 'workshop', 'screens', n), 'img');
  const meta = readMeta(f);
  meta.screenshots = ['screens/shot1.png', 'screens/shot2.png'];
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(f.state, JSON.stringify({ previews: [{ originalFilename: 'shot1.png', urlOrVideoId: 'https://steam.example/shot1.png', previewType: 0 }] }));
  const r = run(['images', 'list', f.item], {}, f);
  assert.equal(r.code, 0, r.text);
  assert.match(r.out, /steam\s+shot1\.png\s+image/);
  assert.match(r.out, /local\s+screens\/shot2\.png\s+not uploaded/);
  assert.match(r.out, /local\s+screens\/shot1\.png\s+on Steam/);
});

test('images upload is a dry run without --yes, then adds only the missing screenshots', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  setRemoteId(f);
  fs.mkdirSync(path.join(f.item, 'workshop', 'screens'));
  for (const n of ['shot1.png', 'shot2.png']) fs.writeFileSync(path.join(f.item, 'workshop', 'screens', n), 'img');
  const meta = readMeta(f);
  meta.screenshots = ['screens/shot1.png', 'screens/shot2.png'];
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(f.state, JSON.stringify({ previews: [{ originalFilename: 'shot1.png', urlOrVideoId: 'x', previewType: 0 }] }));

  const dry = run(['images', 'upload', f.item], {}, f);
  assert.equal(dry.code, 0, dry.text);
  assert.match(dry.out, /dry run: nothing was sent/);
  assert.equal(updates(f).length, 0);

  const real = run(['images', 'upload', f.item, '--yes'], {}, f);
  assert.equal(real.code, 0, real.text);
  const sent = updates(f);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].contentPath, null, 'a screenshot update changes no content');
  assert.equal(sent[0].additionalPreviewPaths.length, 1);
  assert.ok(sent[0].additionalPreviewPaths[0].endsWith('shot2.png'));
  assert.match(real.out, /PREVIEW_ADDED shot2\.png/);
  assert.doesNotMatch(real.out, /PREVIEW_ADDED shot1\.png/);

  fs.rmSync(f.log, { force: true });
  const again = run(['images', 'upload', f.item, '--yes'], {}, f);
  assert.equal(again.code, 0, again.text);
  assert.match(again.out, /nothing to add/);
  assert.equal(updates(f).length, 0, 'a second run must not add duplicates');
});

test('images upload fails when the steamworks.js build does not add the screenshots', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  setRemoteId(f);
  fs.mkdirSync(path.join(f.item, 'workshop', 'screens'));
  fs.writeFileSync(path.join(f.item, 'workshop', 'screens', 'shot1.png'), 'img');
  const meta = readMeta(f);
  meta.screenshots = ['screens/shot1.png'];
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  const r = run(['images', 'upload', f.item, '--yes'], { FAKE_STEAM_MODE: 'no-preview-support' }, f);
  assert.equal(r.code, 1);
  assert.match(r.err, /additionalPreviewPaths/);
});

// Three screenshots on Steam and in workshop.json; `version` is the steamworks.js build the fake reports.
function screenshotFixture(f, version = '0.1.5') {
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  setRemoteId(f);
  fs.mkdirSync(path.join(f.item, 'workshop', 'screens'));
  for (const n of ['shot1.png', 'shot2.png', 'shot3.png']) fs.writeFileSync(path.join(f.item, 'workshop', 'screens', n), 'img');
  const meta = readMeta(f);
  meta.screenshots = ['screens/shot1.png', 'screens/shot2.png', 'screens/shot3.png'];
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(f.state, JSON.stringify({
    previews: ['shot1.png', 'shot2.png', 'shot3.png'].map((n) => ({ originalFilename: n, urlOrVideoId: 'https://steam.example/' + n, previewType: 0 })),
  }));
  fs.writeFileSync(path.join(f.fakeDir, 'package.json'), JSON.stringify({ name: '@hagicode/steamworks.js', version }));
}
const remainingOnSteam = (f) => JSON.parse(fs.readFileSync(f.state, 'utf8')).previews.map((p) => p.originalFilename);

test('images remove is a dry run without --yes, then removes one screenshot and keeps workshop.json in step', { skip }, () => {
  const f = fixture();
  screenshotFixture(f);
  const dry = run(['images', 'remove', f.item, 'shot2.png'], {}, f);
  assert.equal(dry.code, 0, dry.text);
  assert.match(dry.out, /to remove\s+\[1\] shot2\.png/);
  assert.match(dry.out, /dry run: nothing was sent/);
  assert.equal(updates(f).length, 0);

  const real = run(['images', 'remove', f.item, 'shot2.png', '--yes'], {}, f);
  assert.equal(real.code, 0, real.text);
  const sent = updates(f);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].removeAdditionalPreviewIndexes, [1]);
  assert.equal(sent[0].contentPath, null, 'a removal changes no content');
  assert.equal(sent[0].additionalPreviewPaths, null, 'a removal adds nothing');
  assert.match(real.out, /PREVIEW_REMOVED shot2\.png/);
  assert.deepEqual(remainingOnSteam(f), ['shot1.png', 'shot3.png']);
  assert.deepEqual(readMeta(f).screenshots, ['screens/shot1.png', 'screens/shot3.png'], 'the removed file leaves the listing');

  // The removed file is no longer on Steam, so a second run refuses it before any update.
  const again = run(['images', 'remove', f.item, 'shot2.png', '--yes'], {}, f);
  assert.equal(again.code, 1);
  assert.match(again.err, /Steam does not list shot2\.png/);
  assert.equal(updates(f).length, 1, 'the second run must not send an update');
});

test('images remove takes several names in one update and then `images upload` does not re-add them', { skip }, () => {
  const f = fixture();
  screenshotFixture(f);
  const real = run(['images', 'remove', f.item, 'shot1.png', 'shot3.png', '--yes'], {}, f);
  assert.equal(real.code, 0, real.text);
  const sent = updates(f);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].removeAdditionalPreviewIndexes, [0, 2]);
  assert.deepEqual(remainingOnSteam(f), ['shot2.png']);
  assert.deepEqual(readMeta(f).screenshots, ['screens/shot2.png']);

  const upload = run(['images', 'upload', f.item], {}, f);
  assert.equal(upload.code, 0, upload.text);
  assert.match(upload.out, /nothing to add/);
});

test('images remove refuses a file name Steam does not list, before any update', { skip }, () => {
  const f = fixture();
  screenshotFixture(f);
  const r = run(['images', 'remove', f.item, 'nope.png', '--yes'], {}, f);
  assert.equal(r.code, 1);
  assert.match(r.err, /Steam does not list nope\.png/);
  assert.equal(updates(f).length, 0);
});

test('images remove is refused by a steamworks.js build older than 0.1.5', { skip }, () => {
  const f = fixture();
  screenshotFixture(f, '0.1.4');
  const r = run(['images', 'remove', f.item, 'shot2.png', '--yes'], {}, f);
  assert.equal(r.code, 1);
  assert.match(r.err, /cannot remove screenshots; install @hagicode\/steamworks\.js@0\.1\.5/);
  assert.equal(updates(f).length, 0);
  assert.equal(readMeta(f).screenshots.length, 3, 'workshop.json is unchanged');
});

test('images remove fails when the steamworks.js build does not apply the removal, and keeps workshop.json', { skip }, () => {
  const f = fixture();
  screenshotFixture(f);
  const r = run(['images', 'remove', f.item, 'shot2.png', '--yes'], { FAKE_STEAM_MODE: 'no-remove-support' }, f);
  assert.equal(r.code, 1);
  assert.match(r.err, /does not apply removeAdditionalPreviewIndexes/);
  assert.deepEqual(remainingOnSteam(f), ['shot1.png', 'shot2.png', 'shot3.png']);
  assert.equal(readMeta(f).screenshots.length, 3, 'workshop.json still lists every screenshot');
});

test('check validates tags and screenshots (types, names, location)', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  fs.mkdirSync(path.join(f.item, 'workshop', 'a'));
  fs.mkdirSync(path.join(f.item, 'workshop', 'b'));
  fs.writeFileSync(path.join(f.item, 'workshop', 'a', 'shot.png'), 'img');
  fs.writeFileSync(path.join(f.item, 'workshop', 'b', 'shot.png'), 'img');
  fs.writeFileSync(path.join(f.item, 'workshop', 'scene.bmp'), 'img');
  const meta = readMeta(f);
  meta.tags = 'hagi';
  meta.screenshots = ['a/shot.png', 'b/shot.png', 'scene.bmp', '../outside.png'];
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
  const r = run(['check', f.item], {}, f);
  assert.equal(r.code, 1);
  assert.match(r.err, /"tags" must be a list/);
  assert.match(r.err, /two screenshots are named shot\.png/);
  assert.match(r.err, /scene\.bmp: use/);
  assert.match(r.err, /\.\.\/outside\.png is missing or outside/);
});

// --- locale scope: english and schinese only, titles composed per language ----------------------------------------

// Writes exactly the given languages (key -> stored title) plus optional extra workshop.json fields.
function setLanguages(f, entries, extra = {}) {
  const meta = readMeta(f);
  meta.languages = {};
  for (const [key, title] of Object.entries(entries)) {
    const file = `description.${key}.txt`;
    fs.writeFileSync(path.join(f.item, 'workshop', file), `[h1]${title}[/h1]\n`);
    meta.languages[key] = { title, description: file };
  }
  fs.writeFileSync(path.join(f.item, 'workshop', 'preview.png'), 'png-bytes');
  meta.contentPath = '../build';
  meta.include = ['manifest.xml', '*.dll'];
  meta.changeNote = CHANGE_NOTE;
  Object.assign(meta, extra);
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
}
const staged = (f) => JSON.parse(fs.readFileSync(path.join(f.item, 'workshop', '.build', 'translations.json'), 'utf8'));
const SKIP_GERMAN = /^skip: german \(not en or zh-CN; not uploaded\)$/m;

test('only english and schinese are staged; an extra locale is skipped and its bad title does not fail the run', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english,schinese'], {}, f);
  setLanguages(f, { english: 'My mod', schinese: '我的模组', german: 'TODO title' });
  const r = run(['pack', f.item], {}, f);
  assert.equal(r.code, 0, r.text);
  assert.match(r.out, SKIP_GERMAN);
  assert.deepEqual(staged(f).map((t) => t.language), ['english', 'schinese']);
});

test('skip lines appear in check, pack and upload (dry run and --yes) without changing the exit code', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english,schinese'], {}, f);
  setLanguages(f, { english: 'My mod', schinese: '我的模组', german: 'Mein Mod' });
  for (const args of [['check'], ['pack'], ['upload'], ['upload', '--yes']]) {
    const r = run([args[0], f.item, ...args.slice(1)], {}, f);
    assert.equal(r.code, 0, `${args.join(' ')}: ${r.text}`);
    assert.match(r.out, SKIP_GERMAN, args.join(' '));
  }
  const sent = calls(f).filter((x) => x.call === 'update').map((u) => u.language);
  assert.deepEqual(sent, ['english', 'schinese'], 'no update is sent for german');
  const plan = run(['upload', f.item], {}, f);
  assert.equal(plan.code, 0, plan.text);
  assert.match(plan.out, /^languages  english \(primary\), schinese$/m, 'the plan lists only the allowed languages');

  const clean = fixture();
  run(['init', clean.item, '--app-id', '4348910', '--languages', 'english,schinese'], {}, clean);
  setLanguages(clean, { english: 'My mod', schinese: '我的模组' });
  const r = run(['check', clean.item], {}, clean);
  assert.equal(r.code, 0, r.text);
  assert.doesNotMatch(r.out, /skip:/, 'an item with only the two locales has no skip line');
});

test('titles are composed per language and workshop.json stays byte-identical', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910'], {}, f);
  setLanguages(f, { english: 'Stored EN', schinese: 'Stored ZH' }, { titles: { en: 'DOD: Blessings & Curses', 'zh-CN': '鸭神降临' } });
  const file = path.join(f.item, 'workshop', 'workshop.json');
  const before = fs.readFileSync(file);
  const check = run(['check', f.item], {}, f);
  assert.equal(check.code, 0, check.text);
  assert.match(check.out, /^title      schinese: 鸭神降临 \| DOD: Blessings & Curses$/m);
  assert.match(check.out, /^title      english: DOD: Blessings & Curses \| 鸭神降临$/m);
  const packed = run(['pack', f.item], {}, f);
  assert.equal(packed.code, 0, packed.text);
  const texts = staged(f);
  assert.equal(texts.find((t) => t.language === 'schinese').title, '鸭神降临 | DOD: Blessings & Curses');
  assert.equal(texts.find((t) => t.language === 'english').title, 'DOD: Blessings & Curses | 鸭神降临');
  assert.ok(fs.readFileSync(file).equals(before), 'workshop.json must be byte-identical after pack');
});

test('one title segment gives no separator, and an item without titles keeps its stored titles', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910'], {}, f);
  setLanguages(f, { english: 'Stored EN', schinese: 'Stored ZH' }, { titles: { en: 'DOD' } });
  assert.equal(run(['pack', f.item], {}, f).code, 0);
  for (const t of staged(f)) assert.doesNotMatch(t.title, / \| /, `${t.language} must have no separator`);

  const g = fixture();
  run(['init', g.item, '--app-id', '4348910'], {}, g);
  setLanguages(g, { english: 'Stored EN', schinese: 'Stored ZH' });
  assert.equal(run(['pack', g.item], {}, g).code, 0);
  assert.deepEqual(staged(g).map((t) => t.title), ['Stored EN', 'Stored ZH']);
});

test('a non-allowed primary, an item with no allowed locale, and an over-long composed title stop before any Steam call', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english,schinese'], {}, f);
  setLanguages(f, { english: 'My mod', schinese: '我的模组' }, { primaryLanguage: 'german' });
  const primary = run(['upload', f.item, '--yes'], {}, f);
  assert.equal(primary.code, 1);
  assert.match(primary.err, /"primaryLanguage" must be english or schinese/);

  const g = fixture();
  run(['init', g.item, '--app-id', '4348910', '--languages', 'english'], {}, g);
  setLanguages(g, { german: 'Mein Mod' }, { primaryLanguage: 'german' });
  const none = run(['upload', g.item, '--yes'], {}, g);
  assert.equal(none.code, 1);
  assert.match(none.err, /needs an english or schinese entry/);

  const h = fixture();
  run(['init', h.item, '--app-id', '4348910', '--languages', 'english,schinese'], {}, h);
  setLanguages(h, { english: 'My mod', schinese: '我的模组' }, { titles: { en: 'A'.repeat(70), 'zh-CN': 'B'.repeat(70) } });
  const long = run(['upload', h.item, '--yes'], {}, h);
  assert.equal(long.code, 1);
  assert.match(long.err, /the composed title is 143 characters; Steam accepts at most 128/);

  for (const x of [f, g, h]) assert.equal(calls(x).length, 0, 'the fake Steam log must show no call');
});

test('init defaults to english and schinese, accepts the aliases, and rejects other locales', { skip }, () => {
  const f = fixture();
  const def = run(['init', f.item, '--app-id', '4348910'], {}, f);
  assert.equal(def.code, 0, def.text);
  assert.deepEqual(Object.keys(readMeta(f).languages), ['english', 'schinese']);
  assert.equal(readMeta(f).primaryLanguage, 'english');

  const g = fixture();
  const alias = run(['init', g.item, '--app-id', '4348910', '--languages', 'en,zh-CN'], {}, g);
  assert.equal(alias.code, 0, alias.text);
  assert.deepEqual(Object.keys(readMeta(g).languages), ['english', 'schinese']);
  assert.ok(fs.existsSync(path.join(g.item, 'workshop', 'description.schinese.txt')));

  const h = fixture();
  const bad = run(['init', h.item, '--app-id', '4348910', '--languages', 'english,german'], {}, h);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /german: only english and schinese are supported/);
  assert.equal(fs.existsSync(path.join(h.item, 'workshop', 'workshop.json')), false, 'nothing is written when a code is rejected');
});

test('upload --yes sends english and schinese only, with composed titles; a second upload sends nothing for german', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910'], {}, f);
  setLanguages(f, { english: 'Stored EN', schinese: 'Stored ZH', german: 'Mein Mod' },
    { titles: { en: 'DOD: Blessings & Curses', 'zh-CN': '鸭神降临' } });
  const first = run(['upload', f.item, '--yes'], {}, f);
  assert.equal(first.code, 0, first.text);
  let sent = updates(f);
  assert.deepEqual(sent.map((u) => u.language), ['english', 'schinese']);
  assert.equal(sent[0].title, 'DOD: Blessings & Curses | 鸭神降临');
  assert.equal(sent[1].title, '鸭神降临 | DOD: Blessings & Curses');

  fs.rmSync(f.log, { force: true });
  const second = run(['upload', f.item, '--yes'], {}, f);
  assert.equal(second.code, 0, second.text);
  sent = updates(f);
  assert.deepEqual(sent.map((u) => u.language), ['english', 'schinese']);
  assert.ok(sent.every((u) => u.itemId === FAKE_ITEM_ID));
  assert.equal(calls(f).filter((x) => x.call === 'createItem').length, 0);
});

// --- the low-level caller refuses other languages (backstop behind workshop.py) -----------------------------------

const STEAM_SCRIPT = path.join(PUBLISH, 'scripts', 'steam-workshop.mjs');
function publishDirect(f, languages) {
  const translations = path.join(f.base, 'translations.json');
  fs.writeFileSync(translations, JSON.stringify(languages.map((language) => ({ language, title: `T ${language}`, description: 'D' }))));
  return spawnSync('node', [STEAM_SCRIPT, 'publish', '--app', '4348910', '--item', '0', '--content', path.join(f.item, 'build'),
    '--preview', path.join(f.item, 'build', 'manifest.xml'), '--translations', translations, '--changenote', CHANGE_NOTE], {
    encoding: 'utf8',
    env: { ...process.env, STEAMWORKS_JS: f.fakeDir, FAKE_STEAM_LOG: f.log, FAKE_STEAM_STATE: f.state },
  });
}

test('steam-workshop publish refuses a language other than english and schinese before any Steam call', { skip }, () => {
  const f = fixture();
  const refused = publishDirect(f, ['english', 'german']);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /language german is not allowed/);
  assert.equal(calls(f).length, 0, 'no init, createItem or update call may reach the fake Steam client');

  const ok = publishDirect(f, ['english', 'schinese']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.deepEqual(updates(f).map((u) => u.language), ['english', 'schinese']);
  assert.equal(calls(f).filter((x) => x.call === 'createItem').length, 1);
});

// ---- Workshop videos: YouTube links, listed in workshop.json, added on Steam by hand ----
function withVideos(f, videos) {
  const meta = readMeta(f);
  meta.videos = videos;
  fs.writeFileSync(path.join(f.item, 'workshop', 'workshop.json'), JSON.stringify(meta, null, 2));
}

test('check refuses a video that is a URL, a duplicate or untitled, and accepts a valid one', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  withVideos(f, [{ youtubeId: 'https://youtu.be/dQw4w9WgXcQ', title: 'x' }, { youtubeId: 'dQw4w9WgXcQ', title: '' }, { youtubeId: 'dQw4w9WgXcQ', title: 'y' }]);
  const bad = run(['check', f.item], {}, f);
  assert.notEqual(bad.code, 0);
  assert.match(bad.text, /11-character YouTube video id, not a URL/);
  assert.match(bad.text, /a title is required/);
  assert.match(bad.text, /listed twice/);
  withVideos(f, [{ youtubeId: 'dQw4w9WgXcQ', title: 'Demo' }]);
  const ok = run(['check', f.item], {}, f);
  assert.equal(ok.code, 0, ok.text);
});

test('videos list prints the YouTube link and, with --remote, which videos Steam already shows', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  setRemoteId(f);
  withVideos(f, [{ youtubeId: 'dQw4w9WgXcQ', title: 'Demo' }, { youtubeId: 'aaaaaaaaaaa', title: 'Second' }]);
  const local = run(['videos', 'list', f.item], {}, f);
  assert.equal(local.code, 0, local.text);
  assert.match(local.out, /dQw4w9WgXcQ\s+https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ\s+Demo/);
  assert.doesNotMatch(local.out, /on Steam/);
  fs.writeFileSync(f.state, JSON.stringify({ previews: [{ originalFilename: '', urlOrVideoId: 'dQw4w9WgXcQ', previewType: 1 }, { originalFilename: '', urlOrVideoId: 'zzzzzzzzzzz', previewType: 1 }] }));
  const remote = run(['videos', 'list', f.item, '--remote'], {}, f);
  assert.equal(remote.code, 0, remote.text);
  assert.match(remote.out, /dQw4w9WgXcQ .*Demo\s+on Steam/);
  assert.match(remote.out, /aaaaaaaaaaa .*Second\s+NOT on Steam/);
  assert.match(remote.out, /zzzzzzzzzzz\s+on Steam but not listed/);
});

test('the upload plan says videos are not part of the upload', { skip }, () => {
  const f = fixture();
  run(['init', f.item, '--app-id', '4348910', '--languages', 'english'], {}, f);
  fillIn(f);
  withVideos(f, [{ youtubeId: 'dQw4w9WgXcQ', title: 'Demo' }]);
  const r = run(['upload', f.item], {}, f);
  assert.equal(r.code, 0, r.text);
  assert.match(r.out, /videos\s+not part of this upload; Steam takes videos only as YouTube links/);
});
