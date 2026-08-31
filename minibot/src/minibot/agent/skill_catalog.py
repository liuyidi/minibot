"""Optional skill catalog (external packs such as MiniMax / ClawHub / GitHub)."""

from __future__ import annotations

import io
import json
import shutil
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from minibot.agent.skills import SkillsRegistry, _SKILL_NAME_RE

_CATALOG_CONFIG_PATH = Path(__file__).with_name("skill_catalog.json")
_CLAWHUB_API = "https://clawhub.ai/api/v1"
_UA = "minibot-skill-catalog/1.0 (+https://github.com/MiniMax-AI/skills)"
_HTTP_RETRIES = 4
_HTTP_RETRY_BASE_S = 0.6


@lru_cache(maxsize=1)
def _load_catalog_config() -> dict[str, Any]:
    """Load curated optional-skill entries from skill_catalog.json."""
    try:
        raw = json.loads(_CATALOG_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"failed to load skill catalog config: {_CATALOG_CONFIG_PATH}") from exc
    if not isinstance(raw, dict):
        raise RuntimeError(f"skill catalog config must be an object: {_CATALOG_CONFIG_PATH}")
    return raw


def _catalog_section(name: str) -> dict[str, Any]:
    section = _load_catalog_config().get(name)
    return section if isinstance(section, dict) else {}


def _catalog_skills(name: str) -> list[dict[str, str]]:
    skills = _catalog_section(name).get("skills")
    if not isinstance(skills, list):
        return []
    return [item for item in skills if isinstance(item, dict)]


def _minimax_repo() -> str:
    return str(_catalog_section("minimax").get("repo") or "MiniMax-AI/skills")


def _minimax_ref() -> str:
    return str(_catalog_section("minimax").get("ref") or "main")


def __getattr__(name: str) -> Any:
    """Lazy catalog aliases for ``from minibot.agent.skill_catalog import MINIMAX_…``."""
    if name == "MINIMAX_SKILL_CATALOG":
        return _catalog_skills("minimax")
    if name == "CLAWHUB_SKILL_CATALOG":
        return _catalog_skills("clawhub")
    if name == "GITHUB_SKILL_CATALOG":
        return _catalog_skills("github")
    if name == "_MINIMAX_REPO":
        return _minimax_repo()
    if name == "_MINIMAX_REF":
        return _minimax_ref()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


_TRANSIENT_HTTP_ERRORS = (
    urllib.error.URLError,
    TimeoutError,
    ssl.SSLError,
    ConnectionError,
    BrokenPipeError,
)
_DOWNLOAD_ERRORS = (urllib.error.HTTPError, *_TRANSIENT_HTTP_ERRORS)
_FETCH_ERRORS = (*_TRANSIENT_HTTP_ERRORS, json.JSONDecodeError)


def list_skill_catalog() -> list[dict[str, Any]]:
    """Public optional-skill templates for the Skills hub."""
    out: list[dict[str, Any]] = []
    minimax_repo = _minimax_repo()
    minimax_ref = _minimax_ref()
    for item in _catalog_skills("minimax"):
        out.append(
            {
                "id": item["id"],
                "label": item["label"],
                "label_zh": item.get("label_zh") or item["label"],
                "description": item["description"],
                "description_zh": item["description_zh"],
                "source": "minimax",
                "repo": minimax_repo,
                "path": f"skills/{item['id']}",
                "homepage": f"https://github.com/{minimax_repo}/tree/{minimax_ref}/skills/{item['id']}",
            }
        )
    for item in _catalog_skills("clawhub"):
        out.append(
            {
                "id": item["id"],
                "label": item["label"],
                "label_zh": item.get("label_zh") or item["label"],
                "description": item["description"],
                "description_zh": item["description_zh"],
                "source": "clawhub",
                "slug": item["slug"],
                "homepage": item.get("homepage")
                or f"https://clawhub.ai/skills/{item['slug']}",
            }
        )
    for item in _catalog_skills("github"):
        repo = item["repo"]
        path = item["path"]
        ref = item.get("ref") or "main"
        out.append(
            {
                "id": item["id"],
                "label": item["label"],
                "label_zh": item.get("label_zh") or item["label"],
                "description": item["description"],
                "description_zh": item["description_zh"],
                "source": "github",
                "repo": repo,
                "path": path,
                "ref": ref,
                "homepage": item.get("homepage")
                or f"https://github.com/{repo}/tree/{ref}/{path}",
            }
        )
    return out


