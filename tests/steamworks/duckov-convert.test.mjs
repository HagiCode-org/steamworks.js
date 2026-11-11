// duckov-to-workshop.py: converts a Duckov assets/ folder into workshop/, and check counts description size in UTF-8 bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'steamworks-workshop-publish', 'scripts');
const py = (args) => execFileSync('python3', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function makeMod(descriptions) {
  const root = mkdtempSync(path.join(tmpdir(), 'duckov-convert-'));
  const mod = path.join(root, 'Mod');
  mkdirSync(path.join(mod, 'assets', 'description'), { recursive: true });
  writeFileSync(path.join(mod, 'assets', 'info.ini'), 'name = Mod\npublishedFileId = 3900000002\nversion = 0.1.0\n');
  writeFileSync(path.join(mod, 'assets', 'preview.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  for (const [lang, md] of Object.entries(descriptions)) writeFileSync(path.join(mod, 'assets', 'description', `${lang}.md`), md);
  const content = path.join(root, 'build', 'Mod');
  mkdirSync(content, { recursive: true });
  writeFileSync(path.join(content, 'Mod.dll'), 'x');
  return { mod, content };
}

test('converter writes workshop/ with the existing publishedFileId, BBCode and the H1 titles', () => {
  const { mod, content } = makeMod({
    en: '# Warm Dog\n\n## Features\n- **Warm**: keeps you warm\n- [Link](https://example.com)\n',
    zh: '# 暖狗\n\n文本。\n',
  });
  py([path.join(scripts, 'duckov-to-workshop.py'), mod, '--content', content]);
  const config = JSON.parse(readFileSync(path.join(mod, 'workshop', 'workshop.json'), 'utf8'));
  assert.equal(config.publishedFileId, '3900000002');
  assert.equal(config.primaryLanguage, 'english');
  assert.equal(config.languages.english.title, 'Warm Dog');
  assert.equal(config.languages.schinese.title, '暖狗');
  const en = readFileSync(path.join(mod, 'workshop', 'description.en.txt'), 'utf8');
  assert.match(en, /\[h1\]Warm Dog\[\/h1\]/);
  assert.match(en, /\[h2\]Features\[\/h2\]/);
  assert.match(en, /\[list\]\n\[\*\]\[b\]Warm\[\/b\]: keeps you warm/);
  assert.match(en, /\[url=https:\/\/example\.com\]Link\[\/url\]/);
  assert.ok(existsSync(path.join(mod, 'workshop', 'preview.png')));
});

test('converter keeps only en and zh, skips other locales with a skip line, and keeps publishedFileId', () => {
  const { mod, content } = makeMod({ en: '# Warm Dog\n\nText.\n', zh: '# 暖狗\n\n文本。\n', ja: '# 温かい犬\n\nText.\n' });
  const out = py([path.join(scripts, 'duckov-to-workshop.py'), mod, '--content', content]);
  assert.match(out, /^skip: ja \(not en or zh-CN; not uploaded\)$/m);
  const config = JSON.parse(readFileSync(path.join(mod, 'workshop', 'workshop.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.languages).sort(), ['english', 'schinese']);
  assert.equal(config.publishedFileId, '3900000002');
  assert.equal(existsSync(path.join(mod, 'workshop', 'description.ja.txt')), false, 'a skipped locale writes no file');
});

test('check counts description size in UTF-8 bytes, not characters', () => {
  // 2700 CJK characters are 2700 characters but 8100 bytes (3 bytes each): Steam refuses them
  const big = `# 测试\n\n${'汉'.repeat(2700)}\n`;
  const { mod, content } = makeMod({ en: '# Test\n\nShort.\n', zh: big });
  py([path.join(scripts, 'duckov-to-workshop.py'), mod, '--content', content]);
  let out = '';
  try { out = py([path.join(scripts, 'workshop.py'), 'check', mod]); } catch (e) { out = String(e.stdout) + String(e.stderr); }
  assert.match(out, /bytes of UTF-8; Steam accepts at most 8000 bytes/);
});
