#!/usr/bin/env python3
"""Cut the pedestal photo into base + lever PNGs for page 04."""

from __future__ import annotations

from PIL import Image, ImageFilter

SRC = "UI Design/assets/throttle-pedestal-source.jpg"
OUT_LEVER = "public/assets/throttle/lever.png"

# Crop off the 豆包 watermark along the bottom edge
CROP_BOTTOM = 990

# Two A/T DISC knobs (rounded rectangles), source coordinates before crop
KNOBS = [
    # (x0, y0, x1, y1, corner_radius)
    (284, 554, 410, 682, 22),
    (416, 554, 542, 682, 22),
]

# Horizontal band just above the knobs: used to clone tracks+panel into the hole
CLONE_Y = 500


def rounded_rect_sdf(x: float, y: float, x0: float, y0: float, x1: float, y1: float, r: float) -> float:
    """Signed distance to a rounded rect. Negative = inside."""
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    hw = (x1 - x0) / 2
    hh = (y1 - y0) / 2
    dx = abs(x - cx) - (hw - r)
    dy = abs(y - cy) - (hh - r)
    ax, ay = max(dx, 0.0), max(dy, 0.0)
    return (ax * ax + ay * ay) ** 0.5 + min(max(dx, dy), 0.0) - r


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    src = src.crop((0, 0, src.size[0], CROP_BOTTOM))
    w, h = src.size
    px = src.load()

    # Soft mask: 0-255 coverage of the two knobs
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            d = min(rounded_rect_sdf(x + 0.5, y + 0.5, *k) for k in KNOBS)
            # 1.5px feather
            if d < -1.5:
                mp[x, y] = 255
            elif d < 1.5:
                mp[x, y] = int(255 * (1.5 - d) / 3.0)

    # Pull in the contact shadow: nearby pixels darker than the local panel
    shadow = Image.new("L", (w, h), 0)
    sp = shadow.load()
    panel_ref = 155  # typical panel luma beside the knobs
    for y in range(548, min(h, 700)):
        for x in range(260, 560):
            if mp[x, y] > 200:
                continue
            r, g, b, _ = px[x, y]
            luma = (r + g + b) / 3
            # only consider a halo around the knobs
            d = min(rounded_rect_sdf(x + 0.5, y + 0.5, *k) for k in KNOBS)
            if 0 < d < 14 and luma < panel_ref - 12:
                falloff = 1.0 - d / 14.0
                dark = min(1.0, (panel_ref - luma) / 50.0)
                sp[x, y] = int(220 * falloff * dark)

    # Combined lever alpha
    lever_alpha = Image.new("L", (w, h), 0)
    la = lever_alpha.load()
    for y in range(h):
        for x in range(w):
            la[x, y] = max(mp[x, y], sp[x, y])

    lever = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    lp = lever.load()
    for y in range(h):
        for x in range(w):
            a = la[x, y]
            if a:
                r, g, b, _ = px[x, y]
                lp[x, y] = (r, g, b, a)

    # Base: original, hole filled by cloning a mid-track row
    base = src.copy()
    bp = base.load()
    clone_row = [px[x, CLONE_Y] for x in range(w)]
    # Dilate the fill so no halo of original knob remains
    fill = lever_alpha.filter(ImageFilter.MaxFilter(5))
    fp = fill.load()
    for y in range(h):
        for x in range(w):
            if fp[x, y] > 8:
                bp[x, y] = clone_row[x]
    # Sweep leftover white knob pixels the geometry mask missed
    for y in range(548, 700):
        for x in range(270, 555):
            r, g, b, _ = bp[x, y]
            if r > 200 and g > 195 and b > 190:
                bp[x, y] = clone_row[x]

    # JPEG base (no alpha needed) keeps the payload small on mobile
    OUT_BASE_JPG = "public/assets/throttle/base.jpg"
    base.convert("RGB").save(OUT_BASE_JPG, "JPEG", quality=86, optimize=True)
    lever.save(OUT_LEVER, "PNG", optimize=True)
    print(f"base  {base.size} -> {OUT_BASE_JPG}")
    print(f"lever {lever.size} -> {OUT_LEVER}")


if __name__ == "__main__":
    main()
