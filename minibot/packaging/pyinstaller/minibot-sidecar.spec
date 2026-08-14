# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller onedir spec for minibot desktop sidecar."""

from __future__ import annotations

from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

SPECDIR = Path(SPECPATH).resolve()
PACKAGING = SPECDIR
MINIBOT_ROOT = PACKAGING.parents[1]  # minibot/
REPO_ROOT = MINIBOT_ROOT.parent
WEBUI_DIST = REPO_ROOT / "webui" / "dist"
SRC = MINIBOT_ROOT / "src"

if not (WEBUI_DIST / "index.html").is_file():
    raise SystemExit(f"webui dist missing: {WEBUI_DIST} (run: cd webui && npm run build)")

hiddenimports: list[str] = []
datas: list[tuple[str, str]] = []
binaries: list[tuple[str, str]] = []


def _safe_collect(pkg: str) -> None:
    global datas, binaries, hiddenimports
    try:
        pkg_datas, pkg_binaries, pkg_hidden = collect_all(
            pkg,
            on_error="ignore",
            filter_submodules=lambda name: ".cli" not in name and not name.endswith(".cli"),
        )
        datas += pkg_datas
        binaries += pkg_binaries
        hiddenimports += pkg_hidden
    except Exception:
        try:
            hiddenimports += collect_submodules(
                pkg,
                on_error="ignore",
                filter=lambda name: ".cli" not in name and not name.endswith(".cli"),
            )
        except Exception:
            hiddenimports.append(pkg)


for pkg in (
    "uvicorn",
    "fastapi",
    "starlette",
    "httpx",
    "anyio",
    "pydantic",
    "pydantic_settings",
    "croniter",
    "yaml",
    "multipart",
):
    _safe_collect(pkg)

# mcp CLI submodule sys.exits without typer — collect carefully.
try:
    hiddenimports += collect_submodules(
        "mcp",
        on_error="ignore",
        filter=lambda name: "cli" not in name.split("."),
    )
except Exception:
    hiddenimports.append("mcp")

# Ship the full package tree on disk. Datas-only under ``minibot/`` (skills/static)
# would shadow the PYZ package and break ``import minibot.main`` (uvicorn string
# target). On-disk sources also keep ``Path(__file__)`` resource paths working.
datas.append((str(SRC / "minibot"), "minibot"))
try:
    hiddenimports += collect_submodules("minibot", on_error="ignore")
except Exception:
    hiddenimports.append("minibot")

hiddenimports += [
    "minibot.main",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
]

datas.append((str(WEBUI_DIST), "webui-dist"))

a = Analysis(
    [str(PACKAGING / "run_sidecar.py")],
    pathex=[str(SRC)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["mcp.cli", "typer"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="minibot-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="minibot-sidecar",
)
