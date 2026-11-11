import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS = [
  'steamworks-js',
  'steamworks-workshop-query',
  'steamworks-workshop-publish',
  'steamworks-workshop-update',
  'steamworks-workshop-client-state',
  'steamworks-workshop-stats',
];
const SUB_SKILLS = SKILLS.slice(1);
const IMPACT = /Read-only|Submits remote content|Changes account|local (state|files)|needs? (explicit )?confirmation/i;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const frontmatter = (text) => {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'SKILL.md must start with a frontmatter block');
  const fields = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([a-z-]+):\s*(.+)$/);
    if (field) fields[field[1]] = field[2].trim();
  }
  return fields;
};

test('each steamworks skill has a frontmatter name matching its folder and a description', () => {
  for (const skill of SKILLS) {
    const fields = frontmatter(read(`${skill}/SKILL.md`));
    assert.equal(fields.name, skill, `${skill}: name must match folder`);
    assert.ok(fields.description && fields.description.length > 80, `${skill}: description is too short`);
  }
});

test('the router links to every sub-skill', () => {
  const router = read('steamworks-js/SKILL.md');
  for (const sub of SUB_SKILLS) {
    assert.ok(router.includes(`../${sub}/SKILL.md`), `router must link ${sub}`);
  }
});

test('each sub-skill states its operation impact', () => {
  for (const sub of SUB_SKILLS) {
    assert.match(read(`${sub}/SKILL.md`), IMPACT, `${sub} must state impact`);
  }
});

test('relative links in the steamworks skills resolve', () => {
  const broken = [];
  for (const skill of SKILLS) {
    const file = `${skill}/SKILL.md`;
    for (const match of read(file).matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/.test(match[1])) continue;
      if (!fs.existsSync(path.resolve(ROOT, path.dirname(file), match[1]))) broken.push(`${file} -> ${match[1]}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('the publish skill routes every upload through workshop.py and documents the locale scope and titles', () => {
  const skill = read('steamworks-workshop-publish/SKILL.md');
  const layout = read('steamworks-workshop-publish/references/item-layout.md');
  assert.match(skill, /single route to Steam|single upload route/);
  assert.match(skill, /`workshop\.py upload`/);
  assert.match(skill, /steam-workshop\.mjs` is the engine[\s\S]*?not run by\s+hand/);
  assert.match(skill, /skip: <code> \(not en or zh-CN; not uploaded\)/);
  assert.match(skill, /\*\*Descriptions are never mixed\.\*\*/);
  assert.doesNotMatch(skill, /Languages are never mixed/);
  assert.match(layout, /`titles`/);
  assert.match(layout, /128 characters/);
  const example = JSON.parse(layout.match(/```json\n([\s\S]*?)```/)[1]);
  assert.deepEqual(example.titles, { en: 'Item name', 'zh-CN': '物品名称' });
  assert.deepEqual(Object.keys(example.languages), ['english', 'schinese']);
});

test('the update checklist reads the skip lines and the composed titles from the dry run', () => {
  const update = read('steamworks-workshop-update/SKILL.md');
  assert.match(update, /`skip:` lines and `title` lines/);
  assert.match(update, /composed title/);
});

test('the AGENTS.md skill index lists every steamworks skill and its link', () => {
  // README.md is the published npm readme, so the developer index lives in AGENTS.md.
  const index = read('AGENTS.md');
  for (const skill of SKILLS) {
    assert.ok(index.includes(`[\`${skill}\`](${skill}/SKILL.md)`), `AGENTS.md must list ${skill}`);
  }
});
