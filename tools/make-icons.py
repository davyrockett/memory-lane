"""Draws the app icons. Needs Pillow.   python3 tools/make-icons.py  -> ../icons"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
BG = (241, 240, 236)
INK = (30, 27, 24)
ORANGE = (245, 124, 20)


def draw(size: int) -> Image.Image:
    s = 1024  # draw large, then shrink for smooth edges
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    # A lane winding up into the distance...
    d.polygon([(250, 900), (774, 900), (560, 470), (464, 470)], fill=(222, 218, 208))
    # ...and a big music note above it.
    d.ellipse([300, 520, 470, 640], fill=ORANGE)
    d.ellipse([560, 470, 730, 590], fill=ORANGE)
    d.rectangle([440, 200, 470, 580], fill=ORANGE)
    d.rectangle([700, 150, 730, 530], fill=ORANGE)
    d.polygon([(440, 200), (730, 150), (730, 230), (440, 280)], fill=INK)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    draw(size).save(OUT / name, optimize=True)
    print("wrote", OUT / name)
