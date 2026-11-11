import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPTS = path.join(ROOT, 'steamworks-workshop-publish', 'scripts');
const hasPython = spawnSync('python3', ['--version']).status === 0;
const skip = hasPython ? false : 'python3 is required';

// Runs a snippet against locales.py and returns the JSON it prints.
function locales(snippet) {
  const code = `import json, sys; sys.path.insert(0, ${JSON.stringify(SCRIPTS)}); import locales as L\n`
    + `print(json.dumps(${snippet}, ensure_ascii=False))`;
  const r = spawnSync('python3', ['-c', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('normalize maps every allowed spelling and nothing else', { skip }, () => {
  const out = locales(`{k: L.normalize(k) for k in ["en", "english", "EN", "zh", "zh-cn", "zh-CN", "zh_cn", "zh-hans", "schinese", "english "]}`);
  assert.deepEqual(out, {
    en: 'english', english: 'english', EN: 'english', zh: 'schinese', 'zh-cn': 'schinese', 'zh-CN': 'schinese',
    zh_cn: 'schinese', 'zh-hans': 'schinese', schinese: 'schinese', 'english ': 'english',
  });
  const outside = locales(`{k: L.normalize(k) for k in ["zh-hant", "zh-tw", "tchinese", "german", "de", "ja", "", None]}`);
  for (const [k, v] of Object.entries(outside)) assert.equal(v, null, `${k} must be out of scope`);
});

test('the allowlist is english as en and schinese as zh-CN', { skip }, () => {
  assert.deepEqual(locales('L.ALLOWED'), { english: 'en', schinese: 'zh-CN' });
  assert.equal(locales('L.SEPARATOR'), ' | ');
});

test('a Chinese entry starts with the Chinese segment, an English entry with the English one', { skip }, () => {
  const segs = { english: 'DOD: Blessings & Curses', schinese: '鸭神降临' };
  assert.equal(locales(`L.compose("schinese", ${JSON.stringify(segs)}, "stored")`), '鸭神降临 | DOD: Blessings & Curses');
  assert.equal(locales(`L.compose("english", ${JSON.stringify(segs)}, "stored")`), 'DOD: Blessings & Curses | 鸭神降临');
});

test('a single segment is used alone with no separator', { skip }, () => {
  assert.equal(locales('L.compose("schinese", {"schinese": "鸭神降临"}, "stored")'), '鸭神降临');
  assert.equal(locales('L.compose("english", {"english": "DOD"}, "stored")'), 'DOD');
});

test('without segments the stored title is kept, and an out-of-scope locale keeps its own title alone', { skip }, () => {
  assert.equal(locales('L.compose("english", None, "My mod")'), 'My mod');
  assert.equal(locales('L.compose("english", {}, "My mod")'), 'My mod');
  assert.equal(locales('L.compose("german", {"english": "DOD", "schinese": "鸭神降临"}, "Deutscher Titel")'), 'Deutscher Titel');
});

test('normalize_titles accepts the aliases and reports unknown keys', { skip }, () => {
  const ok = locales('L.normalize_titles({"en": " DOD ", "zh-CN": "鸭神降临"})');
  assert.deepEqual(ok, [{ english: 'DOD', schinese: '鸭神降临' }, []]);
  const bad = locales('L.normalize_titles({"german": "Titel", "zh-tw": "中文"})');
  assert.equal(bad[1].length, 2);
  assert.match(bad[1][0], /titles\.german is not a supported language/);
  assert.deepEqual(locales('L.normalize_titles(None)'), [{}, []]);
});

test('skip_line names the locale and says it is not uploaded', { skip }, () => {
  assert.equal(locales('L.skip_line("german")'), 'skip: german (not en or zh-CN; not uploaded)');
});

test('a change note is two lines: 中文 first with Chinese text, English second with English text', { skip }, () => {
  const ok = '中文：修复存档读取问题，优化加载速度。\nEnglish: Fixed a save-loading bug and improved load speed.';
  assert.deepEqual(locales(`L.change_note_problems(${JSON.stringify(ok)})`), []);
  assert.deepEqual(locales(`L.change_note_problems(${JSON.stringify(ok.replace('中文：', '中文:'))})`), []);
  const bad = {
    empty: '',
    'English only': 'Fixed a bug and more',
    'Chinese only': '中文：修复问题',
    'wrong order': 'English: Fixed bugs and more\n中文：修复问题',
    'Chinese line without Chinese': '中文：Fixed bugs\nEnglish: Fixed bugs and more',
    'English line with Chinese': '中文：修复问题\nEnglish: 修复 bugs and more',
    'three lines': '中文：修复问题\nEnglish: Fixed bugs\nEnglish: again',
    'placeholder': '中文：TODO\nEnglish: Fixed bugs and more',
    'too long': `中文：${'修复'.repeat(160)}\nEnglish: Fixed bugs and more`,
  };
  for (const [name, text] of Object.entries(bad)) {
    const problems = locales(`L.change_note_problems(${JSON.stringify(text)})`);
    assert.ok(problems.length > 0, `${name} must be refused`);
  }
});
