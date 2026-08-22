#!/usr/bin/env python3
"""Generate macOS DMG window background (app → Applications drag hint)."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Match tauri.conf.json bundle.macOS.dmg windowSize and icon positions.
WIDTH = 660
HEIGHT = 400
BG = (245, 245, 247)
STROKE = (168, 168, 173)
STROKE_WIDTH = 3
DASH = 12
GAP = 9

OUT = Path(__file__).resolve().parents[2] / "src-tauri" / "dmg" / "background.png"

APP_CENTER = (180, 170)
APPS_CENTER = (480, 170)
ICON_SIZE = 96


def _dash_polyline(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]]) -> None:
    for a, b in zip(points, points[1:], strict=False):
        x0, y0 = a
        x1, y1 = b
        length = math.hypot(x1 - x0, y1 - y0)
        if length < 1:
            continue
        ux, uy = (x1 - x0) / length, (y1 - y0) / length
        pos = 0.0
        drawing = True
        while pos < length:
            seg = DASH if drawing else GAP
            end = min(pos + seg, length)
            if drawing:
                sx, sy = x0 + ux * pos, y0 + uy * pos
                ex, ey = x0 + ux * end, y0 + uy * end
                draw.line([(sx, sy), (ex, ey)], fill=STROKE, width=STROKE_WIDTH)
            pos = end
            drawing = not drawing


def _quad_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    steps: int,
) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
        y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
        out.append((x, y))
    return out


def _arrow_head(draw: ImageDraw.ImageDraw, tip: tuple[float, float], angle: float) -> None:
    tx, ty = tip
    size = 15
    wing = math.radians(26)
    left = (
        tx - size * math.cos(angle - wing),
        ty - size * math.sin(angle - wing),
    )
    right = (
        tx - size * math.cos(angle + wing),
        ty - size * math.sin(angle + wing),
    )
    draw.polygon([tip, left, right], outline=STROKE, fill=BG, width=STROKE_WIDTH)


def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold
        else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _draw_app_icon(draw: ImageDraw.ImageDraw, center: tuple[int, int]) -> None:
    cx, cy = center
    half = ICON_SIZE // 2
    x0, y0 = cx - half, cy - half
    x1, y1 = cx + half, cy + half
    # Rounded app tile (minibot brand dark + mint chevron)
    draw.rounded_rectangle(
        (x0, y0, x1, y1),
        radius=18,
        fill=(18, 34, 53),
        outline=(124, 235, 207, 80),
        width=2,
    )
    # Mint chevron mark
    chevron = [
        (cx - 22, cy + 14),
        (cx, cy - 10),
        (cx + 22, cy + 14),
    ]
    draw.line(chevron, fill=(141, 245, 216), width=7, joint="curve")
    draw.ellipse((cx - 3, cy - 22, cx + 3, cy - 16), fill=(141, 245, 216))


def _draw_applications_folder(draw: ImageDraw.ImageDraw, center: tuple[int, int]) -> None:
    cx, cy = center
    half = ICON_SIZE // 2
    x0, y0 = cx - half, cy - half + 6
    x1, y1 = cx + half, cy + half + 6
    tab_w = ICON_SIZE * 0.42
    tab_h = 16
    tab_x0 = x0 + 10
    tab_y0 = y0 - 6
    tab_x1 = tab_x0 + tab_w
    tab_y1 = tab_y0 + tab_h
    draw.rounded_rectangle((x0, y0, x1, y1), radius=10, fill=(96, 168, 250))
    draw.polygon(
        [(tab_x0, tab_y0 + tab_h), (tab_x0, tab_y0), (tab_x1, tab_y0), (tab_x1, tab_y0 + tab_h)],
        fill=(120, 184, 255),
    )
    # Folder front panel
    inset = 14
    draw.rounded_rectangle(
        (x0 + inset, y0 + inset, x1 - inset, y1 - inset),
        radius=4,
        fill=(220, 232, 248),
    )
    # Grid hint on folder
    grid_color = (150, 178, 210)
    for gx in range(x0 + inset + 8, x1 - inset - 8, 14):
        draw.line([(gx, y0 + inset + 10), (gx, y1 - inset - 10)], fill=grid_color, width=1)
    for gy in range(y0 + inset + 10, y1 - inset - 8, 14):
        draw.line([(x0 + inset + 8, gy), (x1 - inset - 8, gy)], fill=grid_color, width=1)


def _draw_caption(
    draw: ImageDraw.ImageDraw,
    text: str,
    center_x: int,
    top_y: int,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    width = bbox[2] - bbox[0]
    draw.text((center_x - width / 2, top_y), text, fill=(110, 110, 118), font=font)


def main() -> None:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    title_font = _load_font(15, bold=True)
    label_font = _load_font(13)

    _draw_app_icon(draw, APP_CENTER)
    _draw_applications_folder(draw, APPS_CENTER)

    _draw_caption(draw, "minibot", APP_CENTER[0], APP_CENTER[1] + ICON_SIZE // 2 + 14, title_font)
    _draw_caption(draw, "Applications", APPS_CENTER[0], APPS_CENTER[1] + ICON_SIZE // 2 + 20, title_font)

    # Dashed arrow between icons
    start = (APP_CENTER[0] + 58, APP_CENTER[1] + 8)
    control = (WIDTH // 2, APP_CENTER[1] - 52)
    end = (APPS_CENTER[0] - 58, APPS_CENTER[1] + 8)
    points = _quad_bezier(start, control, end, steps=56)
    _dash_polyline(draw, points)

    tip = points[-1]
    prev = points[-3]
    angle = math.atan2(tip[1] - prev[1], tip[0] - prev[0])
    _arrow_head(draw, tip, angle)

    hint = "Drag minibot to Applications folder"
    hint_bbox = draw.textbbox((0, 0), hint, font=label_font)
    hint_w = hint_bbox[2] - hint_bbox[0]
    draw.text(((WIDTH - hint_w) / 2, HEIGHT - 42), hint, fill=(130, 130, 138), font=label_font)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, format="PNG", optimize=True)
    print(f"wrote {OUT} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
