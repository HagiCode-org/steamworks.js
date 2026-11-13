#!/usr/bin/env python3
"""Create the workshop/ folder of a Duckov mod from its assets/ folder, so workshop.py can publish it.

Reads the layout the Duckov build uses:
  <mod>/assets/info.ini                  name, publishedFileId (kept exactly as it is)
  <mod>/assets/description/<lang>.md     one Markdown file per language; the first "# " heading is the Steam title
  <mod>/assets/preview.png               the Workshop preview (copied to workshop/preview.png)

Only en.md (english, the primary language) and zh.md (schinese) are converted. Any other <lang>.md is skipped with a
`skip:` line and is never written to workshop.json (the scope is in locales.py).

Writes <mod>/workshop/: workshop.json, description.<code>.txt (Steam BBCode, converted here), preview.png, .gitignore.
It does not build, does not upload, and never changes publishedFileId. The game build is the project's job: pass the
built mod folder with --content (for example the output of `dotnet build <csproj> -c Release -p:DeployMod=true
-p:ModsDirectory=<dir>`, which creates <dir>/<name>/). Then run `workshop.py check` and `workshop.py upload` (dry run).

  duckov-to-workshop.py <mod-dir> --content <built mod folder> [--app-id 3167020] [--descriptions <dir>]
                        [--changenote "..."] [--force]

--descriptions reads the <lang>.md files from another folder (for example generated output); the default is assets/description.
--force replaces an existing workshop/ folder; without it an existing folder is refused.
"""

import argparse
import configparser
import json
import re
import shutil
import sys
from pathlib import Path

import locales  # the english / schinese scope, shared with workshop.py; sits next to this file

TEMPLATES = Path(__file__).resolve().parent.parent / "templates"
MAX_TITLE, MAX_DESCRIPTION = 128, 8000  # kept in step with workshop.py; both are UTF-8 bytes


def md_to_bbcode(md: str) -> str:
    """Markdown subset used by the Duckov descriptions -> Steam BBCode.

    Headings become [h1]-[h3], bold and inline code become [b], links become [url=], "-" and "*" items become
    [list], numbered items become [olist], a horizontal rule becomes [hr]. Images are dropped. Unlisted syntax is kept
    as plain text. The conversion is ours, not Steam's: check the result in the Steam description preview.
    """
    out: list[str] = []
    open_list: str | None = None

    def close_list() -> None:
        nonlocal open_list
        if open_list:
            out.append(f"[/{open_list}]")
            open_list = None

    def inline(text: str) -> str:
        text = re.sub(r"!\[[^\]]*\]\(([^)\s]+)\)", r"[img]\1[/img]", text)
        text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: f"[url={m.group(2)}]{m.group(1)}[/url]", text)
        text = re.sub(r"\*\*(.+?)\*\*", r"[b]\1[/b]", text)
        text = re.sub(r"`([^`]+)`", r"[b]\1[/b]", text)
        return text

    for raw in md.replace("\r\n", "\n").split("\n"):
        line = raw.rstrip()
        heading = re.match(r"^(#{1,3}) (.*)$", line)
        if heading:
            close_list()
            n = len(heading.group(1))
            out.append(f"[h{n}]{inline(heading.group(2).strip())}[/h{n}]")
            continue
        if re.match(r"^\s*[-*] ", line):
            if open_list != "list":
                close_list()
                out.append("[list]")
                open_list = "list"
            out.append("[*]" + inline(re.sub(r"^\s*[-*] ", "", line, count=1)))
            continue
        if re.match(r"^\s*\d+\. ", line):
            if open_list != "olist":
                close_list()
                out.append("[olist]")
                open_list = "olist"
            out.append("[*]" + inline(re.sub(r"^\s*\d+\. ", "", line, count=1)))
            continue
        close_list()
        if re.match(r"^(-{3,}|\*{3,})$", line):
            out.append("[hr][/hr]")
            continue
        out.append(inline(line))
    close_list()
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip() + "\n"


def first_heading(md: str) -> str | None:
    match = re.search(r"^# (.+)$", md, re.M)
    return match.group(1).strip() if match else None


