"""Generate the Open Innings icon set — the WICKET mark.

Geometry is four rectangles: one bail across the top, three stumps below.
Everything is drawn at 4x and downsampled with LANCZOS so the edges are clean
without needing an SVG rasterizer.

Palette is the Industry system from apps/mobile/tailwind.config.js:
  ground = scoreboard.DEFAULT #1d2d3d   (the reversed score plate)
  mark   = background         #f2f2f3   (paper)
"""

import os
from PIL import Image, ImageDraw, ImageFont

SS = 4  # supersample factor

GROUND = (0x1d, 0x2d, 0x3d, 255)
MARK = (0xf2, 0xf2, 0xf3, 255)
STEEL = (0x59, 0x7e, 0xa3, 255)

MOBILE = os.path.join("apps", "mobile", "assets")
WEB = os.path.join("apps", "web", "app")

FONT_DIR = os.path.join(
    "node_modules", ".pnpm",
    "@expo-google-fonts+barlow-condensed@0.4.1", "node_modules",
    "@expo-google-fonts", "barlow-condensed",
)


def draw_wicket(d, size, scale, color, cx=None, cy=None):
    """Draw the wicket centred at (cx, cy) on a `size` canvas.

    At scale 1.0 the mark is 448 wide x 482 tall on a 1024 grid. One pen
    weight throughout (46), three stumps 436 tall on a 172 pitch, and a bail
    overhanging the outer stumps by 29 a side. The 1:2.7 stroke-to-gap ratio
    is what keeps it reading as three rods rather than a solid slab.
    """
    if cx is None:
        cx = size / 2
    if cy is None:
        cy = size / 2

    u = (size / 1024) * scale

    bail_w, bail_t = 448 * u, 46 * u
    stump_w, stump_h, pitch = 46 * u, 436 * u, 172 * u
    total_h = bail_t + stump_h

    top = cy - total_h / 2
    d.rectangle([cx - bail_w / 2, top, cx + bail_w / 2, top + bail_t], fill=color)

    for i in (-1, 0, 1):
        x = cx + i * pitch
        d.rectangle(
            [x - stump_w / 2, top + bail_t, x + stump_w / 2, top + bail_t + stump_h],
            fill=color,
        )


def render(size, scale, color, ground=None):
    big = size * SS
    img = Image.new("RGBA", (big, big), ground if ground else (0, 0, 0, 0))
    draw_wicket(ImageDraw.Draw(img), big, scale, color)
    return img.resize((size, size), Image.LANCZOS)


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"  {path}  {img.size[0]}x{img.size[1]}  {os.path.getsize(path):,} bytes")


def _fit(draw, text, path, target_px, start_size):
    """Largest font size at or below start_size whose text fits target_px."""
    size = start_size
    while size > 8:
        font = ImageFont.truetype(path, size)
        if draw.textlength(text, font=font) <= target_px:
            return font
        size -= 2 * SS
    return ImageFont.truetype(path, size)


def feature_graphic():
    """Play Store feature graphic, 1024x500.

    Play crops this to 4:1 on some surfaces and overlays the app title on
    others, so everything sits inside a generous margin and nothing critical
    goes near an edge. Type is measured and shrunk to fit rather than sized by
    eye — the strings here are longer than they look.
    """
    W, H = 1024 * SS, 500 * SS
    img = Image.new("RGBA", (W, H), GROUND)
    d = ImageDraw.Draw(img)

    draw_wicket(d, 1024 * SS, 0.50, MARK, cx=178 * SS, cy=H / 2)

    semibold = os.path.join(FONT_DIR, "600SemiBold", "BarlowCondensed_600SemiBold.ttf")
    regular = os.path.join(FONT_DIR, "400Regular", "BarlowCondensed_400Regular.ttf")
    medium = os.path.join(FONT_DIR, "500Medium", "BarlowCondensed_500Medium.ttf")

    if not os.path.exists(semibold):
        print("  ! fonts unavailable - mark-only graphic")
        return img.resize((1024, 500), Image.LANCZOS)

    x = 352 * SS
    right_margin = 980 * SS
    avail = right_margin - x

    title = "OPEN INNINGS"
    sub = "Ball-by-ball cricket scoring. Free, forever."
    meta = "OPEN SOURCE  ·  AGPL-3.0  ·  NO ACCOUNT NEEDED TO WATCH"

    f_title = _fit(d, title, semibold, avail, 104 * SS)
    f_sub = _fit(d, sub, regular, avail, 38 * SS)
    f_meta = _fit(d, meta, medium, avail, 25 * SS)

    d.text((x, 214 * SS), title, font=f_title, fill=MARK, anchor="ls")
    d.text((x, 266 * SS), sub, font=f_sub, fill=(0x94, 0xbc, 0xe3, 255), anchor="ls")
    d.rectangle(
        [x, 300 * SS, right_margin, 302 * SS], fill=(0x41, 0x61, 0x80, 255)
    )
    d.text((x, 340 * SS), meta, font=f_meta, fill=(0x74, 0x9d, 0xc4, 255), anchor="ls")

    return img.resize((1024, 500), Image.LANCZOS)


print("Open Innings — WICKET icon set\n")

print("Expo / Android:")
# Full-bleed launcher icon. Mark at ~62% of canvas.
save(render(1024, 1.30, MARK, GROUND), os.path.join(MOBILE, "icon.png"))
# Adaptive foreground: transparent, content inside the 66% safe circle.
# Bounding-box corner is sqrt(224^2+241^2)=329 at scale 1.0 and the safe
# radius is 341, so 0.98 keeps every corner inside a circular mask with a
# little to spare.
save(render(1024, 0.98, MARK), os.path.join(MOBILE, "adaptive-icon.png"))
save(render(1024, 1.00, MARK), os.path.join(MOBILE, "splash-icon.png"))
save(render(512, 1.30, MARK, GROUND), os.path.join(MOBILE, "play-icon-512.png"))

print("\nPlay listing:")
save(feature_graphic(), os.path.join(MOBILE, "play-feature-graphic.png"))

print("\nWeb (Next.js app-router conventions):")
save(render(512, 1.30, MARK, GROUND), os.path.join(WEB, "icon.png"))
save(render(180, 1.22, MARK, GROUND), os.path.join(WEB, "apple-icon.png"))

print("\nFavicon:")
save(render(48, 1.55, MARK, GROUND), os.path.join(MOBILE, "favicon.png"))

print("\ndone.")
