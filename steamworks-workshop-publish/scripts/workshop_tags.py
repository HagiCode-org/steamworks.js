"""Workshop tags of one Steam app: the names Steam accepts for its Workshop items, read from the game's own Workshop page.

Tags belong to each game. This module only reads the list Steam declares for an AppID, so `workshop.py check` can
verify the tags an item names; it never chooses or adds a tag. Standard library only.

    declared_tags(app_id) -> TagList(names, source, note)
    parse_declared_tags(page_html) -> [names]          the parser, for tests and debugging

Source: https://steamcommunity.com/workshop/browse/?appid=<AppID>, the page's own "declaredTags" object, key
"readytouse_tags" (the Ready to use section, which is where Workshop items are browsed; its tags are the ones an item may
carry). A game whose page lacks that key falls back to "declared_tags". Names are the internal `name` values, which are
what steamworks.js sends.

Lookup order: the file named by WORKSHOP_TAGS_FILE (a JSON list of names; used offline and by the tests); a cache file
for this AppID that is less than 24 hours old; the Workshop page. When the page cannot be read, an older cache is used
with a note; with no cache at all the caller must stop.

Environment: WORKSHOP_TAGS_FILE, WORKSHOP_BROWSE_URL (default https://steamcommunity.com/workshop/browse/),
XDG_CACHE_HOME (default ~/.cache). Delete the cache file to read the page again at once.
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import NamedTuple

BROWSE_URL = "https://steamcommunity.com/workshop/browse/"
CACHE_TTL_SECONDS = 24 * 3600
TIMEOUT_SECONDS = 20
_KEYS = ("readytouse_tags", "declared_tags")  # first key the page has wins; both hold the same list for a game with tags
_DECODER = json.JSONDecoder()


class TagLookupError(Exception):
    """The declared tags cannot be read and no cache covers the AppID."""


class TagList(NamedTuple):
    names: list[str]  # the tag names Steam accepts for the app, in the page's order
    source: str       # where they came from, for messages
    note: str         # empty, or a warning (for example: an older cached list is used)


# --------------------------------------------------------------------------- parsing

def parse_declared_tags(page: str) -> list[str]:
    """Return the Workshop tag names declared in a browse page.

    The page carries its data twice: as plain JSON, and inside a JavaScript string where quotes and backslashes are
    escaped. Both are tried. Raises ValueError when the page has no "declaredTags" object.
    """
    unescaped = page.replace('\\"', '"').replace("\\\\", "\\")
    for text in (page, unescaped):
        start = text.find('"declaredTags":{')
        if start < 0:
            continue
        obj, _end = _DECODER.raw_decode(text, start + len('"declaredTags":'))
        if not isinstance(obj, dict):
            raise ValueError("declaredTags is not an object")
        key = next((k for k in _KEYS if k in obj), None)
        if key is None:
            raise ValueError(f"declaredTags has none of {', '.join(_KEYS)}")
        names: list[str] = []
        for group in obj[key] or []:
            for tag in group.get("tags", []):
                name = tag.get("name")
                if isinstance(name, str) and name and name not in names:
                    names.append(name)
        return names
    raise ValueError("the page has no declaredTags object (the Steam page layout may have changed)")


# --------------------------------------------------------------------------- network and cache

def _cache_file(app_id: int) -> Path:
    base = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    return base / "steamworks-workshop-publish" / f"declared-tags-{app_id}.json"


def _read_cache(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("tags"), list) or not isinstance(data.get("fetched_at"), (int, float)):
        return None
    if not all(isinstance(t, str) for t in data["tags"]):
        return None
    return data


def _write_cache(path: Path, app_id: int, names: list[str], url: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"app_id": app_id, "url": url, "fetched_at": time.time(), "tags": names},
                                   ensure_ascii=False, indent=2) + "\n", "utf-8")
    except OSError:
        pass  # a cache that cannot be written only costs another request next time


def _fetch(app_id: int) -> tuple[str, str]:
    base = os.environ.get("WORKSHOP_BROWSE_URL") or BROWSE_URL
    url = f"{base}?{urllib.parse.urlencode({'appid': app_id, 'l': 'english'})}"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 steamworks-workshop-publish"})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return response.read().decode("utf-8", "replace"), url


# --------------------------------------------------------------------------- the one entry point

def declared_tags(app_id: int) -> TagList:
    override = os.environ.get("WORKSHOP_TAGS_FILE")
    if override:
        try:
            names = json.loads(Path(override).read_text("utf-8"))
        except (OSError, ValueError) as e:
            raise TagLookupError(f"WORKSHOP_TAGS_FILE {override} cannot be read: {e}") from e
        if not isinstance(names, list) or not all(isinstance(x, str) for x in names):
            raise TagLookupError(f"WORKSHOP_TAGS_FILE {override} must hold a JSON list of tag names")
        return TagList(names, f"WORKSHOP_TAGS_FILE {override}", "")

    cache = _cache_file(app_id)
    saved = _read_cache(cache)
    if saved and time.time() - saved["fetched_at"] < CACHE_TTL_SECONDS:
        return TagList(saved["tags"], f"cache {cache} (read from {saved.get('url', 'the Workshop page')})", "")

    try:
        page, url = _fetch(app_id)
        names = parse_declared_tags(page)
    except (OSError, ValueError) as e:  # urllib errors and HTTP status errors are OSError subclasses
        if saved:
            age_hours = int((time.time() - saved["fetched_at"]) // 3600)
            return TagList(saved["tags"], f"cache {cache}",
                           f"the Workshop page could not be read ({e}); using the tag list saved {age_hours} hour(s) ago")
        raise TagLookupError(f"the Workshop page for app {app_id} could not be read or parsed: {e}") from e
    _write_cache(cache, app_id, names, url)
    return TagList(names, url, "")
