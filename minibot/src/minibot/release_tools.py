from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


VERSIONED_FILES = [
    "webui/package.json",
    "webui/package-lock.json",
    "desktop/package.json",
    "desktop/package-lock.json",
    "desktop/src-tauri/Cargo.toml",
    "desktop/src-tauri/Cargo.lock",
    "desktop/src-tauri/tauri.conf.json",
    "minibot/pyproject.toml",
    "minibot/src/minibot/__init__.py",
    "packages/minibot-client/package.json",
]

CHANGELOG_FILES = ["CHANGELOG.md", "CHANGELOG.zh.md"]

SOURCE_PREFIXES = (
    "webui/src/",
    "desktop/src/",
    "desktop/src-tauri/src/",
    "minibot/src/",
    "packages/minibot-client/src/",
)

# prefix → Cargo package name in Cargo.lock
_TAURI_PACKAGES = (
    ("desktop", "minibot-desktop"),
)


@dataclass(frozen=True)
class SyncResult:
    changed_files: list[str]


def promote_unreleased_changelog(source: str, version: str, release_date: str) -> str:
    marker = "## [Unreleased]"
    heading = f"## [{version}] - {release_date}"

    start = source.find(marker)
    if start < 0:
        raise ValueError("missing Unreleased section")

    section_start = start + len(marker)
    body_match = re.search(r"\n(?=## \[|\Z)", source[section_start:], flags=re.S)
    if body_match is None:
        raise ValueError("missing changelog section body")

    body_end = section_start + body_match.start()
    body = source[section_start:body_end].strip("\n")
    rest = source[body_end:]

    replacement = f"{marker}\n\n{heading}\n\n"
    if body:
        replacement += body + "\n\n"
    return source[:start] + replacement + rest.lstrip("\n")


def sync_release_versions(repo_root: Path, version: str, release_date: str) -> list[str]:
    changed_files: list[str] = []

    def write_text(relative_path: str, text: str) -> None:
        path = repo_root / relative_path
        current = path.read_text(encoding="utf-8")
        if current != text:
            path.write_text(text, encoding="utf-8")
            changed_files.append(relative_path)

    def write_json(relative_path: str, updater) -> None:
        path = repo_root / relative_path
        data = json.loads(path.read_text(encoding="utf-8"))
        original = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        updater(data)
        updated = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        if original != updated:
            path.write_text(updated, encoding="utf-8")
            changed_files.append(relative_path)

    write_json("webui/package.json", lambda data: data.__setitem__("version", version))
    write_json(
        "webui/package-lock.json",
        lambda data: (
            data.__setitem__("version", version),
            data.setdefault("packages", {}).setdefault("", {}).__setitem__("version", version),
        ),
    )
    for prefix, cargo_name in _TAURI_PACKAGES:
        _sync_tauri_package(repo_root, write_json, write_text, prefix, cargo_name, version)
    write_text(
        "minibot/pyproject.toml",
        _replace_first_version_line((repo_root / "minibot/pyproject.toml").read_text(encoding="utf-8"), version),
    )
    write_text(
        "minibot/src/minibot/__init__.py",
        _replace_first_assignment(
            (repo_root / "minibot/src/minibot/__init__.py").read_text(encoding="utf-8"),
            "__version__",
            version,
        ),
    )
    write_json(
        "packages/minibot-client/package.json",
        lambda data: data.__setitem__("version", version),
    )
    for changelog_path in CHANGELOG_FILES:
        path = repo_root / changelog_path
        write_text(changelog_path, promote_unreleased_changelog(path.read_text(encoding="utf-8"), version, release_date))

    return changed_files


def check_release_preflight(
    *,
    changed_files: list[str],
    version_files_changed: list[str],
    changelog_files_changed: list[str],
) -> list[str]:
    if _has_release_source_changes(changed_files) and not (version_files_changed or changelog_files_changed):
        return [
            "Release-related source changes were detected, but no version or changelog files changed. Update the release version and CHANGELOG before merging."
        ]
    return []


def _has_release_source_changes(changed_files: Iterable[str]) -> bool:
    for path in changed_files:
        if any(path.startswith(prefix) for prefix in SOURCE_PREFIXES):
            return True
    return False


def _sync_tauri_package(
    repo_root: Path,
    write_json,
    write_text,
    prefix: str,
    cargo_name: str,
    version: str,
) -> None:
    write_json(f"{prefix}/package.json", lambda data: data.__setitem__("version", version))
    write_json(
        f"{prefix}/package-lock.json",
        lambda data: (
            data.__setitem__("version", version),
            data.setdefault("packages", {}).setdefault("", {}).__setitem__("version", version),
        ),
    )
    write_text(
        f"{prefix}/src-tauri/Cargo.toml",
        _replace_first_version_line((repo_root / f"{prefix}/src-tauri/Cargo.toml").read_text(encoding="utf-8"), version),
    )
    write_text(
        f"{prefix}/src-tauri/Cargo.lock",
        _replace_cargo_lock_version(
            (repo_root / f"{prefix}/src-tauri/Cargo.lock").read_text(encoding="utf-8"),
            version,
            cargo_name,
        ),
    )
    write_json(
        f"{prefix}/src-tauri/tauri.conf.json",
        lambda data: (
            data.__setitem__("version", version),
            data.setdefault("bundle", {})
            .setdefault("windows", {})
            .setdefault("wix", {})
            .__setitem__("version", _installer_version(version)),
        ),
    )


def _installer_version(version: str) -> str:
    parts = version.split(".")
    if len(parts) == 3 and all(part.isdigit() for part in parts):
        return f"{version}.0"
    return version


def _replace_first_version_line(source: str, version: str) -> str:
    return re.sub(r'(?m)^version = ".*"$', f'version = "{version}"', source, count=1)


def _replace_first_assignment(source: str, name: str, version: str) -> str:
    pattern = rf'(?m)^{re.escape(name)}\s*=\s*".*"$'
    return re.sub(pattern, f'{name} = "{version}"', source, count=1)


def _replace_cargo_lock_version(source: str, version: str, package_name: str = "minibot-desktop") -> str:
    pattern = rf'(?ms)(\[\[package\]\]\nname = "{re.escape(package_name)}"\nversion = ")([^"]+)(")'
    updated, count = re.subn(pattern, rf"\g<1>{version}\3", source, count=1)
    if count:
        return updated
    return _replace_first_version_line(source, version)


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m minibot.release_tools")
    subparsers = parser.add_subparsers(dest="command", required=True)

    sync = subparsers.add_parser("sync", help="Sync release version fields and changelogs")
    sync.add_argument("--repo-root", default=".")
    sync.add_argument("--version", required=True)
    sync.add_argument("--release-date", required=True)

    check = subparsers.add_parser("check", help="Validate release preflight conditions")
    check.add_argument("--changed-files", nargs="*", default=[])
    check.add_argument("--version-files", nargs="*", default=[])
    check.add_argument("--changelog-files", nargs="*", default=[])

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)

    if args.command == "sync":
        changed = sync_release_versions(Path(args.repo_root), args.version, args.release_date)
        for path in changed:
            print(path)
        return 0

    if args.command == "check":
        issues = check_release_preflight(
            changed_files=args.changed_files,
            version_files_changed=args.version_files,
            changelog_files_changed=args.changelog_files,
        )
        for issue in issues:
            print(issue, file=sys.stderr)
        return 1 if issues else 0

    raise AssertionError(f"Unhandled command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
