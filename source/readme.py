"""Generate reviewed README sections offline, or check for stale output."""

import sys

# --check is read-only, including imports in a new contributor checkout.
sys.dont_write_bytecode = True

import argparse
import importlib.util
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

from release import read_version, unique_keys


MAX_README_BYTES = 512_000
MAX_CATALOG_BYTES = 128_000
SECTIONS = ("version", "features")
NAVIGATION = (
    "[Easy installation](https://markse123.github.io/FordPassWidgets/)"
    " · [Script source](FordPassWidgets.js)"
    " · [Setup and usage](docs/USAGE.md)"
    " · [Model support](docs/MODEL-SUPPORT.md)"
    " · [Android feature research](docs/ANDROID-FEATURES.md)"
)


def read_regular(root, relative, limit):
    path = root / relative
    if not path.resolve().is_relative_to(root) or path.is_symlink() or not path.is_file():
        raise ValueError(f"{relative} must be a regular file inside the repository.")
    with path.open("rb") as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit:
        raise ValueError(f"{relative} exceeds its size limit.")
    return raw


def doc_helpers():
    # Reuse the same anchor rules as CI. The module path is fixed local source,
    # never selected by catalog contents or downloaded from the network.
    path = Path(__file__).resolve().with_name("check-doc-links.py")
    spec = importlib.util.spec_from_file_location("readme_doc_links", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_documentation(root, link, helpers):
    if not isinstance(link, str) or len(link) > 500 or any(ord(c) < 33 for c in link) or any(c in link for c in "<>\\()"):
        raise ValueError("Feature documentation must be a local Markdown section link.")
    url = urlsplit(link)
    if url.scheme or url.netloc or url.query or not url.path or url.path.startswith("/") or not url.fragment:
        raise ValueError("Feature documentation must use a relative Markdown path and section anchor.")
    relative = unquote(url.path)
    target = root / relative
    if target.suffix.lower() not in {".md", ".markdown"}:
        raise ValueError("Feature documentation must point to a Markdown file.")
    text = read_regular(root, relative, MAX_README_BYTES).decode("utf-8")
    cleaned = helpers.without_code(text)
    anchors = helpers.markdown_anchors(cleaned) | helpers.HTMLLinks(helpers.mask_inline_code(cleaned)).anchors
    if unquote(url.fragment) not in anchors:
        raise ValueError(f"Feature documentation anchor does not exist: {link}")


def load_features(root):
    catalog = json.loads(read_regular(root, "docs/features.json", MAX_CATALOG_BYTES).decode("utf-8"), object_pairs_hook=unique_keys)
    if not isinstance(catalog, dict) or set(catalog) != {"schemaVersion", "features"} or type(catalog["schemaVersion"]) is not int or catalog["schemaVersion"] != 1:
        raise ValueError("Feature catalog must have schemaVersion 1 and a features array only.")
    features = catalog["features"]
    if not isinstance(features, list) or not 1 <= len(features) <= 100:
        raise ValueError("Feature catalog must contain between 1 and 100 reviewed features.")
    helpers, seen = doc_helpers(), set()
    for feature in features:
        if not isinstance(feature, dict) or set(feature) != {"id", "summary", "documentation"}:
            raise ValueError("Each feature needs only id, summary and documentation fields.")
        identifier = feature["id"]
        if not isinstance(identifier, str) or len(identifier) > 80 or not re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*", identifier) or identifier in seen:
            raise ValueError("Feature IDs must be unique lower-case kebab-case strings.")
        seen.add(identifier)
        summary = feature["summary"]
        if not isinstance(summary, str) or not summary.strip() or summary != summary.strip() or len(summary) > 1200 or any(ord(c) < 32 or ord(c) == 127 or c in "<>" or c in "\u0085\u2028\u2029" for c in summary):
            raise ValueError(f"Feature {identifier} summary must be one nonempty line without HTML or control characters.")
        validate_documentation(root, feature["documentation"], helpers)
    return features


def replace_sections(text, sections):
    ranges = []
    for name in SECTIONS:
        begin = f"<!-- BEGIN GENERATED:{name} -->"
        end = f"<!-- END GENERATED:{name} -->"
        if text.count(begin) != 1 or text.count(end) != 1:
            raise ValueError(f"README must contain exactly one BEGIN and END marker for {name}.")
        start_match = re.search(r"(?m)^" + re.escape(begin) + r"(\r?\n)", text)
        end_match = re.search(r"(?m)^" + re.escape(end) + r"(?=\r?$)", text)
        if not start_match or not end_match or start_match.end() > end_match.start():
            raise ValueError(f"README {name} markers must be ordered on separate lines.")
        ranges.append((start_match, end_match, name))
    if ranges[0][1].end() >= ranges[1][0].start():
        raise ValueError("README generated sections must be ordered version then features, without overlap or nesting.")
    for start_match, end_match, name in reversed(ranges):
        newline = start_match[1]
        interior = sections[name].replace("\n", newline) + newline
        text = text[:start_match.end()] + interior + text[end_match.start():]
    return text


def prepare_readme(root):
    root = root.resolve()
    before = read_regular(root, "README.md", MAX_README_BYTES)
    version = read_version(read_regular(root, "source/version.json", 1024))
    features = load_features(root)
    sections = {
        "version": f"**v{version}** · {NAVIGATION}",
        "features": "\n".join(f"- {feature['summary']} [Details]({feature['documentation']})" for feature in features),
    }
    after = replace_sections(before.decode("utf-8"), sections).encode("utf-8")
    if len(after) > MAX_README_BYTES:
        raise ValueError("Generated README exceeds its size limit. Shorten the summaries or manual content.")
    return root, before, after


def write_readme(prepared):
    root, before, after = prepared
    if read_regular(root, "README.md", MAX_README_BYTES) != before:
        raise ValueError("README changed during generation. Finish the edit, then retry.")
    if after != before:
        (root / "README.md").write_bytes(after)
    return after != before


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--check", action="store_true", help="Validate inputs and fail on stale README sections without writing.")
    args = parser.parse_args()
    try:
        prepared = prepare_readme(args.root)
        if args.check:
            if prepared[1] != prepared[2]:
                raise ValueError("README generated sections are stale. Run python3 source/build.py or python3 source/readme.py and commit README.md.")
            print("README version and feature sections are up to date.")
        else:
            changed = write_readme(prepared)
            print("Updated README version and features." if changed else "README version and feature sections are up to date.")
    except (ValueError, OSError, ImportError) as error:
        parser.exit(1, "README generation failed: " + str(error) + "\n")


if __name__ == "__main__":
    main()