def find_catalog_entry(template_id: str) -> dict[str, Any] | None:
    tid = (template_id or "").strip()
    for item in list_skill_catalog():
        if item["id"] == tid:
            return item
    return None


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    # OpenSSL 3 may abort on abrupt peer close during large raw-file downloads.
    ignore_eof = getattr(ssl, "OP_IGNORE_UNEXPECTED_EOF", 0)
    if ignore_eof:
        ctx.options |= ignore_eof
    return ctx


def _http_open(req: urllib.request.Request, *, timeout: float):
    return urllib.request.urlopen(req, timeout=timeout, context=_ssl_context())  # noqa: S310


def _http_read(url: str, *, accept: str | None, timeout: float) -> bytes:
    headers = {"User-Agent": _UA}
    if accept:
        headers["Accept"] = accept
    req = urllib.request.Request(url, headers=headers)
    last_exc: BaseException | None = None
    for attempt in range(_HTTP_RETRIES):
        try:
            with _http_open(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            # Retry transient GitHub / CDN failures.
            if exc.code in {408, 429, 500, 502, 503, 504} and attempt + 1 < _HTTP_RETRIES:
                last_exc = exc
                time.sleep(_HTTP_RETRY_BASE_S * (2**attempt))
                continue
            raise
        except _TRANSIENT_HTTP_ERRORS as exc:
            last_exc = exc
            if attempt + 1 >= _HTTP_RETRIES:
                break
            time.sleep(_HTTP_RETRY_BASE_S * (2**attempt))
    assert last_exc is not None
    raise last_exc


def _http_json(url: str) -> Any:
    raw = _http_read(
        url,
        accept="application/vnd.github+json",
        timeout=45,
    )
    return json.loads(raw.decode("utf-8"))


def _http_bytes(url: str) -> bytes:
    return _http_read(url, accept=None, timeout=120)


def _download_github_subdir_zip(*, owner_repo: str, path: str, dest: Path, ref: str) -> None:
    """Download repo zip once and extract a subdirectory (avoids flaky per-file TLS)."""
    zip_urls = (
        f"https://codeload.github.com/{owner_repo}/zip/refs/heads/{ref}",
        f"https://api.github.com/repos/{owner_repo}/zipball/{ref}",
        f"https://github.com/{owner_repo}/archive/refs/heads/{ref}.zip",
    )
    data: bytes | None = None
    errors: list[str] = []
    for url in zip_urls:
        try:
            data = _http_bytes(url)
            break
        except _DOWNLOAD_ERRORS as exc:
            errors.append(f"{url}: {exc}")
    if data is None:
        raise ValueError(f"failed to download zip for {owner_repo}@{ref}: {'; '.join(errors)}")

    want = path.strip("/")
    want_prefix = f"{want}/"
    dest.mkdir(parents=True, exist_ok=True)
    extracted = 0
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            # Archive roots look like "skills-main/skills/frontend-dev/…"
            parts = info.filename.replace("\\", "/").split("/", 1)
            if len(parts) < 2:
                continue
            rel = parts[1]
            if rel == want or rel.startswith(want_prefix):
                out_rel = Path(rel[len(want) :].lstrip("/"))
                if not out_rel.parts:
                    continue
                target = dest / out_rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(zf.read(info))
                extracted += 1
    if extracted <= 0:
        raise ValueError(f"zip archive missing path {want!r} in {owner_repo}@{ref}")


def _download_github_subdir_git(*, owner_repo: str, path: str, dest: Path, ref: str) -> None:
    """Shallow git clone + copy subdirectory (reliable when HTTPS zip/TLS flakes)."""
    import subprocess
    import tempfile

    git = shutil.which("git")
    if not git:
        raise ValueError("git is not available")

    dest.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="minibot-skill-git-") as tmp:
        repo_dir = Path(tmp) / "repo"
        url = f"https://github.com/{owner_repo}.git"
        try:
            subprocess.run(
                [
                    git,
                    "clone",
                    "--depth",
                    "1",
                    "--branch",
                    ref,
                    "--single-branch",
                    "--filter=blob:none",
                    "--sparse",
                    url,
                    str(repo_dir),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=180,
            )
            subprocess.run(
                [git, "-C", str(repo_dir), "sparse-checkout", "set", "--cone", path],
                check=True,
                capture_output=True,
                text=True,
                timeout=120,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as exc:
            detail = ""
            if isinstance(exc, subprocess.CalledProcessError):
                detail = (exc.stderr or exc.stdout or "").strip()
            elif isinstance(exc, subprocess.TimeoutExpired):
                detail = "timed out"
            else:
                detail = str(exc)
            raise ValueError(f"git clone failed for {owner_repo}@{ref}: {detail or exc}") from exc

        src = repo_dir / path
        if not src.is_dir():
            raise ValueError(f"git checkout missing path {path!r} in {owner_repo}@{ref}")
        for item in src.iterdir():
            target = dest / item.name
            if item.is_dir():
                shutil.copytree(item, target, dirs_exist_ok=True)
            else:
                shutil.copy2(item, target)


def _download_github_dir(*, owner_repo: str, path: str, dest: Path, ref: str) -> None:
    """Recursively download a GitHub directory into dest (Contents API fallback)."""
    api = f"https://api.github.com/repos/{owner_repo}/contents/{path}?ref={ref}"
    try:
        payload = _http_json(api)
    except urllib.error.HTTPError as exc:
        raise ValueError(f"failed to fetch {owner_repo}/{path}: HTTP {exc.code}") from exc
    except _FETCH_ERRORS as exc:
        raise ValueError(f"failed to fetch {owner_repo}/{path}: {exc}") from exc

    if not isinstance(payload, list):
        raise ValueError(f"expected directory listing for {path}")

    dest.mkdir(parents=True, exist_ok=True)
    for item in payload:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "")
        item_type = str(item.get("type") or "")
        item_path = str(item.get("path") or "")
        if not name or not item_path:
            continue
        target = dest / name
        if item_type == "dir":
            _download_github_dir(owner_repo=owner_repo, path=item_path, dest=target, ref=ref)
            continue
        if item_type != "file":
            continue
        download_url = item.get("download_url")
        if not isinstance(download_url, str) or not download_url:
            raise ValueError(f"missing download_url for {item_path}")
        try:
            data = _http_bytes(download_url)
        except _DOWNLOAD_ERRORS as exc:
            raise ValueError(f"failed to download {item_path}: {exc}") from exc
        target.write_bytes(data)


def _download_github_skill(*, owner_repo: str, path: str, dest: Path, ref: str) -> None:
    """Install skill files: zip → git sparse → Contents API (last resort)."""
    errors: list[str] = []

    try:
        _download_github_subdir_zip(owner_repo=owner_repo, path=path, dest=dest, ref=ref)
        return
    except ValueError as exc:
        errors.append(f"zip: {exc}")

    try:
        _download_github_subdir_git(owner_repo=owner_repo, path=path, dest=dest, ref=ref)
        return
    except ValueError as exc:
        errors.append(f"git: {exc}")

    try:
        _download_github_dir(owner_repo=owner_repo, path=path, dest=dest, ref=ref)
        return
    except ValueError as exc:
        errors.append(f"contents-api: {exc}")

    raise ValueError(
        "failed to install skill from GitHub ("
        + " | ".join(errors)
        + "). Check network access to github.com / codeload.github.com."
    )


def install_catalog_skill(workspace: Path | str, template_id: str) -> Any:
    """Download a catalog skill into workspace/skills/<id>/ and return SkillInfo."""
    entry = find_catalog_entry(template_id)
    if entry is None:
        raise ValueError(f"unknown skill template: {template_id}")
    skill_id = entry["id"]
    if not _SKILL_NAME_RE.match(skill_id):
        raise ValueError(f"invalid skill id: {skill_id}")

    root = Path(workspace).expanduser()
    target = root / "skills" / skill_id
    staging = root / "skills" / f".{skill_id}.installing"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=True)
    try:
        source = str(entry.get("source") or "minimax")
        if source == "clawhub":
            _download_clawhub_skill(slug=str(entry["slug"]), dest=staging)
        else:
            _download_github_skill(
                owner_repo=str(entry["repo"]),
                path=str(entry["path"]),
                dest=staging,
                ref=str(entry.get("ref") or _minimax_ref()),
            )
        if not (staging / "SKILL.md").is_file():
            raise ValueError(f"catalog skill missing SKILL.md: {skill_id}")
        _ensure_skill_frontmatter(
            staging / "SKILL.md",
            name=skill_id,
            description=str(entry.get("description") or skill_id),
        )
        if target.exists():
            shutil.rmtree(target)
        staging.rename(target)
    except Exception:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        raise

    reg = SkillsRegistry(root)
    skill = reg.get(skill_id)
    if skill is None:
        # Frontmatter name may differ from catalog folder id; load by path.
        from minibot.agent.skills import _load_skill_file

        skill = _load_skill_file(target / "SKILL.md", source="workspace", name=skill_id)
    if skill is None:
        raise ValueError(f"failed to load installed skill: {skill_id}")
    # Newly installed catalog skills start enabled.
    if not reg.is_enabled(skill.name):
        reg.set_enabled(skill.name, True)
    return skill


