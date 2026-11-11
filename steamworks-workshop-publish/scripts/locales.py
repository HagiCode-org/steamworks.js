"""Locale scope for Hagicode Steam Workshop metadata: English and Simplified Chinese only.

Single home for the allowlist, the locale aliases, the title separator and the title composition. workshop.py and
duckov-to-workshop.py import it from this folder. Standard library only.

    normalize(code)                        -> "english" | "schinese" | None (None = out of scope, e.g. zh-hant, german)
    normalize_titles(raw)                  -> ({steam code: segment}, problems) for the optional "titles" object
    compose(language, segments, fallback)  -> the title Steam stores for that language
    skip_line(code)                        -> the one-line report for a skipped locale
    change_note_problems(text)             -> [] when the change note is a short Chinese + English note, else the reasons
"""
from __future__ import annotations

import re

# Steam language code -> the name used in docs and file suffixes (en, zh-CN).
ALLOWED = {"english": "en", "schinese": "zh-CN"}
# The one place the bilingual title separator is defined.
SEPARATOR = " | "
# Every spelling that maps to an allowed Steam code. Anything else, including zh-hant, zh-tw and tchinese, is out of scope.
_ALIASES = {
    "en": "english", "english": "english",
    "zh": "schinese", "zh-cn": "schinese", "zh-hans": "schinese", "schinese": "schinese",
}


def normalize(code) -> str | None:
    """Return the allowed Steam code for a locale spelling, or None when the locale is out of scope."""
    if not isinstance(code, str):
        return None
    return _ALIASES.get(code.strip().lower().replace("_", "-"))


def normalize_titles(raw) -> tuple[dict[str, str], list[str]]:
    """Map the optional workshop.json "titles" object to {Steam code: segment}. Returns (segments, problems)."""
    if raw is None:
        return {}, []
    if not isinstance(raw, dict):
        return {}, ['"titles" must be an object such as {"en": "...", "zh-CN": "..."}']
    segments: dict[str, str] = {}
    problems: list[str] = []
    for key, value in raw.items():
        code = normalize(key)
        if code is None:
            problems.append(f'titles.{key} is not a supported language; use "en" and "zh-CN"')
            continue
        if code in segments:
            problems.append(f"titles has two keys for {code}")
            continue
        if not isinstance(value, str) or not value.strip():
            problems.append(f"titles.{key} must be a non-empty string")
            continue
        segments[code] = value.strip()
    return segments, problems


def compose(language: str, segments: dict[str, str] | None, fallback: str) -> str:
    """Return the title for an allowed Steam language.

    The Chinese entry puts the Chinese segment first and the English one second; the English entry does the reverse.
    A missing segment is left out, with no separator. Without segments, or for a language outside the allowlist (an
    explicit local request), the stored fallback title is returned unchanged.
    """
    if language not in ALLOWED or not segments:
        return fallback
    order = ("schinese", "english") if language == "schinese" else ("english", "schinese")
    parts = [segments[k] for k in order if segments.get(k)]
    return SEPARATOR.join(parts) if parts else fallback


def skip_line(code: str) -> str:
    """The report line for a locale that an upload or a generator leaves out."""
    return f"skip: {code} (not en or zh-CN; not uploaded)"


# The change note (Steam "change notes" of an update): one short text with the Chinese line first and the English line
# second. Steam takes one change note per submission, so both languages go into the same text.
CHANGE_NOTE_FORMAT = "中文：<中文说明>\nEnglish: <English description>"
CHANGE_NOTE_EXAMPLE = "中文：修复存档读取问题，优化加载速度。\nEnglish: Fixed a save-loading bug and improved load speed."
CHANGE_NOTE_MAX = 300  # characters in the whole note: a short note, this skill's rule (not a documented Steam limit)
_HAN = re.compile(r"[\u4e00-\u9fff]")
_ZH_LINE = re.compile(r"中文[:：]\s*(.*)")
_EN_LINE = re.compile(r"English[:：]\s*(.*)", re.IGNORECASE)
_PLACEHOLDER = re.compile(r"TODO|\{\{")


def change_note_problems(text) -> list[str]:
    """Return the reasons a change note is not acceptable; an empty list means it is.

    The note is exactly two non-empty lines: the first starts with "中文：" and has Chinese text, the second starts with
    "English:" and has English text and no Chinese. It is at most CHANGE_NOTE_MAX characters and has no placeholder.
    """
    if not isinstance(text, str):
        return ["the change note must be text"]
    body = text.strip()
    if not body:
        return [f"the change note is empty; write it as two lines: {CHANGE_NOTE_FORMAT}"]
    problems: list[str] = []
    if _PLACEHOLDER.search(body):
        problems.append("the change note still contains a placeholder (TODO or {{ }})")
    if len(body) > CHANGE_NOTE_MAX:
        problems.append(f"the change note is {len(body)} characters; keep it under {CHANGE_NOTE_MAX}")
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    if len(lines) != 2:
        problems.append(f"the change note must be exactly two lines ({CHANGE_NOTE_FORMAT}); it has {len(lines)}")
        return problems
    zh, en = _ZH_LINE.fullmatch(lines[0]), _EN_LINE.fullmatch(lines[1])
    if zh is None:
        problems.append('line 1 must start with "中文：" followed by the Chinese text')
    elif len(_HAN.findall(zh.group(1))) < 2:
        problems.append("the 中文 line needs Chinese text")
    if en is None:
        problems.append('line 2 must start with "English:" followed by the English text')
    elif len(re.findall(r"[A-Za-z]{2,}", en.group(1))) < 2 or _HAN.search(en.group(1)):
        problems.append("the English line needs English words and no Chinese characters")
    return problems
