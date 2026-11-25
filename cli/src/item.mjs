// The per-item layout shared with the steamworks-workshop-publish skill: <item-dir>/workshop/workshop.json plus the
// description, preview and content files it names. Reading, validation and the upload plan live here; nothing in this
// module talks to Steam.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { CommandError } from './errors.mjs'

export const SCHEMA = 1
export const CONFIRM_ENV = 'WORKSHOP_WRITE_CONFIRMED'
export const MAX_TITLE_BYTES = 128
export const MAX_DESCRIPTION_BYTES = 8000
export const PREVIEW_MAX_BYTES = 1_000_000
export const PREVIEW_WARN_BYTES = 1024 * 1024
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif']
export const PREVIEW_NOTE = '中文：预览图已更新。\nEnglish: The preview was updated.'
// Steam's visibility values (UgcItemVisibility in client.d.ts), by the names workshop.json uses.
export const VISIBILITY = { public: 0, friends: 1, hidden: 2, unlisted: 3 }
export const hasOwnVisibility = (name) => typeof name === 'string' && hasOwn(VISIBILITY, name)
export const DEFAULT_LANGUAGES = ['english', 'schinese']

// Only english and schinese are uploaded. Every spelling below maps to one of them; anything else is skipped.
const LANGUAGE_ALIASES = {
    en: 'english',
    english: 'english',
    zh: 'schinese',
    'zh-cn': 'schinese',
    'zh-hans': 'schinese',
    schinese: 'schinese',
}
const TITLE_SEPARATOR = ' | '
const PLACEHOLDER = /TODO|\{\{/
const HAN = /[一-鿿]/
const ZH_LINE = /^中文[:：]\s*(.*)$/
const EN_LINE = /^English[:：]\s*(.*)$/i
export const CHANGE_NOTE_FORMAT = '中文：<中文说明>\nEnglish: <English description>'
export const CHANGE_NOTE_MAX_CHARS = 300

export const byteLength = (text) => Buffer.byteLength(text, 'utf8')
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

// The allowed Steam code for a language spelling, or null when the language is out of scope.
export function normalizeLanguage(code) {
    if (typeof code !== 'string') return null
    const key = code.trim().toLowerCase().replaceAll('_', '-')
    return hasOwn(LANGUAGE_ALIASES, key) ? LANGUAGE_ALIASES[key] : null
}

// The optional "titles" object: {"en": "...", "zh-CN": "..."}. Returns the segments by Steam code, and the problems.
export function normalizeTitles(raw) {
    const segments = {}
    const problems = []
    if (raw === undefined) return { segments, problems }
    if (!isPlainObject(raw)) {
        return { segments, problems: ['"titles" must be an object such as {"en": "...", "zh-CN": "..."}'] }
    }
    for (const [key, value] of Object.entries(raw)) {
        const code = normalizeLanguage(key)
        if (code === null) {
            problems.push(`titles.${key} is not a supported language; use "en" and "zh-CN"`)
        } else if (hasOwn(segments, code)) {
            problems.push(`titles has two keys for ${code}`)
        } else if (typeof value !== 'string' || !value.trim()) {
            problems.push(`titles.${key} must be a non-empty string`)
        } else {
            segments[code] = value.trim()
        }
    }
    return { segments, problems }
}

// The title Steam stores for one language. The Chinese entry reads Chinese first, the English entry English first.
export function composeTitle(code, segments, fallback) {
    if (!segments || Object.keys(segments).length === 0) return fallback
    const order = code === 'schinese' ? ['schinese', 'english'] : ['english', 'schinese']
    const parts = order.map((key) => segments[key]).filter(Boolean)
    return parts.length > 0 ? parts.join(TITLE_SEPARATOR) : fallback
}

// The reasons a change note is not acceptable; an empty list means it is. Same rule as the skill's locales.py.
export function changeNoteProblems(text) {
    if (typeof text !== 'string') return ['the change note must be text']
    const body = text.trim()
    if (!body) return [`the change note is empty; write it as two lines: ${CHANGE_NOTE_FORMAT}`]
    const problems = []
    if (PLACEHOLDER.test(body)) problems.push('the change note still contains a placeholder (TODO or {{ }})')
    const length = [...body].length
    if (length > CHANGE_NOTE_MAX_CHARS) problems.push(`the change note is ${length} characters; keep it under ${CHANGE_NOTE_MAX_CHARS}`)
    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length !== 2) {
        problems.push(`the change note must be exactly two lines (${CHANGE_NOTE_FORMAT}); it has ${lines.length}`)
        return problems
    }
    const zh = ZH_LINE.exec(lines[0])
    const en = EN_LINE.exec(lines[1])
    if (!zh) problems.push('line 1 must start with "中文：" followed by the Chinese text')
    else if ((zh[1].match(/[一-鿿]/g) ?? []).length < 2) problems.push('the 中文 line needs Chinese text')
    if (!en) problems.push('line 2 must start with "English:" followed by the English text')
    else if ((en[1].match(/[A-Za-z]{2,}/g) ?? []).length < 2 || HAN.test(en[1])) {
        problems.push('the English line needs English words and no Chinese characters')
    }
    return problems
}

export function itemPaths(itemDir) {
    const item = path.resolve(itemDir)
    const metaDir = path.join(item, 'workshop')
    return {
        item,
        metaDir,
        file: path.join(metaDir, 'workshop.json'),
        build: path.join(metaDir, '.build'),
    }
}

// Reads workshop/workshop.json. A missing or unreadable file stops the command with the reason.
export function readItemFile(itemDir) {
    const paths = itemPaths(itemDir)
    if (!existsSync(paths.file)) {
        throw new CommandError(`${paths.file} not found; run \`swjs init ${itemDir} --app-id <AppID>\` first`)
    }
    let meta
    try {
        meta = JSON.parse(readFileSync(paths.file, 'utf8'))
    } catch (error) {
        throw new CommandError(`${paths.file} is not valid JSON: ${error.message}`)
    }
    if (!isPlainObject(meta)) throw new CommandError(`${paths.file} must hold a JSON object`)
    return { meta, paths }
}

// Writes workshop.json through a temporary file, so a failed write never leaves a half-written file behind.
export function writeItemFile(paths, meta) {
    const temp = `${paths.file}.tmp`
    writeFileSync(temp, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
    renameSync(temp, paths.file)
}

// Records the id Steam returned for a new item. It is written once, and only over "0".
export function recordPublishedFileId(paths, publishedFileId) {
    const { meta } = readItemFile(paths.item)
    if (meta.publishedFileId !== '0') {
        throw new CommandError(`${paths.file} already holds publishedFileId ${meta.publishedFileId}; it is written only once, from "0"`)
    }
    meta.publishedFileId = String(publishedFileId)
    writeItemFile(paths, meta)
}

// Files under a folder, as paths relative to it with forward slashes, sorted.
function walk(root) {
    const found = []
    const visit = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const abs = path.join(dir, entry.name)
            if (entry.isDirectory()) visit(abs)
            else if (entry.isFile()) found.push({ abs, rel: path.relative(root, abs).split(path.sep).join('/') })
        }
    }
    visit(root)
    return found
}