def _ensure_skill_frontmatter(skill_md: Path, *, name: str, description: str) -> None:
    """Prepend YAML frontmatter when upstream SKILL.md has none (e.g. some ClawHub packs)."""
    try:
        raw = skill_md.read_text(encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"failed to read SKILL.md: {exc}") from exc
    if raw.lstrip().startswith("---"):
        return
    desc = " ".join((description or name).split())
    if len(desc) > 280:
        desc = desc[:277].rstrip() + "..."
    # Escape YAML double quotes in description.
    desc = desc.replace("\\", "\\\\").replace('"', '\\"')
    frontmatter = f'---\nname: {name}\ndescription: "{desc}"\n---\n\n'
    skill_md.write_text(frontmatter + raw, encoding="utf-8")


def _download_clawhub_skill(*, slug: str, dest: Path) -> None:
    """Download a ClawHub skill package (all versioned files) into dest."""
    slug = (slug or "").strip()
    if not slug:
        raise ValueError("clawhub slug is required")
    meta_url = f"{_CLAWHUB_API}/skills/{slug}"
    try:
        payload = _http_json(meta_url)
    except urllib.error.HTTPError as exc:
        raise ValueError(f"failed to fetch clawhub skill {slug}: HTTP {exc.code}") from exc
    except _FETCH_ERRORS as exc:
        raise ValueError(f"failed to fetch clawhub skill {slug}: {exc}") from exc

    skill = payload.get("skill") if isinstance(payload, dict) else None
    if not isinstance(skill, dict):
        raise ValueError(f"clawhub skill payload missing skill: {slug}")

    tags = skill.get("tags") if isinstance(skill.get("tags"), dict) else {}
    version = str(tags.get("latest") or "").strip()
    if not version:
        latest = payload.get("latestVersion") if isinstance(payload, dict) else None
        if isinstance(latest, dict):
            version = str(latest.get("version") or "").strip()
    if not version:
        raise ValueError(f"clawhub skill has no version: {slug}")

    try:
        version_payload = _http_json(f"{_CLAWHUB_API}/skills/{slug}/versions/{version}")
    except urllib.error.HTTPError as exc:
        raise ValueError(
            f"failed to fetch clawhub skill version {slug}@{version}: HTTP {exc.code}"
        ) from exc
    except _FETCH_ERRORS as exc:
        raise ValueError(f"failed to fetch clawhub skill version {slug}@{version}: {exc}") from exc

    version_info = version_payload.get("version") if isinstance(version_payload, dict) else None
    files = version_info.get("files") if isinstance(version_info, dict) else None
    dest.mkdir(parents=True, exist_ok=True)

    if isinstance(files, list) and files:
        for item in files:
            if not isinstance(item, dict):
                continue
            rel = str(item.get("path") or "").strip().lstrip("/")
            if not rel or rel.startswith("..") or "/../" in f"/{rel}/":
                continue
            file_url = (
                f"{_CLAWHUB_API}/skills/{slug}/file?"
                f"{urllib.parse.urlencode({'path': rel, 'version': version})}"
            )
            try:
                data = _http_bytes(file_url)
            except _DOWNLOAD_ERRORS as exc:
                raise ValueError(f"failed to download clawhub file {slug}/{rel}: {exc}") from exc
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    else:
        # Fallback: API embeds full SKILL.md in skill.description.
        markdown = skill.get("description")
        if not isinstance(markdown, str) or not markdown.strip().startswith("---"):
            raise ValueError(f"clawhub skill missing SKILL.md content: {slug}")
        (dest / "SKILL.md").write_text(markdown, encoding="utf-8")

    if not (dest / "SKILL.md").is_file():
        raise ValueError(f"clawhub skill package missing SKILL.md: {slug}")
