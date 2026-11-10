"""Pin the installer to an explicitly selected, locally reviewed widget commit.

This tool makes no network requests. After pushing, verify that GitHub serves
the pinned bytes before publishing the install page.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

VERSION_RE = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
COMMIT_RE = re.compile(r"[0-9a-f]{40}")
HASH_RE = re.compile(r"[0-9a-f]{64}")
WIDGET_FILE = "FordPassWidgets.js"
WIDGET_URL_FILE = "FordPassWidgets.js"
SOURCE_RE = re.compile(r"https://raw\.githubusercontent\.com/markse123/FordPassWidgets/([0-9a-f]{40})/FordPassWidgets\.js")


def version_parts(value):
    if not isinstance(value, str) or len(value) > 64 or not VERSION_RE.fullmatch(value):
        raise ValueError("Version must use canonical major.minor.patch numbers.")
    return tuple(int(part) for part in value.split("."))


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Release metadata contains duplicate keys.")
        result[key] = value
    return result


def metadata(raw):
    value = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_keys)
    if not isinstance(value, dict):
        raise ValueError("Release metadata must be an object.")
    return value


def read_version(raw):
    value = metadata(raw)
    if set(value) != {"version"}:
        raise ValueError("version.json must contain only the version field.")
    version_parts(value["version"])
    return value["version"]


def script_version(raw):
    code = raw.decode("utf-8")
    start = code.find("/*")
    if start < 0 or not re.fullmatch(r"(?:[ \t]*(?://[^\r\n]*)?\r?\n)*[ \t]*", code[:start]):
        raise ValueError("Widget version header is missing or misplaced.")
    match = re.match(r"/\*[ \t]*\r?\nFordPassWidgets ([^\r\n]*)\r?\n", code[start:])
    labels = re.findall(r"^FordPassWidgets [^\r\n]*\r?$", code, re.MULTILINE)
    if not match or len(labels) != 1:
        raise ValueError("Widget must contain one unambiguous version header.")
    version_parts(match[1])
    runtime = re.findall(r"^const FORDWIDGET_VERSION = '([^'\r\n]*)';\r?$", code, re.MULTILINE)
    if runtime != [match[1]]:
        raise ValueError("Widget header and runtime versions disagree.")
    return match[1]


def git(root, *arguments):
    result = subprocess.run(["git", *arguments], cwd=root, capture_output=True, check=False)
    if result.returncode:
        raise ValueError("Cannot read the requested local Git commit or release files.")
    return result.stdout


def constant(code, name):
    values = re.findall(r"^const " + re.escape(name) + r" = '([^'\r\n]*)';\r?$", code, re.MULTILINE)
    if len(values) != 1:
        raise ValueError("Installer must contain exactly one " + name + " constant.")
    return values[0]


def replace_constant(code, name, value):
    pattern = r"^(const " + re.escape(name) + r" = )'[^'\r\n]*'(;\r?)$"
    updated, count = re.subn(pattern, lambda match: match[1] + "'" + value + "'" + match[2], code, flags=re.MULTILINE)
    if count != 1:
        raise ValueError("Installer constant could not be updated exactly once: " + name)
    return updated


def prepare_release(root, commit=None, check=False, base=None):
    if not check and (not isinstance(commit, str) or not COMMIT_RE.fullmatch(commit)):
        raise ValueError("Use a full lowercase 40-character commit SHA.")
    if Path(git(root, "rev-parse", "--show-toplevel").decode().strip()).resolve() != root:
        raise ValueError("Run from the FordPassWidgets source checkout.")
    origin = git(root, "remote", "get-url", "origin").decode().strip()
    if not re.fullmatch(r"(?:https://github\.com/|git@github\.com:)markse123/FordPassWidgets(?:\.git)?", origin):
        raise ValueError("The checkout origin must be markse123/FordPassWidgets.")
    paths = {name: root / name for name in [WIDGET_FILE, "source/version.json", "source/build-manifest.json", "docs/installer.js"]}
    if any(path.is_symlink() or not path.is_file() for path in paths.values()):
        raise ValueError("Release inputs must be regular files in this checkout.")
    version_bytes = paths["source/version.json"].read_bytes()
    manifest_bytes = paths["source/build-manifest.json"].read_bytes()
    widget = paths[WIDGET_FILE].read_bytes()
    version = read_version(version_bytes)
    manifest = metadata(manifest_bytes)
    digest = hashlib.sha256(widget).hexdigest()
    if manifest.get("version") != version or manifest.get("outputSHA256") != digest or script_version(widget) != version:
        raise ValueError("Build the widget first: version.json, widget and manifest must agree.")

    installer = paths["docs/installer.js"]
    old_bytes = installer.read_bytes()
    code = old_bytes.decode("utf-8")
    old_version = constant(code, "INSTALL_VERSION")
    old_source = constant(code, "INSTALL_SOURCE")
    old_hash = constant(code, "INSTALL_SHA256")
    source_match = SOURCE_RE.fullmatch(old_source)
    if not source_match or not HASH_RE.fullmatch(old_hash):
        raise ValueError("The existing installer pin is malformed; restore a reviewed installer first.")
    comparison = (version_parts(version) > version_parts(old_version)) - (version_parts(version) < version_parts(old_version))
    if check:
        if not SOURCE_RE.fullmatch(old_source):
            raise ValueError("Installer source must use the canonical widget filename; prepare a new release pin first.")
        if comparison != 0 or old_hash != digest:
            raise ValueError("Installer release metadata is stale; prepare the reviewed release pin first.")
        commit = SOURCE_RE.fullmatch(old_source)[1]
    if git(root, "cat-file", "-t", commit).strip() != b"commit":
        raise ValueError("The selected object must be a commit.")
    if base is not None:
        check_version_bump(root, base, widget, version)

    for name, current in [(WIDGET_FILE, widget), ("source/version.json", version_bytes), ("source/build-manifest.json", manifest_bytes)]:
        committed = git(root, "show", commit + ":" + name)
        if committed != current:
            raise ValueError("The selected commit does not contain the current reviewed " + name + " bytes.")
    # Validate the committed metadata too, independently of its exact byte match.
    if read_version(git(root, "show", commit + ":source/version.json")) != version:
        raise ValueError("Committed version metadata disagrees.")
    committed_manifest = metadata(git(root, "show", commit + ":source/build-manifest.json"))
    if committed_manifest.get("version") != version or committed_manifest.get("outputSHA256") != digest:
        raise ValueError("Committed build manifest disagrees.")

    if comparison < 0:
        raise ValueError("Refusing to downgrade the installer release version.")
    if comparison == 0 and old_hash != digest:
        raise ValueError("Widget bytes changed under the same release version; bump version.json first.")
    if check:
        check_index(root, version, commit)
        return version, digest
    source = "https://raw.githubusercontent.com/markse123/FordPassWidgets/" + commit + "/" + WIDGET_URL_FILE
    for name, value in [("INSTALL_VERSION", version), ("INSTALL_SOURCE", source), ("INSTALL_SHA256", digest)]:
        code = replace_constant(code, name, value)
    updated = code.encode("utf-8")
    if updated != old_bytes:
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=installer.parent, prefix=".installer-release-", suffix=".tmp", delete=False) as output:
                temporary = Path(output.name)
                output.write(updated)
            temporary.chmod(stat.S_IMODE(installer.stat().st_mode))
            os.replace(temporary, installer)
        finally:
            if temporary and temporary.exists():
                temporary.unlink()
    return version, digest


def check_version_bump(root, base, widget, version):
    if not isinstance(base, str) or not COMMIT_RE.fullmatch(base) or git(root, "cat-file", "-t", base).strip() != b"commit":
        raise ValueError("Use a full base commit SHA for the version-bump check.")
    base_path = WIDGET_FILE
    if not git(root, "ls-tree", "--name-only", base, "--", base_path).strip():
        if git(root, "ls-tree", "--name-only", base, "--", "source/version.json").strip():
            raise ValueError("The base commit has release metadata without its widget.")
        return  # A source-free bootstrap commit can precede the first release.
    previous = git(root, "show", base + ":" + base_path)
    previous_version = script_version(previous)
    if git(root, "ls-tree", "--name-only", base, "--", "source/version.json").strip():
        if read_version(git(root, "show", base + ":source/version.json")) != previous_version:
            raise ValueError("The base commit's version authority and widget disagree.")
    if widget != previous and version_parts(version) <= version_parts(previous_version):
        raise ValueError("Changed widget bytes require a strictly newer version than the base commit.")


def check_index(root, version, commit):
    index = root / "docs/index.html"
    if index.is_symlink() or not index.is_file():
        raise ValueError("The install page must be a regular docs/index.html file.")
    html = index.read_text(encoding="utf-8")
    versions = re.findall(r"Installing\s+widget\s+version\s*<strong(?:\s[^>]*)?>([^<]+)</strong>", html, re.IGNORECASE)
    links = re.findall(r"href=[\"']https://github\.com/markse123/FordPassWidgets/blob/([0-9a-f]{40})/([^\"']+)[\"']", html)
    if [value.strip() for value in versions] != [version] or links != [(commit, WIDGET_URL_FILE)]:
        raise ValueError("Install page version/source must match the installer release pin.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--commit", help="Full reviewed code-commit SHA; publish/read back its raw asset separately.")
    mode.add_argument("--check", action="store_true", help="Read-only validation of the existing pin, built widget and install page.")
    parser.add_argument("--base", help="Require a version increase if widget bytes differ from this full base commit SHA.")
    arguments = parser.parse_args()
    try:
        version, digest = prepare_release(Path(__file__).resolve().parent.parent, arguments.commit, arguments.check, arguments.base)
    except (ValueError, OSError) as error:
        parser.exit(1, "Release preparation failed: " + str(error) + "\n")
    if arguments.check:
        print("Verified installer, widget and page v" + version + "; SHA-256 " + digest)
    else:
        print("Installer v" + version + " pinned to " + arguments.commit + "; SHA-256 " + digest)


if __name__ == "__main__":
    main()
