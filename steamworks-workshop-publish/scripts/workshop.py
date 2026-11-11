#!/usr/bin/env python3
"""workshop: create, check, pack, upload and inspect one Steam Workshop item (steamworks.js, no password).

    workshop.py init   <item-dir> --app-id N [--languages english,schinese]
    workshop.py check  <item-dir>
    workshop.py tags   <item-dir>
    workshop.py pack   <item-dir>
    workshop.py upload <item-dir> [--visibility V] [--changenote T] [--yes]   (T: the bilingual change note, required)
    workshop.py status <item-dir> [--remote]
    workshop.py images list   <item-dir>
    workshop.py images upload <item-dir> [--yes]
    workshop.py images remove <item-dir> <file-name>... [--yes]

<item-dir> is the folder that owns the item (for a mod: its own folder). Its metadata lives in <item-dir>/workshop/
(see references/item-layout.md). Nothing is submitted to Steam unless `upload` gets --yes.

The publishedFileId in workshop/workshop.json is written by `upload` only, and only once: from "0" to the id Steam
returns for a new item. After that every upload updates that item. Never edit or clear it by hand.

Only English (`english`) and Simplified Chinese (`schinese`) are uploaded. Every other language in workshop.json is skipped
with a `skip:` line and is never sent. `titles` (optional) holds the two title segments; the title Steam stores for each
language is composed from them (locales.py). `upload` is the one route to Steam: steam-workshop.mjs is its engine and is
not run by hand for publishing.

Every upload carries a change note: two lines, "中文：..." then "English: ..." (locales.py). It is required in
workshop.json ("changeNote") and checked by `check`, `pack` and `upload`; `--changenote` must pass the same rule.

Tags are per game and never chosen by this skill. workshop.json must name them in "tags" (an empty list for none), and
`check` (so also `pack` and `upload`) verifies every tag against the list Steam declares for the item's AppID
(workshop_tags.py). `tags <item-dir>` prints that list.

Standard library only; the Steam calls run in steam-workshop.mjs with Node.js. steamworks.js comes from STEAMWORKS_JS (a
package folder) or the global install of @hagicode/steamworks.js 0.1.4 or later (0.1.5 or later to remove screenshots).
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import locales  # the english / schinese scope, shared with duckov-to-workshop.py; sits next to this file
import workshop_tags  # the tags Steam declares per AppID; sits next to this file

SCHEMA = 1
VISIBILITY = {"public": 0, "friends": 1, "hidden": 2, "unlisted": 3}  # hidden = Steam "Private"
DEFAULT_VISIBILITY = "public"  # every new item is public unless the user asks for a private test
# Steam limits. The title is counted in characters. The description is counted in UTF-8 BYTES: Steam refuses a
# description over 8000 bytes with "a parameter is invalid" even when it is under 8000 characters (Cyrillic and CJK text
# is 2-3 bytes per character), which was observed on a real upload (8727 bytes failed, 7309 bytes passed).
MAX_TITLE, MAX_DESCRIPTION, PREVIEW_WARN = 128, 8000, 1024 * 1024
STEAM_SCRIPT = Path(__file__).resolve().with_name("steam-workshop.mjs")
TEMPLATES = Path(__file__).resolve().parent.parent / "templates"
PLACEHOLDER = re.compile(r"TODO|\{\{")
YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")  # a YouTube video id; Steam takes Workshop videos only as YouTube links
SCREENSHOT_EXT = {".png", ".jpg", ".jpeg", ".gif"}  # the image types this skill accepts for extra screenshots


class Fail(Exception):
    """An expected failure: printed without a traceback, exit code 1."""


# --------------------------------------------------------------------------- paths and metadata

def paths(item_dir: str) -> dict[str, Path]:
    item = Path(item_dir).resolve()
    meta_dir = item / "workshop"
    return {"item": item, "meta_dir": meta_dir, "file": meta_dir / "workshop.json", "build": meta_dir / ".build"}


def load(item_dir: str) -> tuple[dict, dict[str, Path]]:
    p = paths(item_dir)
    if not p["file"].is_file():
        raise Fail(f"{p['file']} not found; run `workshop.py init {item_dir} --app-id <AppID>` first")
    try:
        meta = json.loads(p["file"].read_text("utf-8"))
    except ValueError as e:
        raise Fail(f"{p['file']} is not valid JSON: {e}")
    if not isinstance(meta, dict):
        raise Fail(f"{p['file']} must hold a JSON object")
    return meta, p


def save(meta: dict, p: dict[str, Path]) -> None:
    tmp = p["file"].with_suffix(".json.tmp")
    tmp.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", "utf-8")
    os.replace(tmp, p["file"])


def is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


# --------------------------------------------------------------------------- locales (english and schinese only)

def select_locales(meta: dict) -> tuple[dict[str, tuple[str, object]], list[str], list[str]]:
    """Split "languages" into the allowed entries {Steam code: (key as written, entry)} and the skipped keys.

    Only english and schinese are uploaded; en, zh-CN and the other aliases count as those two (see locales.py).
    Returns (allowed, skipped keys, problems). Two keys for the same language are a problem.
    """
    languages = meta.get("languages")
    allowed: dict[str, tuple[str, object]] = {}
    skipped: list[str] = []
    problems: list[str] = []
    if not isinstance(languages, dict):
        return allowed, skipped, problems
    for key, entry in languages.items():
        code = locales.normalize(key)
        if code is None:
            skipped.append(key)
        elif code in allowed:
            problems.append(f"languages has both {allowed[code][0]} and {key}; they are the same language")
        else:
            allowed[code] = (key, entry)
    return allowed, skipped, problems


def title_for(entry: dict, code: str, segments: dict[str, str]) -> str:
    """The title Steam stores for one allowed language: composed from the titles segments, or the stored title."""
    stored = entry.get("title") if isinstance(entry, dict) else None
    title = locales.compose(code, segments, stored) if segments else stored
    return title.strip() if isinstance(title, str) else ""


def plan_languages(meta: dict) -> list[tuple[str, dict, str]]:
    """The allowed languages in upload order, primary first, as (Steam code, entry, title). Call after validation."""
    allowed, _skipped, _problems = select_locales(meta)
    segments, _ = locales.normalize_titles(meta.get("titles"))
    primary = locales.normalize(meta.get("primaryLanguage"))
    order = [primary] + [code for code in allowed if code != primary]
    return [(code, allowed[code][1], title_for(allowed[code][1], code, segments)) for code in order if code in allowed]


def print_skips(meta: dict) -> None:
    """One report line per locale that is left out. A skip is not an error and does not change the exit code."""
    _allowed, skipped, _problems = select_locales(meta)
    for key in skipped:
        print(locales.skip_line(key))


# --------------------------------------------------------------------------- validation

def validate(meta: dict, p: dict[str, Path], declared: list[str] | None = None) -> tuple[list[str], list[str], list[Path]]:
    """Return (errors, warnings, content files that would be uploaded).

    declared is the list of tags Steam declares for the AppID (see declared_for_item); None skips that comparison, and
    the shape of "tags" is still checked.
    """
    errors, warnings = [], []
    if meta.get("schema") != SCHEMA:
        errors.append(f"\"schema\" must be {SCHEMA}")
    if not is_int(meta.get("appId")) or meta.get("appId", 0) <= 0:
        errors.append("\"appId\" must be the positive Steam AppID of the game (no default is assumed)")
    if not re.fullmatch(r"\d+", str(meta.get("publishedFileId", ""))):
        errors.append("\"publishedFileId\" must be digits (\"0\" until the first upload creates the item)")
    if meta.get("visibility") not in VISIBILITY:
        errors.append(f"\"visibility\" must be one of {', '.join(VISIBILITY)}")
    if "changeNote" not in meta:
        errors.append("\"changeNote\" is required: " + locales.CHANGE_NOTE_FORMAT)
    else:
        errors.extend(f"\"changeNote\": {problem}" for problem in locales.change_note_problems(meta["changeNote"]))
    if "tags" not in meta:
        errors.append("\"tags\" is required: list the game's Workshop tags (see `workshop.py tags`), or [] for none")
    else:
        tags = meta["tags"]
        if not isinstance(tags, list) or not all(isinstance(x, str) and x and x == x.strip() for x in tags):
            errors.append("\"tags\" must be a list of tag names, each exactly as Steam writes it (no surrounding spaces)")
        else:
            repeated = sorted({x for x in tags if tags.count(x) > 1})
            if repeated:
                errors.append(f"\"tags\" repeats {', '.join(repeated)}")
            if not tags:
                warnings.append("\"tags\" is empty: the item will have no tags on Steam, and an upload clears the tags it has")
            if declared is not None:
                unknown = [x for x in tags if x not in declared]
                if unknown:
                    errors.append(f"tags {', '.join(unknown)} are not Workshop tags Steam declares for app {meta['appId']}; "
                                  f"`workshop.py tags {p['item']}` prints the ones it accepts")
    shots = meta.get("screenshots", [])
    if not isinstance(shots, list) or not all(isinstance(x, str) and x for x in shots):
        errors.append("\"screenshots\" must be a list of image paths relative to workshop/")
        shots = []
    seen_names: set[str] = set()
    for rel in shots:
        shot = (p["meta_dir"] / rel).resolve()
        if p["meta_dir"].resolve() not in shot.parents or not shot.is_file():
            errors.append(f"screenshot {rel} is missing or outside workshop/")
            continue
        if shot.suffix.lower() not in SCREENSHOT_EXT:
            errors.append(f"screenshot {rel}: use {', '.join(sorted(SCREENSHOT_EXT))}")
        if shot.name in seen_names:
            errors.append(f"two screenshots are named {shot.name}; Steam lists them by file name, so rename one")
        seen_names.add(shot.name)

    videos = meta.get("videos", [])
    if not isinstance(videos, list) or not all(isinstance(v, dict) for v in videos):
        errors.append("\"videos\" must be a list of {\"youtubeId\", \"title\"}")
        videos = []
    seen_videos: set[str] = set()
    for v in videos:
        vid = v.get("youtubeId")
        if not isinstance(vid, str) or not YOUTUBE_ID.match(vid):
            errors.append(f"video {vid!r}: youtubeId must be the 11-character YouTube video id, not a URL")
        elif vid in seen_videos:
            errors.append(f"video {vid} is listed twice")
        else:
            seen_videos.add(vid)
        if not isinstance(v.get("title"), str) or not v["title"].strip():
            errors.append(f"video {vid!r}: a title is required (it names the video in `videos list`)")

    languages = meta.get("languages")
    if not isinstance(languages, dict) or not languages:
        errors.append("\"languages\" must map a Steam language code to {\"title\", \"description\"}")
    # Only english and schinese take part; every other key was skipped by select_locales (reported by the caller).
    allowed, _skipped, problems = select_locales(meta)
    errors.extend(problems)
    if isinstance(languages, dict) and languages and not allowed:
        errors.append("\"languages\" needs an english or schinese entry; other locales are never uploaded")
    primary = locales.normalize(meta.get("primaryLanguage"))
    if primary is None:
        errors.append("\"primaryLanguage\" must be english or schinese (en and zh-CN are accepted too)")
    elif primary not in allowed:
        errors.append("\"primaryLanguage\" must name one of the \"languages\" keys")
    segments, title_problems = locales.normalize_titles(meta.get("titles"))
    errors.extend(title_problems)
    for code, (key, entry) in allowed.items():
        if not isinstance(entry, dict):
            errors.append(f"languages.{key} must be an object")
            continue
        title = title_for(entry, code, segments)
        if not title:
            errors.append(f"languages.{key}.title is empty")
        elif PLACEHOLDER.search(title):
            errors.append(f"languages.{key}.title is still a placeholder")
        elif len(title) > MAX_TITLE:
            what = "composed title" if segments else "title"
            errors.append(f"languages.{key}: the {what} is {len(title)} characters; Steam accepts at most {MAX_TITLE}")
        name = entry.get("description")
        if not isinstance(name, str) or not name:
            errors.append(f"languages.{key}.description must name a file under workshop/")
            continue
        desc = (p["meta_dir"] / name).resolve()
        if not desc.is_file() or p["meta_dir"].resolve() not in desc.parents:
            errors.append(f"languages.{key}.description: workshop/{name} is missing or outside workshop/")
            continue
        text = desc.read_text("utf-8")
        size = len(text.encode("utf-8"))
        if not text.strip():
            errors.append(f"workshop/{name} is empty")
        elif size > MAX_DESCRIPTION:
            errors.append(f"workshop/{name} is {size} bytes of UTF-8; Steam accepts at most {MAX_DESCRIPTION} bytes")
        elif size > MAX_DESCRIPTION * 0.9:
            warnings.append(f"workshop/{name} is {size} bytes of UTF-8, close to the {MAX_DESCRIPTION}-byte limit")
        if PLACEHOLDER.search(text):
            errors.append(f"workshop/{name} still contains a placeholder (TODO or {{{{ }}}})")

    preview = (p["meta_dir"] / meta.get("previewPath", "preview.png")).resolve()
    if not preview.is_file():
        errors.append(f"preview image {preview.relative_to(p['item']) if p['item'] in preview.parents else preview} is missing")
    elif preview.stat().st_size > PREVIEW_WARN:
        warnings.append(f"preview is {preview.stat().st_size} bytes; keep it under 1 MB")

    files: list[Path] = []
    content_path = meta.get("contentPath")
    if not isinstance(content_path, str) or not content_path:
        errors.append("\"contentPath\" must name the folder to upload, relative to workshop/")
    else:
        root = (p["meta_dir"] / content_path).resolve()
        if not root.is_dir():
            errors.append(f"contentPath {content_path} is not a folder (relative to workshop/)")
        else:
            include = meta.get("include")
            if include is not None and (not isinstance(include, list) or not all(isinstance(x, str) for x in include)):
                errors.append("\"include\" must be a list of glob patterns relative to contentPath")
                include = None
            for f in sorted(root.rglob("*")):
                if not f.is_file():
                    continue
                rel = f.relative_to(root).as_posix()
                if include is None or any(fnmatch.fnmatchcase(rel, pat) for pat in include):
                    files.append(f)
            if not files:
                errors.append("no file in contentPath matches \"include\"")
            if any(".git" in f.relative_to(root).parts for f in files):
                errors.append("the upload would include a .git folder; exclude it with \"include\"")
    return errors, warnings, files


def declared_for_item(meta: dict) -> tuple[list[str] | None, list[str]]:
    """The tags Steam declares for the item's AppID, and the notes to print with them.

    Returns (None, []) when appId is not a valid AppID: validate() reports that error itself. Stops when the list cannot
    be read at all (no page and no cache), because the tags could then not be checked.
    """
    app = meta.get("appId")
    if not is_int(app) or app <= 0:
        return None, []
    try:
        listing = workshop_tags.declared_tags(app)
    except workshop_tags.TagLookupError as e:
        raise Fail(f"cannot check the tags: {e}\n  the tags in workshop.json are checked against the list Steam declares "
                   f"for app {app}. Run again when steamcommunity.com loads, or set WORKSHOP_TAGS_FILE to a saved JSON list.")
    return listing.names, ([listing.note] if listing.note else [])


def check_or_fail(meta: dict, p: dict[str, Path]) -> tuple[list[str], list[Path]]:
    declared, notes = declared_for_item(meta)
    errors, warnings, files = validate(meta, p, declared)
    if errors:
        raise Fail("not ready for the Workshop:\n  - " + "\n  - ".join(errors))
    return notes + warnings, files


# --------------------------------------------------------------------------- commands

def cmd_init(args) -> None:
    p = paths(args.item_dir)
    if not p["item"].is_dir():
        raise Fail(f"{p['item']} is not a folder")
    if p["file"].exists():
        raise Fail(f"{p['file']} already exists; init never overwrites")
    codes: list[str] = []
    for raw in (c.strip() for c in args.languages.split(",")):
        if not raw:
            continue
        code = locales.normalize(raw)
        if code is None:
            raise Fail(f"--languages {raw}: only english and schinese are supported (en and zh-CN also work); "
                       "other locales are never uploaded")
        if code in codes:
            raise Fail(f"--languages lists {code} twice")
        codes.append(code)
    if not codes:
        raise Fail("--languages needs english, schinese or both")
    p["meta_dir"].mkdir(exist_ok=True)
    languages = {}
    for code in codes:
        name = f"description.{code}.txt"
        languages[code] = {"title": "TODO title", "description": name}
        shutil.copy2(TEMPLATES / "description.txt", p["meta_dir"] / name)
    meta = {
        "schema": SCHEMA,
        "appId": args.app_id,
        "publishedFileId": "0",
        "visibility": args.visibility,
        "primaryLanguage": codes[0],
        "languages": languages,
        "contentPath": "TODO folder to upload, relative to workshop/",
        "previewPath": "preview.png",
        "tags": [],  # set from `workshop.py tags`; the skill never picks tags, and an empty list is reported by check
        "changeNote": "",  # required: "中文：..." line, then "English: ..." line (checked by check, pack and upload)
    }
    save(meta, p)
    shutil.copy2(TEMPLATES / "gitignore", p["meta_dir"] / ".gitignore")
    print(f"created {p['meta_dir']}/ : workshop.json, description files for {', '.join(codes)}, .gitignore")
    print("next: set contentPath (and optionally include), write titles and descriptions, add preview.png, "
          "set \"tags\" from `workshop.py tags <item-dir>`, then `check`")


def cmd_check(args) -> None:
    meta, p = load(args.item_dir)
    print_skips(meta)
    declared, notes = declared_for_item(meta)
    errors, warnings, files = validate(meta, p, declared)
    for w in notes + warnings:
        print(f"warning: {w}")
    if errors:
        raise Fail("not ready for the Workshop:\n  - " + "\n  - ".join(errors))
    print(f"ok: appId {meta['appId']}, publishedFileId {meta['publishedFileId']}, visibility {meta['visibility']}, "
          f"{len(files)} file(s) to upload")
    print(f"tags       {', '.join(meta['tags']) or '(none)'}; each one checked against the {len(declared)} tags Steam declares")
    for code, _entry, title in plan_languages(meta):
        print(f"title      {code}: {title}")


def cmd_tags(args) -> None:
    """Print the tags Steam declares for the item's AppID (read-only; the item's own tags are shown for comparison)."""
    meta, _p = load(args.item_dir)
    if not is_int(meta.get("appId")) or meta["appId"] <= 0:
        raise Fail("\"appId\" in workshop.json must be the positive Steam AppID first")
    try:
        listing = workshop_tags.declared_tags(meta["appId"])
    except workshop_tags.TagLookupError as e:
        raise Fail(f"cannot read the Workshop tags for app {meta['appId']}: {e}")
    print(f"app {meta['appId']}: {len(listing.names)} Workshop tag(s) declared by Steam (source: {listing.source})")
    if listing.note:
        print(f"warning: {listing.note}")
    for name in listing.names:
        print(f"  {name}")
    mine = meta.get("tags")
    if isinstance(mine, list):
        print(f"workshop.json tags: {', '.join(mine) or '(none)'}")
    else:
        print("workshop.json tags: missing (add \"tags\" with the names above, or [] for none)")


def stage(meta: dict, p: dict[str, Path], files: list[Path]) -> tuple[Path, Path]:
    """Copy the included files to workshop/.build/content and write translations.json (primary language first).

    Only english and schinese are written; their titles are composed in memory. workshop.json is never rewritten here.
    """
    root = (p["meta_dir"] / meta["contentPath"]).resolve()
    content = p["build"] / "content"
    if p["build"].exists():
        shutil.rmtree(p["build"])
    for f in files:
        target = content / f.relative_to(root)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, target)
    texts = [{
        "language": code,
        "title": title,
        "description": (p["meta_dir"] / entry["description"]).read_text("utf-8").strip(),
    } for code, entry, title in plan_languages(meta)]
    translations = p["build"] / "translations.json"
    translations.write_text(json.dumps(texts, ensure_ascii=False, indent=2) + "\n", "utf-8")
    return content, translations


def cmd_pack(args) -> None:
    meta, p = load(args.item_dir)
    print_skips(meta)
    warnings, files = check_or_fail(meta, p)
    content, _ = stage(meta, p, files)
    for w in warnings:
        print(f"warning: {w}")
    total = sum(f.stat().st_size for f in content.rglob("*") if f.is_file())
    for f in sorted(content.rglob("*")):
        if f.is_file():
            print(f"  {f.relative_to(content).as_posix()}  {f.stat().st_size} bytes")
    print(f"staged {len(files)} file(s), {total} bytes in {content}")


def cmd_upload(args) -> None:
    meta, p = load(args.item_dir)
    print_skips(meta)
    warnings, files = check_or_fail(meta, p)
    if args.visibility and args.visibility not in VISIBILITY:
        raise Fail(f"--visibility must be one of {', '.join(VISIBILITY)}")
    visibility = args.visibility or meta["visibility"]
    changenote = args.changenote if args.changenote is not None else meta.get("changeNote", "")
    note_problems = locales.change_note_problems(changenote)
    if note_problems:
        raise Fail("change note for this upload: " + "; ".join(note_problems)
                   + f"\nexample:\n{locales.CHANGE_NOTE_EXAMPLE}")
    tags = meta["tags"]  # present and checked against Steam's list by check_or_fail
    content, translations = stage(meta, p, files)
    preview = (p["meta_dir"] / meta.get("previewPath", "preview.png")).resolve()
    current = str(meta["publishedFileId"])
    for w in warnings:
        print(f"warning: {w}")
    print(f"app        {meta['appId']}")
    print(f"item       {'update of ' + current if current != '0' else 'new item (created by this upload)'}")
    print(f"visibility {visibility}" + ("" if visibility == meta["visibility"] else f" (workshop.json says {meta['visibility']})"))
    print(f"languages  {', '.join(t['language'] + (' (primary)' if i == 0 else '') for i, t in enumerate(json.loads(translations.read_text('utf-8'))))}")
    for code, _entry, title in plan_languages(meta):
        print(f"title      {code}: {title}")
    print(f"files      {len(files)} from {meta['contentPath']}; preview {preview.name}; change note {changenote!r}")
    print(f"tags       {', '.join(tags) or '(none: this clears the tags on Steam)'}")
    if meta.get("screenshots"):
        print(f"screenshots  not part of this upload; use `images upload` ({len(meta['screenshots'])} listed)")
    if meta.get("videos"):
        print(f"videos       not part of this upload; Steam takes videos only as YouTube links, added by hand on the item page (`videos list`, {len(meta['videos'])} listed)")
    if not args.yes:
        print("dry run: nothing was sent to Steam. Re-run with --yes to submit this exact content.")
        return
    if shutil.which("node") is None:
        raise Fail("node is not on PATH (steam-workshop.mjs needs Node.js)")
    cmd = ["node", str(STEAM_SCRIPT), "publish", "--app", str(meta["appId"]), "--item", current,
           "--content", str(content), "--preview", str(preview), "--translations", str(translations),
           "--visibility", visibility, "--changenote", changenote]
    cmd += ["--tags", ",".join(tags)]  # always sent: an empty list clears the tags, as the item's tags say
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    needs_agreement = False
    for line in proc.stdout:  # type: ignore[union-attr]
        sys.stdout.write(line)
        sys.stdout.flush()
        m = re.match(r"ITEM_ID (\d+)", line)
        if m and meta["publishedFileId"] != m.group(1):
            if meta["publishedFileId"] != "0":
                raise Fail(f"Steam reported item {m.group(1)} but workshop.json holds {meta['publishedFileId']}; stopped")
            meta["publishedFileId"] = m.group(1)  # keep the id at once, before the upload can fail
            save(meta, p)
            print(f"saved publishedFileId {m.group(1)} to {p['file']} (commit it)")
        if line.startswith("NEEDS_AGREEMENT"):
            needs_agreement = True
    if proc.wait() != 0:
        kept = meta["publishedFileId"]
        hint = (f"item {kept} is kept in workshop.json; run the same command again to update it"
                if kept != "0" else "no item was created")
        raise Fail(f"upload failed (exit {proc.returncode}); {hint}")
    if needs_agreement:
        print("warning: the Workshop legal agreement is not accepted for this account; the item stays hidden until it is.")


def cmd_status(args) -> None:
    meta, p = load(args.item_dir)
    errors, warnings, files = validate(meta, p)
    print(f"item       {p['item']}")
    print(f"appId      {meta.get('appId')}")
    print(f"published  {meta.get('publishedFileId')}")
    print(f"visibility {meta.get('visibility')}")
    print(f"languages  {', '.join(meta.get('languages', {}) or {})}")
    print(f"local      {'ready' if not errors else 'not ready: ' + '; '.join(errors)}")
    for w in warnings:
        print(f"warning: {w}")
    if args.remote:
        if str(meta.get("publishedFileId", "0")) == "0":
            print("remote     no item yet (publishedFileId is 0)")
            return
        if shutil.which("node") is None:
            raise Fail("node is not on PATH (steam-workshop.mjs needs Node.js)")
        cmd = ["node", str(STEAM_SCRIPT), "info", "--app", str(meta["appId"]), "--item", str(meta["publishedFileId"])]
        r = subprocess.run(cmd, capture_output=True, text=True)
        sys.stdout.write(r.stdout)
        if r.returncode != 0:
            raise Fail(r.stderr.strip() or f"steam-workshop.mjs info exited {r.returncode}")


def remote_info(meta: dict) -> dict:
    """Read the item from Steam through steam-workshop.mjs info (needs a running, logged-in Steam client)."""
    item = str(meta.get("publishedFileId", "0"))
    if item == "0":
        raise Fail("this item has no Steam id yet (publishedFileId is 0); upload it first")
    if shutil.which("node") is None:
        raise Fail("node is not on PATH (steam-workshop.mjs needs Node.js)")
    r = subprocess.run(["node", str(STEAM_SCRIPT), "info", "--app", str(meta["appId"]), "--item", item],
                       capture_output=True, text=True)
    line = next((x for x in r.stdout.splitlines() if x.startswith("ITEM_INFO ")), None)
    if r.returncode != 0 or line is None:
        raise Fail(r.stderr.strip() or f"steam-workshop.mjs info exited {r.returncode}")
    return json.loads(line[len("ITEM_INFO "):])


def cmd_images_list(args) -> None:
    meta, p = load(args.item_dir)
    local = [Path(rel).name for rel in meta.get("screenshots", [])]
    remote = remote_info(meta)["additionalPreviews"]
    names = {x["originalFilename"] for x in remote}
    print(f"item {meta['publishedFileId']}: {len(remote)} additional preview(s) on Steam, {len(local)} listed in workshop.json")
    for x in remote:
        print(f"  steam  {x['originalFilename']:<32} {x['previewType']:<10} {x['urlOrVideoId']}")
    for rel in meta.get("screenshots", []):
        state = "on Steam" if Path(rel).name in names else "not uploaded"
        print(f"  local  {rel:<32} {state}")


def cmd_videos_list(args) -> None:
    """Read-only: the videos listed in workshop.json with their YouTube links, and (with --remote) which ones Steam already shows."""
    meta, p = load(args.item_dir)
    listed = meta.get("videos", [])
    item = str(meta.get("publishedFileId", "0"))
    url = f"https://steamcommunity.com/sharedfiles/filedetails/?id={item}" if item != "0" else "(no item yet)"
    print(f"item {item}  {url}")
    remote_ids: set[str] | None = None
    if args.remote:
        remote = remote_info(meta)["additionalPreviews"]
        remote_ids = {x["urlOrVideoId"] for x in remote if x.get("previewType") == "youtube"}
        print(f"  {len(remote_ids)} YouTube video(s) on Steam, {len(listed)} listed in workshop.json")
    if not listed:
        print("  workshop.json lists no \"videos\"")
    for v in listed:
        state = "" if remote_ids is None else ("  on Steam" if v.get("youtubeId") in remote_ids else "  NOT on Steam: add it on the item page")
        print(f"  {v.get('youtubeId')}  https://www.youtube.com/watch?v={v.get('youtubeId')}  {v.get('title')}{state}")
    if remote_ids is not None:
        extra = sorted(remote_ids - {v.get("youtubeId") for v in listed})
        for vid in extra:
            print(f"  {vid}  on Steam but not listed in workshop.json")
    print("Steam takes Workshop videos only as YouTube links: add one on the item page (Add/Edit videos) while signed in as the owner; this script sends nothing.")


def cmd_images_upload(args) -> None:
    meta, p = load(args.item_dir)
    check_or_fail(meta, p)
    listed = meta.get("screenshots", [])
    if not listed:
        raise Fail("workshop.json lists no \"screenshots\"")
    names = {x["originalFilename"] for x in remote_info(meta)["additionalPreviews"]}
    pending = [(p["meta_dir"] / rel).resolve() for rel in listed if Path(rel).name not in names]
    print(f"item       {meta['publishedFileId']}")
    print(f"listed     {len(listed)} screenshot(s); already on Steam: {len(listed) - len(pending)}")
    if not pending:
        print("nothing to add")
        return
    for f in pending:
        print(f"  to add   {f.relative_to(p['item'])}")
    if not args.yes:
        print("dry run: nothing was sent to Steam. Re-run with --yes to add these screenshots.")
        return
    p["build"].mkdir(parents=True, exist_ok=True)
    listing = p["build"] / "screenshots.json"
    listing.write_text(json.dumps([str(f) for f in pending], ensure_ascii=False, indent=2) + "\n", "utf-8")
    cmd = ["node", str(STEAM_SCRIPT), "add-previews", "--app", str(meta["appId"]),
           "--item", str(meta["publishedFileId"]), "--files", str(listing)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        raise Fail(f"adding screenshots failed (exit {r.returncode}); run `images list` to see what Steam lists")


def cmd_images_remove(args) -> None:
    meta, p = load(args.item_dir)
    check_or_fail(meta, p)
    names = [Path(n).name for n in args.names]
    if len(set(names)) != len(names):
        raise Fail("the same file name is given twice")
    remote = remote_info(meta)["additionalPreviews"]
    on_steam = [x["originalFilename"] for x in remote]
    absent = [n for n in names if n not in on_steam]
    if absent:
        raise Fail(f"Steam does not list {', '.join(absent)} for item {meta['publishedFileId']}; `images list` shows what it lists")
    indexes = [on_steam.index(n) for n in names]  # 0-based positions in the list Steam returned just now
    print(f"item       {meta['publishedFileId']}")
    for n, i in zip(names, indexes):
        print(f"  to remove  [{i}] {n}")
    listed = meta.get("screenshots", [])
    drop = [rel for rel in listed if Path(rel).name in names]
    for rel in drop:
        print(f"  workshop.json  {rel} is removed from \"screenshots\" too, so `images upload` does not add it back")
    if not args.yes:
        print("dry run: nothing was sent to Steam. Re-run with --yes to remove these screenshots from the item.")
        return
    p["build"].mkdir(parents=True, exist_ok=True)
    listing = p["build"] / "screenshot-removal.json"
    listing.write_text(json.dumps(indexes, indent=2) + "\n", "utf-8")
    cmd = ["node", str(STEAM_SCRIPT), "remove-previews", "--app", str(meta["appId"]),
           "--item", str(meta["publishedFileId"]), "--indexes", str(listing)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        raise Fail(f"removing screenshots failed (exit {r.returncode}); run `images list` to see what Steam lists; workshop.json is unchanged")
    # Steam confirmed the removal (remove-previews reads the item back), so the listing follows it.
    meta["screenshots"] = [rel for rel in listed if rel not in drop]
    save(meta, p)
    print(f"workshop.json  {len(drop)} entr{'y' if len(drop) == 1 else 'ies'} removed from \"screenshots\"")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="workshop.py", description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("init", help="create <item>/workshop/ with a template workshop.json")
    s.add_argument("item_dir")
    s.add_argument("--app-id", type=int, required=True, help="Steam AppID of the game")
    s.add_argument("--languages", default="english,schinese",
                   help="english and/or schinese (en and zh-CN also accepted); the first one is primary")
    s.add_argument("--visibility", choices=sorted(VISIBILITY), default=DEFAULT_VISIBILITY,
                   help="visibility stored in workshop.json (default: public)")
    s.set_defaults(fn=cmd_init)

    for name, fn, text in (("check", cmd_check, "validate workshop/, including its tags against Steam's list (nothing is sent)"),
                           ("pack", cmd_pack, "validate and stage the upload folder (nothing is sent)")):
        s = sub.add_parser(name, help=text)
        s.add_argument("item_dir")
        s.set_defaults(fn=fn)

    s = sub.add_parser("tags", help="print the Workshop tags Steam declares for the item's AppID (read-only)")
    s.add_argument("item_dir")
    s.set_defaults(fn=cmd_tags)

    s = sub.add_parser("upload", help="validate, stage and (with --yes) publish or update the item")
    s.add_argument("item_dir")
    s.add_argument("--visibility", choices=sorted(VISIBILITY), help="override workshop.json for this upload only")
    s.add_argument("--changenote", help="change note for this upload, two lines: \"中文：...\" then \"English: ...\" "
                                        "(default: changeNote in workshop.json)")
    s.add_argument("--yes", action="store_true", help="actually submit to Steam (without it, nothing is sent)")
    s.set_defaults(fn=cmd_upload)

    s = sub.add_parser("status", help="show the stored item identity; --remote asks Steam")
    s.add_argument("item_dir")
    s.add_argument("--remote", action="store_true", help="read the item from Steam (needs the Steam client)")
    s.set_defaults(fn=cmd_status)

    s = sub.add_parser("images", help="extra screenshots (Steam additional previews): list them or add the listed ones")
    images = s.add_subparsers(dest="images_cmd", required=True)
    s = images.add_parser("list", help="list the screenshots on Steam and the ones listed in workshop.json (read-only)")
    s.add_argument("item_dir")
    s.set_defaults(fn=cmd_images_list)
    s = images.add_parser("upload", help="add the listed screenshots that Steam does not have yet (dry run unless --yes)")
    s.add_argument("item_dir")
    s.add_argument("--yes", action="store_true", help="actually submit the screenshots to Steam")
    s.set_defaults(fn=cmd_images_upload)
    s = images.add_parser("remove", help="remove screenshots from the item on Steam, by file name (dry run unless --yes)")
    s.add_argument("item_dir")
    s.add_argument("names", nargs="+", metavar="FILE", help="file names as `images list` shows them for Steam")
    s.add_argument("--yes", action="store_true", help="actually remove them on Steam")
    s.set_defaults(fn=cmd_images_remove)

    s = sub.add_parser("videos", help="Workshop videos (YouTube links): list them (read-only; Steam is updated by hand)")
    videos = s.add_subparsers(dest="videos_cmd", required=True)
    s = videos.add_parser("list", help="list the videos in workshop.json with their YouTube links; --remote also compares with Steam")
    s.add_argument("item_dir")
    s.add_argument("--remote", action="store_true", help="read the item from Steam (needs the Steam client)")
    s.set_defaults(fn=cmd_videos_list)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        args.fn(args)
    except Fail as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
