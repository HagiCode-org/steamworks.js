import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import {
    buildPlan, byteLength, changeNoteProblems, composeTitle, globToRegExp, normalizeLanguage, normalizeTitles,
    itemPaths, validateItem, stageItem,
} from '../src/item.mjs'
import { makeItem, readMeta, writeMeta } from './helpers.mjs'

const validate = (item, meta = readMeta(item), opts) => validateItem(meta, itemPaths(item), opts)
const sample = 'Fixed a save-loading bug.'

test('language scope: english and schinese with their aliases; everything else is out of scope', () => {
    assert.equal(normalizeLanguage('en'), 'english')
    assert.equal(normalizeLanguage('English'), 'english')
    assert.equal(normalizeLanguage('zh-CN'), 'schinese')
    assert.equal(normalizeLanguage('zh_hans'), 'schinese')
    assert.equal(normalizeLanguage('french'), null)
    assert.equal(normalizeLanguage('zh-tw'), null)
    assert.equal(normalizeLanguage(undefined), null)
})

test('a french entry is listed as skipped and never becomes a language to send', () => {
    const item = makeItem('lang', {
        languages: {
            english: { title: 'My Mod', description: 'description.english.txt' },
            french: { title: 'Mon mod', description: 'description.english.txt' },
        },
    })
    const v = validate(item)
    assert.deepEqual(v.skipped, ['french'])
    assert.deepEqual(v.languages.map((l) => l.code), ['english'])
    assert.deepEqual(v.errors, [])
    const plan = buildPlan(readMeta(item), itemPaths(item), v, { visibility: 'public', changeNote: v.changeNote })
    assert.deepEqual(plan.languages.map((l) => l.language), ['english'])
    assert.match(plan.skipped[0], /^french/)
})

test('a description of 8001 or more UTF-8 bytes is refused, even if it has fewer characters', () => {
    const item = makeItem('bytes')
    // 2700 three-byte characters: 2700 characters, 8100 bytes
    writeFileSync(path.join(item, 'workshop', 'description.english.txt'), '中'.repeat(2700))
    const v = validate(item)
    assert.ok(v.errors.some((e) => /is 8100 bytes of UTF-8; Steam accepts at most 8000/.test(e)), v.errors.join('\n'))
})

test('a description of exactly 8000 bytes is accepted', () => {
    const item = makeItem('bytes-ok')
    writeFileSync(path.join(item, 'workshop', 'description.english.txt'), 'a'.repeat(8000))
    assert.deepEqual(validate(item).errors, [])
})

test('a title over 128 UTF-8 bytes is refused, and so is a composed title over the limit', () => {
    const long = validate(makeItem('title', {
        languages: { english: { title: 'a'.repeat(129), description: 'description.english.txt' } },
        primaryLanguage: 'english',
    }))
    assert.ok(long.errors.some((e) => /title is 129 bytes/.test(e)), long.errors.join('\n'))

    const composed = validate(makeItem('title-composed', {
        titles: { en: 'a'.repeat(60), 'zh-CN': '中'.repeat(30) },
    }))
    assert.ok(composed.errors.some((e) => /composed title is 153 bytes/.test(e)), composed.errors.join('\n'))
})

test('composed titles: Chinese first for schinese, English first for english, with the separator', () => {
    const segments = { english: 'My Mod', schinese: '我的模组' }
    assert.equal(composeTitle('schinese', segments, 'x'), '我的模组 | My Mod')
    assert.equal(composeTitle('english', segments, 'x'), 'My Mod | 我的模组')
    assert.equal(composeTitle('english', {}, 'stored'), 'stored')
    assert.equal(composeTitle('english', { english: 'Only English' }, 'stored'), 'Only English')
    assert.equal(byteLength('我'), 3)
})

test('titles with an unknown key or a duplicate are reported', () => {
    const { problems } = normalizeTitles({ fr: 'x', en: 'a', english: 'b' })
    assert.ok(problems.some((p) => /titles.fr is not a supported language/.test(p)))
    assert.ok(problems.some((p) => /two keys for english/.test(p)))
})

