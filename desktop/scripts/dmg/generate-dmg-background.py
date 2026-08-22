#!/usr/bin/env python3
"""Generate macOS DMG window background (app → Applications arrow)."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

# Match tauri.conf.json bundle.macOS.dmg windowSize and icon positions.
WIDTH = 660
HEIGHT = 400
BG = (245, 245, 247)  # macOS installer gray
STROKE = (168, 168, 173)  # dashed arrow outline
STROKE_WIDTH = 3
DASH = 12
GAP = 9

OUT = Path(__file__).resolve().parents[2] / "src-tauri" / "dmg" / "background.png"


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


def main() -> None:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    # Horizontal dashed arrow between app (180,170) and Applications (480,170).
    start = (268.0, 188.0)
    control = (330.0, 132.0)  # slight upward bulge like Multica / Pen
    end = (392.0, 188.0)
    points = _quad_bezier(start, control, end, steps=56)
    _dash_polyline(draw, points)

    tip = points[-1]
    prev = points[-3]
    angle = math.atan2(tip[1] - prev[1], tip[0] - prev[0])
    _arrow_head(draw, tip, angle)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, format="PNG", optimize=True)
    print(f"wrote {OUT} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
