#!/usr/bin/env python3
"""Check repository-local Markdown/HTML links and anchors without network access.

Supports the repository's inline/reference Markdown links, fenced and inline code,
ATX/setext headings, duplicate heading slugs and explicit HTML IDs. External URLs
are deliberately excluded so network availability cannot break offline PR checks.
"""

import argparse
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import unquote, urlsplit


SKIP_DIRECTORIES = {".git", ".venv", "venv", "node_modules", "__pycache__", ".pytest_cache"}
DOC_SUFFIXES = {".md", ".markdown", ".html", ".htm"}
REFERENCE = re.compile(r"(?<!\\)\[([^\]\n]+)\]\[([^\]\n]*)\]")
DEFINITION = re.compile(r"^ {0,3}\[([^\]\n]+)\]:\s*(<[^>\n]*>|\S+)", re.M)


def without_code(text):
    """Mask code, preserving offsets and line numbers for useful diagnostics."""
    lines, fence = [], None
    for line in text.splitlines(keepends=True):
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line.rstrip("\r\n"))
        if fence:
            closing = marker and marker[1][0] == fence[0] and len(marker[1]) >= fence[1] and not marker[2].strip()
            lines.append(re.sub(r"[^\r\n]", " ", line))
            if closing:
                fence = None
        elif marker:
            fence = marker[1][0], len(marker[1])
            lines.append(re.sub(r"[^\r\n]", " ", line))
        else:
            lines.append(line)
    return re.sub(r"<!--[\s\S]*?-->", lambda m: re.sub(r"[^\r\n]", " ", m[0]), "".join(lines))


def mask_inline_code(text):
    return re.sub(r"(`+)([^`\n]*(?:`(?!\1)[^`\n]*)*?)\1", lambda m: " " * len(m[0]), text)


def inline_target(text, start, limit):
    """Read the destination and consume an optional title plus the closing ')'."""
    while start < limit and text[start].isspace():
        start += 1
    end, depth, angle = start, 0, start < limit and text[start] == "<"
    if angle:
        start += 1
        end = start
    while end < limit:
        char = text[end]
        if char == "\\" and end + 1 < limit:
            end += 2
            continue
        if angle:
            if char in "\r\n":
                return None
            if char == ">":
                break
        else:
            if char.isspace() or (char == ")" and depth == 0):
                break
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
        end += 1
    if end >= limit or depth or (angle and text[end] != ">"):
        return None
    target = re.sub(r"\\([\\ ()<>])", r"\1", text[start:end])
    cursor = end + 1 if angle else end
    before_space = cursor
    while cursor < limit and text[cursor].isspace():
        cursor += 1
    if cursor < limit and text[cursor] == ")":
        return target, cursor + 1
    # A title must be separated from the destination by whitespace. Its text is
    # literal, so reference-looking brackets inside it must not be checked.
    if cursor == before_space or cursor >= limit or text[cursor] not in "\"'(":
        return None
    closing = ")" if text[cursor] == "(" else text[cursor]
    cursor += 1
    while cursor < limit:
        if text[cursor] == "\\" and cursor + 1 < limit:
            cursor += 2
        elif text[cursor] == closing:
            cursor += 1
            break
        else:
            cursor += 1
    else:
        return None
    while cursor < limit and text[cursor].isspace():
        cursor += 1
    return (target, cursor + 1) if cursor < limit and text[cursor] == ")" else None


def inline_links(text):
    """Find balanced labels, including images inside a link's label."""
    found, pending = [], [(0, len(text))]
    while pending:
        cursor, limit = pending.pop()
        while cursor < limit:
            if text[cursor] == "\\":
                cursor += 2
                continue
            if text[cursor] != "[":
                cursor += 1
                continue
            closing, depth = cursor + 1, 1
            while closing < limit and depth:
                if text[closing] == "\\":
                    closing += 2
                    continue
                if text[closing] == "[":
                    depth += 1
                elif text[closing] == "]":
                    depth -= 1
                if depth:
                    closing += 1
            if closing + 1 < limit and text[closing + 1] == "(":
                parsed = inline_target(text, closing + 2, limit)
                if parsed:
                    target, end = parsed
                    found.append((cursor, end, target))
                    pending.append((cursor + 1, closing))
                    cursor = end
                    continue
            cursor += 1
    return sorted(found)


class HTMLLinks(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.anchors, self.links = set(), []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if value is None:
                continue
            if key == "id" or (tag == "a" and key == "name"):
                self.anchors.add(value)
            if key in {"href", "src"}:
                self.links.append((self.getpos()[0], value))


def heading_slug(text):
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]*>", "", text)
    text = re.sub(r"(?<!\w)_{1,2}(.+?)_{1,2}(?!\w)", r"\1", text)
    text = unescape(text.replace("`", "").replace("*", "").replace("~", "")).lower()
    return "".join(char if char in "_-" or char.isalnum() or unicodedata.category(char).startswith("M") else "-" if char.isspace() else "" for char in text)


