"""
Extracts a single "symbolic" representative color from a photo — used to
drive app/about's scroll-wash color (see components/about-background.tsx's
own WASH_COLOR_RGB constant), per explicit spec ("写真内の象徴的なカラーを
抽出してスクロールした時の背景色に適用したい"). Re-run this whenever
public/images/about-hero.jpg is swapped for a different photo, then paste
the printed "CHOSEN" rgb() values into WASH_COLOR_RGB by hand (kept as a
plain constant rather than computed at build/runtime, so the value is
pinned and doesn't shift if the source photo is ever re-compressed).

Usage: python3 scripts/extract-dominant-color.py public/images/about-hero.jpg

Approach: downscale for speed, reduce to a small adaptive palette (Pillow's
own median-cut quantizer — the same algorithm classic "dominant color"
tools use), then rank those palette colors by (population * saturation)
rather than population alone — a plain "most common color" pick tends to
land on the sky or a large flat background rather than the photo's own
actual accent color, so weighting by saturation biases the pick toward
whatever's actually vivid/eye-catching in the frame (a flower, a highlight,
etc.) instead of the largest flat region.
"""

import sys
import colorsys
from PIL import Image


def dominant_color(path: str, palette_size: int = 8) -> tuple[int, int, int]:
    img = Image.open(path).convert("RGB")
    img.thumbnail((200, 200))

    paletted = img.quantize(colors=palette_size, method=Image.Quantize.MEDIANCUT)
    palette = paletted.getpalette()
    color_counts = sorted(paletted.getcolors(), reverse=True)

    ranked = []
    for count, idx in color_counts:
        r, g, b = palette[idx * 3 : idx * 3 + 3]
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        # Skip near-black/near-white/very desaturated entries outright —
        # these are almost never the "symbolic" color a person would point
        # to, just shadow/highlight/sky filler.
        if v < 0.15 or v > 0.97 or s < 0.15:
            continue
        score = count * (0.4 + s)  # saturation-weighted population
        ranked.append((score, (r, g, b), count, round(s, 2), round(v, 2)))

    ranked.sort(reverse=True)
    for score, rgb, count, s, v in ranked:
        print(f"candidate rgb={rgb} hex=#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x} count={count} sat={s} val={v} score={score:.1f}")

    if not ranked:
        raise SystemExit("No sufficiently vivid color found")
    return ranked[0][1]


if __name__ == "__main__":
    path = sys.argv[1]
    r, g, b = dominant_color(path)
    print(f"\nCHOSEN: rgb({r}, {g}, {b})  #{r:02x}{g:02x}{b:02x}")