// A glob as the skill's `include` uses it (fnmatch semantics: `*` also crosses `/`, `?` is one character, `[...]` a class).
export function globToRegExp(pattern) {
    let out = ''
    for (let i = 0; i < pattern.length; i += 1) {
        const ch = pattern[i]
        if (ch === '*') out += '.*'
        else if (ch === '?') out += '.'
        else if (ch === '[' && pattern.indexOf(']', i + 1) > i) {
            const end = pattern.indexOf(']', i + 1)
            let body = pattern.slice(i + 1, end)
            if (body.startsWith('!')) body = `^${body.slice(1)}`
            out += `[${body.replace(/\\/g, '\\\\')}]`
            i = end
        } else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
    return new RegExp(`^${out}$`)
}

// Checks the screenshot list (workshop.json "screenshots"). Steam lists screenshots by file name, so names must be unique.
export function validateScreenshots(meta, paths) {
    const errors = []
    const files = []
    const shots = meta.screenshots ?? []
    if (!Array.isArray(shots) || !shots.every((x) => typeof x === 'string' && x)) {
        return { errors: ['"screenshots" must be a list of image paths relative to workshop/'], files }
    }
    const names = new Set()
    for (const rel of shots) {
        const abs = path.resolve(paths.metaDir, rel)
        if (!isInside(paths.metaDir, abs) || !existsSync(abs) || !statSync(abs).isFile()) {
            errors.push(`screenshot ${rel} is missing or outside workshop/`)
            continue
        }
        if (!IMAGE_EXTENSIONS.includes(path.extname(abs).toLowerCase())) {
            errors.push(`screenshot ${rel}: use ${IMAGE_EXTENSIONS.join(', ')}`)
        }
        if (names.has(path.basename(abs))) errors.push(`two screenshots are named ${path.basename(abs)}; rename one`)
        names.add(path.basename(abs))
        files.push(abs)
    }
    return { errors, files }
}

const isInside = (folder, target) => target === folder || target.startsWith(folder + path.sep)

// Validates a whole item offline and reports every problem it finds, not only the first. `changeNote` overrides the
// stored note for one run (`update --changenote`). The result is what plan, pack and the write commands use.
export function validateItem(meta, paths, { changeNote } = {}) {
    const errors = []
    const warnings = []
    if (meta.schema !== SCHEMA) errors.push(`"schema" must be ${SCHEMA}`)
    if (!Number.isInteger(meta.appId) || meta.appId <= 0) {
        errors.push('"appId" must be the Steam AppID of the game (a positive whole number)')
    }
    if (typeof meta.publishedFileId !== 'string' || !/^\d+$/.test(meta.publishedFileId)) {
        errors.push('"publishedFileId" must be a string of digits: "0" until the first publish')
    }
    if (meta.visibility !== undefined && !hasOwnVisibility(meta.visibility)) {
        errors.push(`"visibility" must be one of ${Object.keys(VISIBILITY).join(', ')}`)
    }

    const tags = meta.tags
    if (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string' && t.trim())) {
        errors.push('"tags" is required: a list of tag names (use [] for none)')
    } else {
        const repeated = tags.filter((t, i) => tags.indexOf(t) !== i)
        if (repeated.length > 0) errors.push(`"tags" repeats ${[...new Set(repeated)].join(', ')}`)
        if (tags.length === 0) {
            warnings.push('"tags" is empty: the item will have no tags on Steam, and an update clears the tags it has')
        }
    }

    // Languages: only english and schinese take part; every other key is skipped and reported, never sent.
    const skipped = []
    const allowed = []
    const languages = meta.languages
    if (!isPlainObject(languages) || Object.keys(languages).length === 0) {
        errors.push('"languages" must map a Steam language code to {"title", "description"}')
    } else {
        for (const key of Object.keys(languages)) {
            const code = normalizeLanguage(key)
            if (code === null) skipped.push(key)
            else if (allowed.some((a) => a.code === code)) errors.push(`"languages" lists ${code} twice`)
            else allowed.push({ code, key, entry: languages[key] })
        }
        if (allowed.length === 0) errors.push('"languages" needs an english or schinese entry; other locales are never uploaded')
    }
    const primary = normalizeLanguage(meta.primaryLanguage)
    if (primary === null) errors.push('"primaryLanguage" must be english or schinese (en and zh-CN are accepted too)')
    else if (allowed.length > 0 && !allowed.some((a) => a.code === primary)) {
        errors.push('"primaryLanguage" must name one of the "languages" keys')
    }
    const { segments, problems: titleProblems } = normalizeTitles(meta.titles)
    errors.push(...titleProblems)

    const texts = []
    for (const { code, key, entry } of allowed) {
        if (!isPlainObject(entry)) {
            errors.push(`languages.${key} must be an object`)
            continue
        }
        const title = composeTitle(code, segments, entry.title)
        if (typeof title !== 'string' || !title.trim()) errors.push(`languages.${key}.title is empty`)
        else if (PLACEHOLDER.test(title)) errors.push(`languages.${key}.title is still a placeholder`)
        else if (byteLength(title) > MAX_TITLE_BYTES) {
            const what = Object.keys(segments).length > 0 ? 'composed title' : 'title'
            errors.push(`languages.${key}: the ${what} is ${byteLength(title)} bytes of UTF-8; Steam accepts at most ${MAX_TITLE_BYTES} bytes`)
        }
        const name = entry.description
        if (typeof name !== 'string' || !name) {
            errors.push(`languages.${key}.description must name a file under workshop/`)
            continue
        }
        const file = path.resolve(paths.metaDir, name)
        if (!isInside(paths.metaDir, file) || !existsSync(file) || !statSync(file).isFile()) {
            errors.push(`languages.${key}.description: workshop/${name} is missing or outside workshop/`)
            continue
        }
        const text = readFileSync(file, 'utf8')
        const size = byteLength(text)
        if (!text.trim()) errors.push(`workshop/${name} is empty`)
        else if (size > MAX_DESCRIPTION_BYTES) {
            errors.push(`workshop/${name} is ${size} bytes of UTF-8; Steam accepts at most ${MAX_DESCRIPTION_BYTES} bytes`)
        } else if (size > MAX_DESCRIPTION_BYTES * 0.9) {
            warnings.push(`workshop/${name} is ${size} bytes of UTF-8, close to the ${MAX_DESCRIPTION_BYTES}-byte limit`)
        }
        if (PLACEHOLDER.test(text)) errors.push(`workshop/${name} still contains a placeholder (TODO or {{ }})`)
        texts.push({ code, title: typeof title === 'string' ? title : '', description: text, file: name })
    }

    // The main preview. previewPath is relative to workshop/ and defaults to preview.png.
    const previewRel = meta.previewPath ?? 'preview.png'
    let previewFile = null
    if (typeof previewRel !== 'string' || !previewRel) errors.push('"previewPath" must be a file name relative to workshop/')
    else {
        previewFile = path.resolve(paths.metaDir, previewRel)
        if (!existsSync(previewFile) || !statSync(previewFile).isFile()) {
            errors.push(`preview image ${previewRel} is missing (previewPath is relative to workshop/)`)
        } else {
            if (!IMAGE_EXTENSIONS.includes(path.extname(previewFile).toLowerCase())) {
                errors.push(`preview ${previewRel}: use ${IMAGE_EXTENSIONS.join(', ')}`)
            }
            const size = statSync(previewFile).size
            if (size > PREVIEW_WARN_BYTES) warnings.push(`preview is ${size} bytes; keep it under 1 MB`)
        }
    }

    // The content folder and the files the upload would send.
    const files = []
    const contentPath = meta.contentPath
    if (typeof contentPath !== 'string' || !contentPath) {
        errors.push('"contentPath" must name the folder to upload, relative to workshop/')
    } else {
        const root = path.resolve(paths.metaDir, contentPath)
        if (!existsSync(root) || !statSync(root).isDirectory()) {
            errors.push(`contentPath ${contentPath} is not a folder (relative to workshop/)`)
        } else {
            const include = meta.include
            let patterns = null
            if (include !== undefined) {
                if (!Array.isArray(include) || !include.every((x) => typeof x === 'string')) {
                    errors.push('"include" must be a list of glob patterns relative to contentPath')
                } else patterns = include.map(globToRegExp)
            }
            for (const file of walk(root)) {
                if (patterns === null || patterns.some((re) => re.test(file.rel))) files.push(file)
            }
            if (files.length === 0) errors.push('no file in contentPath matches "include"')
            if (files.some((f) => f.rel.split('/').includes('.git'))) {
                errors.push('the upload would include a .git folder; exclude it with "include"')
            }
        }
    }

    const shots = validateScreenshots(meta, paths)
    errors.push(...shots.errors)

    const note = changeNote ?? meta.changeNote
    for (const problem of changeNoteProblems(note)) errors.push(`changeNote: ${problem}`)

    return {
        errors,
        warnings,
        files,
        skipped,
        languages: texts,
        primaryLanguage: primary,
        previewFile,
        screenshots: shots.files,
        changeNote: typeof note === 'string' ? note.trim() : '',
    }
}

// Stages the included files and translations.json in workshop/.build/ (the folder is regenerated on every pack).
export function stageItem(paths, validated) {
    rmSync(paths.build, { recursive: true, force: true })
    const contentDir = path.join(paths.build, 'content')
    mkdirSync(contentDir, { recursive: true })
    for (const file of validated.files) {
        const target = path.join(contentDir, file.rel)
        mkdirSync(path.dirname(target), { recursive: true })
        copyFileSync(file.abs, target)
    }
    const translations = path.join(paths.build, 'translations.json')
    const list = validated.languages.map(({ code, title, description }) => ({ language: code, title, description }))
    writeFileSync(translations, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
    return { contentDir, translations, files: validated.files.length }
}

// The upload plan: what a confirmed write would send. Built from the validated item, without contacting Steam.
export function buildPlan(meta, paths, validated, { visibility, changeNote }) {
    return {
        appId: meta.appId,
        publishedFileId: meta.publishedFileId,
        visibility,
        primaryLanguage: validated.primaryLanguage,
        languages: validated.languages.map((l) => ({
            language: l.code,
            title: l.title,
            descriptionBytes: byteLength(l.description),
        })),
        skipped: validated.skipped.map((key) => `${key} (not english or schinese; not sent)`),
        tags: meta.tags,
        changeNote,
        preview: validated.previewFile ? path.relative(paths.item, validated.previewFile) : null,
        contentFiles: validated.files.length,
    }
}

export function planLines(plan) {
    const lines = [
        `app ${plan.appId}, item ${plan.publishedFileId === '0' ? '(new)' : plan.publishedFileId}, visibility ${plan.visibility}`,
        `primary language ${plan.primaryLanguage}; ${plan.contentFiles} content file(s); preview ${plan.preview}`,
        `tags: ${plan.tags.length > 0 ? plan.tags.join(', ') : '(none)'}`,
    ]
    for (const l of plan.languages) {
        lines.push(`language ${l.language}: title "${l.title}" (${byteLength(l.title)} bytes), description ${l.descriptionBytes} bytes`)
    }
    for (const s of plan.skipped) lines.push(`skip: ${s}`)
    lines.push('change note:')
    for (const line of plan.changeNote.split('\n')) lines.push(`  ${line}`)
    return lines
}
