"""Validate a local release tag without changing files, refs or contacting GitHub."""
import argparse
from pathlib import Path
import subprocess
import sys

# Importing the shared parser must not create a __pycache__ directory.
sys.dont_write_bytecode = True
from release import git, read_version


def commit_ref(root, ref, label):
    try:
        return git(root, "rev-parse", "--verify", ref + "^{commit}").strip()
    except ValueError as error:
        raise ValueError("The local " + label + " ref is missing or is not a commit.") from error


def check_tag(root, tag):
    if Path(git(root, "rev-parse", "--show-toplevel").decode().strip()).resolve() != root:
        raise ValueError("The validator must be in the Git checkout root's source directory.")
    authority = root / "source/version.json"
    if authority.is_symlink() or not authority.is_file():
        raise ValueError("source/version.json must be a regular file in this checkout.")
    authority_bytes = authority.read_bytes()
    version = read_version(authority_bytes)
    if tag != "v" + version:
        raise ValueError("The release tag must be exactly v" + version + ".")
    tagged = commit_ref(root, "refs/tags/" + tag, "release tag")
    head = commit_ref(root, "HEAD", "HEAD")
    if tagged != head:
        raise ValueError("The release tag must identify the checked-out HEAD commit.")
    if git(root, "show", tagged.decode() + ":source/version.json") != authority_bytes:
        raise ValueError("The version authority must match the tagged commit.")
    main = commit_ref(root, "refs/remotes/origin/main", "origin/main")
    result = subprocess.run(["git", "merge-base", "--is-ancestor", tagged.decode(), main.decode()],
                            cwd=root, capture_output=True, check=False)
    if result.returncode:
        raise ValueError("The tagged commit must be an ancestor of local origin/main.")
    return version, tagged.decode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", help="Exact release tag, such as v0.1.0.")
    arguments = parser.parse_args()
    try:
        version, commit = check_tag(Path(__file__).resolve().parent.parent, arguments.tag)
    except (ValueError, OSError) as error:
        parser.exit(1, "Release tag verification failed: " + str(error) + "\n")
    print("Verified release tag v" + version + " at " + commit + ".")


if __name__ == "__main__":
    main()