test('the change note must be two lines, Chinese first and English second, under 300 characters, with no placeholder', () => {
    assert.deepEqual(changeNoteProblems(`中文：修复存档读取问题。\nEnglish: ${sample}`), [])
    assert.ok(changeNoteProblems('Only one line').length > 0)
    assert.ok(changeNoteProblems(`English: ${sample}\n中文：修复存档读取问题。`).length > 0)
    assert.ok(changeNoteProblems(`中文：修复。\nEnglish: TODO write it`).some((p) => /placeholder/.test(p)))
    assert.ok(changeNoteProblems(`中文：修复。\nEnglish: ${'word '.repeat(70)}`).some((p) => /under 300/.test(p)))
    assert.ok(changeNoteProblems(`中文：修复。\nEnglish: 修复了问题`).some((p) => /no Chinese/.test(p)))
    assert.ok(changeNoteProblems('').length > 0)
})

test('placeholders in titles and descriptions are reported', () => {
    const item = makeItem('placeholder', {
        languages: { english: { title: 'TODO title', description: 'description.english.txt' } },
    })
    writeFileSync(path.join(item, 'workshop', 'description.english.txt'), 'TODO write it')
    const v = validate(item)
    assert.ok(v.errors.some((e) => /title is still a placeholder/.test(e)))
    assert.ok(v.errors.some((e) => /description.english.txt still contains a placeholder/.test(e)))
})

test('check reports every problem at once, not only the first', () => {
    const item = makeItem('many', {
        tags: 'not-a-list',
        changeNote: '',
        contentPath: 'no-such-folder',
        previewPath: 'missing.png',
        appId: 0,
    })
    const v = validate(item)
    assert.ok(v.errors.length >= 5, v.errors.join('\n'))
    assert.ok(v.errors.some((e) => /appId/.test(e)))
    assert.ok(v.errors.some((e) => /tags/.test(e)))
    assert.ok(v.errors.some((e) => /contentPath/.test(e)))
    assert.ok(v.errors.some((e) => /preview image missing.png/.test(e)))
    assert.ok(v.errors.some((e) => /changeNote/.test(e)))
})

test('an empty tag list is only a warning; a missing tag list is an error', () => {
    const empty = validate(makeItem('tags-empty', { tags: [] }))
    assert.deepEqual(empty.errors, [])
    assert.ok(empty.warnings.some((w) => /"tags" is empty/.test(w)))
    const missing = makeItem('tags-missing')
    const meta = readMeta(missing)
    delete meta.tags
    writeMeta(missing, meta)
    assert.ok(validate(missing).errors.some((e) => /"tags" is required/.test(e)))
})

test('include globs follow fnmatch: * crosses folders, ? is one character', () => {
    assert.ok(globToRegExp('*.dll').test('a.dll'))
    assert.ok(globToRegExp('*.dll').test('bin/sub/a.dll'))
    assert.ok(!globToRegExp('*.dll').test('a.dll.bak'))
    assert.ok(globToRegExp('data/?.json').test('data/a.json'))
    assert.ok(!globToRegExp('data/?.json').test('data/ab.json'))
    assert.ok(globToRegExp('file[1-3].txt').test('file2.txt'))
})

test('include limits the files that are staged, and a .git folder is refused', () => {
    const item = makeItem('include')
    const meta = readMeta(item)
    meta.include = ['*.dll']
    writeMeta(item, meta)
    const v = validate(item, meta)
    assert.deepEqual(v.files.map((f) => f.rel), ['mod.dll'])

    const git = makeItem('git')
    mkdirSync(path.join(git, 'build', '.git', 'objects'), { recursive: true })
    writeFileSync(path.join(git, 'build', '.git', 'objects', 'o'), 'x')
    assert.ok(validate(git).errors.some((e) => /\.git folder/.test(e)))
})

test('staging copies only the included files into .build and writes translations.json', () => {
    const item = makeItem('stage')
    const paths = itemPaths(item)
    const v = validate(item)
    const staged = stageItem(paths, v)
    assert.equal(staged.files, 2)
    const translations = JSON.parse(readFileSync(staged.translations, 'utf8'))
    assert.deepEqual(translations.map((t) => t.language), ['english', 'schinese'])
    assert.ok(path.relative(paths.metaDir, staged.contentDir).startsWith('.build'))
})

test('a folder that is not a Steam language is never a plan line', () => {
    const item = makeItem('plan')
    const meta = readMeta(item)
    const v = validate(item, meta)
    const plan = buildPlan(meta, itemPaths(item), v, { visibility: 'hidden', changeNote: v.changeNote })
    assert.equal(plan.visibility, 'hidden')
    assert.equal(plan.skipped.length, 0)
})