def read_info(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise SystemExit(f"{path} not found")
    parser = configparser.ConfigParser(interpolation=None)
    parser.optionxform = str  # keep key case
    parser.read_string("[info]\n" + path.read_text("utf-8-sig"))
    return {k: v.strip() for k, v in parser["info"].items()}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("mod_dir")
    ap.add_argument("--content", required=True, help="the built mod folder to upload (contentPath)")
    ap.add_argument("--app-id", default="3167020", help="Steam AppID of the game (default: Escape from Duckov)")
    ap.add_argument("--descriptions", help="folder with <lang>.md files (default: assets/description)")
    ap.add_argument("--changenote", default="",
                    help="change note for upload: two lines, \"中文：...\" then \"English: ...\" (checked by workshop.py)")
    ap.add_argument("--force", action="store_true", help="replace an existing workshop/ folder")
    args = ap.parse_args()

    mod = Path(args.mod_dir).resolve()
    assets = mod / "assets"
    info = read_info(assets / "info.ini")
    published = info.get("publishedFileId", "0")
    if not published.isdigit():
        sys.exit(f"publishedFileId in assets/info.ini is not a number: {published!r}")
    if not Path(args.content).is_dir():
        sys.exit(f"--content {args.content} is not a folder; build the mod first")

    source = Path(args.descriptions).resolve() if args.descriptions else assets / "description"
    found = sorted(source.glob("*.md"))
    if not found:
        sys.exit(f"no <lang>.md files in {source}")
    files: list[Path] = []
    skipped: list[str] = []
    for md_path in found:
        key = md_path.stem.replace(".template", "")
        if locales.normalize(key) is None:
            skipped.append(key)
        else:
            files.append(md_path)
    if not files:
        sys.exit(f"no en.md or zh.md in {source}: an English description (en.md) is required")

    workshop = mod / "workshop"
    if workshop.exists():
        if not args.force:
            sys.exit(f"{workshop} exists; pass --force to replace it (the publishedFileId is kept from info.ini)")
        shutil.rmtree(workshop)
    workshop.mkdir(parents=True)

    languages: dict[str, dict[str, str]] = {}
    problems: list[str] = []
    for md_path in files:
        code = md_path.stem.replace(".template", "")
        md = md_path.read_text("utf-8")
        title = first_heading(md)
        if not title:
            problems.append(f"{md_path.name} has no '# ' heading, so it has no Steam title")
            continue
        if len(title.encode("utf-8")) > MAX_TITLE:
            problems.append(f"{md_path.name}: title is {len(title.encode('utf-8'))} bytes of UTF-8, over {MAX_TITLE} bytes")
        body = md_to_bbcode(md)
        size = len(body.encode("utf-8"))
        if size > MAX_DESCRIPTION:
            problems.append(f"{md_path.name}: {size} bytes of UTF-8 after conversion, over {MAX_DESCRIPTION} bytes")
        name = f"description.{code}.txt"
        (workshop / name).write_text(body, "utf-8")
        languages[locales.normalize(code)] = {"title": title, "description": name}

    if "english" not in languages:
        sys.exit("an English description (en.md) is required: it is the primary language")

    if (assets / "preview.png").is_file():
        shutil.copyfile(assets / "preview.png", workshop / "preview.png")
    else:
        problems.append("assets/preview.png is missing")

    config = {
        "schema": 1,
        "appId": int(args.app_id),
        "publishedFileId": published,
        "visibility": "public",
        "primaryLanguage": "english",
        "languages": languages,
        "contentPath": str(Path(args.content).resolve()),
        "previewPath": "preview.png",
        "tags": [],  # the game's Workshop tags, set by hand from `workshop.py tags`; check requires the key
        "changeNote": args.changenote,
    }
    (workshop / "workshop.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", "utf-8")
    shutil.copyfile(TEMPLATES / "gitignore", workshop / ".gitignore")

    print(f"wrote {workshop} for {info.get('name', mod.name)}: publishedFileId {published}, {len(languages)} language(s)")
    for code, entry in languages.items():
        print(f"  {code:10} {entry['title']}")
    for key in skipped:
        print(locales.skip_line(key))
    for problem in problems:
        print(f"WARNING {problem}")
    for problem in locales.change_note_problems(args.changenote):
        print(f"WARNING changeNote: {problem}; set it in workshop.json or pass --changenote (example: {locales.CHANGE_NOTE_EXAMPLE!r})")
    if problems:
        print("fix the warnings, then run workshop.py check")
    else:
        print("next: workshop.py check, workshop.py upload (dry run), then upload --yes")


if __name__ == "__main__":
    main()