def markdown_anchors(text):
    anchors, generated = set(), set()
    previous = ""
    for line in text.splitlines():
        atx = re.match(r"^ {0,3}#{1,6}(?:\s+|$)(.*)$", line)
        heading = re.sub(r"\s+#+\s*$", "", atx[1]).strip() if atx else None
        if not atx and previous.strip() and re.fullmatch(r" {0,3}(?:=+|-+)\s*", line):
            heading = previous.strip()
        if heading is not None:
            base = heading_slug(heading)
            slug, count = base, 0
            while slug in generated:
                count += 1
                slug = f"{base}-{count}"
            generated.add(slug)
            anchors.add(slug)
        previous = line
    return anchors


def markdown_links(text):
    links, definitions = [], set()
    for match in DEFINITION.finditer(text):
        definitions.add(" ".join(match[1].split()).casefold())
        links.append((text.count("\n", 0, match.start()) + 1, match[2].strip("<>")))
    inline_spans = []
    for start, end, target in inline_links(text):
        inline_spans.append((start, end))
        links.append((text.count("\n", 0, start) + 1, target))
    missing = []
    for match in REFERENCE.finditer(text):
        if any(start <= match.start() < end for start, end in inline_spans):
            continue
        label = " ".join((match[2] or match[1]).split()).casefold()
        if label not in definitions:
            missing.append((text.count("\n", 0, match.start()) + 1, f"undefined link reference [{match[2] or match[1]}]"))
    return links, missing


def check(root):
    root = root.resolve()
    documents = sorted(path for path in root.rglob("*") if path.is_file() and not path.is_symlink() and path.suffix.lower() in DOC_SUFFIXES and not SKIP_DIRECTORIES.intersection(path.relative_to(root).parts))
    cache, errors, checked = {}, [], 0

    def parsed(path):
        if path not in cache:
            text = path.read_text(encoding="utf-8")
            cleaned = without_code(text) if path.suffix.lower() in {".md", ".markdown"} else text
            html = HTMLLinks(mask_inline_code(cleaned) if path.suffix.lower() in {".md", ".markdown"} else cleaned)
            anchors = html.anchors | (markdown_anchors(cleaned) if path.suffix.lower() in {".md", ".markdown"} else set())
            links, issues = markdown_links(mask_inline_code(cleaned)) if path.suffix.lower() in {".md", ".markdown"} else ([], [])
            cache[path] = anchors, links + html.links, issues
        return cache[path]

    for document in documents:
        display = document.relative_to(root).as_posix()
        try:
            _, links, issues = parsed(document)
        except (OSError, UnicodeError) as exc:
            errors.append(f"{display}:1: cannot read document ({type(exc).__name__})")
            continue
        errors.extend(f"{display}:{line}: {issue}" for line, issue in issues)
        for line, raw in links:
            raw = unescape(raw)
            try:
                url = urlsplit(raw)
                if url.scheme or url.netloc or raw.startswith("//"):
                    continue
                checked += 1
                local = unquote(url.path)
                target = ((root / local.lstrip("/")) if local.startswith("/") else (document.parent / local) if local else document).resolve()
                if not target.is_relative_to(root):
                    raise ValueError("target escapes the repository")
                if target.is_dir():
                    target = next((target / name for name in ("index.html", "README.md", "readme.md") if (target / name).is_file()), target)
                    target = target.resolve()
                    if not target.is_relative_to(root):
                        raise ValueError("target escapes the repository")
                if not target.is_file():
                    raise ValueError("target file does not exist")
                fragment = unquote(url.fragment)
                if fragment:
                    if target.suffix.lower() in DOC_SUFFIXES | {".svg"}:
                        if fragment not in parsed(target)[0]:
                            raise ValueError("target anchor does not exist")
                    else:
                        line_range = re.fullmatch(r"L([1-9]\d*)(?:-L([1-9]\d*))?", fragment)
                        if not line_range:
                            raise ValueError("anchor is not supported for this file type")
                        first, last = int(line_range[1]), int(line_range[2] or line_range[1])
                        if first > last or last > len(target.read_text(encoding="utf-8").splitlines()):
                            raise ValueError("target line range does not exist")
            except (ValueError, OSError, UnicodeError) as exc:
                errors.append(f"{display}:{line}: {raw!r}: {exc}")
    return documents, checked, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    if not args.root.is_dir():
        parser.error("--root must be an existing directory")
    documents, count, errors = check(args.root)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Verified {count} local links in {len(documents)} Markdown/HTML documents (offline).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
