"""Post-process Blender renders into game-ready RGBA sprites."""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "art-source" / "sprites" / "raw"
OUT = ROOT / "public" / "assets" / "sprites"
OUT.mkdir(parents=True, exist_ok=True)

# name, output name, canvas size, fit ratio, outline px
ASSETS = [
    ("player_raw.png", "player.png", 256, 0.90, 5),
    ("beetle_raw.png", "beetle.png", 256, 0.90, 5),
    ("bat_raw.png", "bat.png", 256, 0.90, 5),
    ("boss_raw.png", "boss.png", 512, 0.92, 7),
]


def grade(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    rgb = ImageEnhance.Contrast(rgb).enhance(1.08)
    rgb = ImageEnhance.Color(rgb).enhance(1.08)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.03)
    out = rgb.convert("RGBA")
    out.putalpha(im.getchannel("A"))
    return out


def add_outline(im: Image.Image, px: int, color=(4, 7, 13, 255)) -> Image.Image:
    alpha = im.getchannel("A")
    grown = alpha.filter(ImageFilter.MaxFilter(px * 2 + 1))
    outline = Image.new("RGBA", im.size, color)
    outline.putalpha(grown)
    outline.alpha_composite(im)
    return outline


def main() -> None:
    random.seed(7)
    for raw_name, out_name, canvas_size, fit, outline_px in ASSETS:
        im = Image.open(RAW / raw_name).convert("RGBA")
        bbox = im.getchannel("A").getbbox()
        if bbox:
            im = im.crop(bbox)
        im = grade(im)

        # scale to the target canvas with breathing room
        max_side = int(canvas_size * fit)
        scale = min(max_side / im.width, max_side / im.height)
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
        im = add_outline(im, outline_px)

        canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        canvas.alpha_composite(im, ((canvas_size - im.width) // 2, (canvas_size - im.height) // 2))
        canvas.save(OUT / out_name)
        print(f"{out_name}: {canvas.size}, {canvas.getbbox()}")


if __name__ == "__main__":
    main()
