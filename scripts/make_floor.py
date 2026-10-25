"""Generate a dark dungeon arena floor texture with Pillow."""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "textures"
OUT.mkdir(parents=True, exist_ok=True)

SIZE = 1024
random.seed(19)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def main() -> None:
    base = (8, 13, 23)
    tile_hi = (15, 25, 40)
    tile_lo = (6, 10, 18)
    grout = (3, 6, 12)
    im = Image.new("RGB", (SIZE, SIZE), base)
    draw = ImageDraw.Draw(im, "RGBA")

    # 16 x 16 stone tiles + grout
    cell = SIZE // 16
    for gy in range(16):
        for gx in range(16):
            x0, y0 = gx * cell, gy * cell
            t = random.random()
            shade = lerp(tile_lo, tile_hi, t * 0.7 + 0.15)
            inset = random.randint(2, 5)
            draw.rounded_rectangle(
                (x0 + inset, y0 + inset, x0 + cell - inset, y0 + cell - inset),
                radius=random.randint(1, 3),
                fill=(*shade, 255),
            )
            # bevel highlight
            if random.random() < 0.7:
                draw.line(
                    (x0 + inset + 2, y0 + inset + 2, x0 + cell - inset - 2, y0 + inset + 2),
                    fill=(26, 39, 58, 90),
                    width=1,
                )
            # grout gaps
            draw.line((x0, y0, x0 + cell, y0), fill=(*grout, 255), width=2)
            draw.line((x0, y0, x0, y0 + cell), fill=(*grout, 255), width=2)

    # subtle stone grain
    noise = Image.effect_noise((SIZE, SIZE), 16).convert("L")
    noise = noise.filter(ImageFilter.GaussianBlur(0.4))
    noise_rgb = Image.merge("RGB", (noise, noise, noise))
    im = Image.blend(im, noise_rgb, 0.045)

    draw = ImageDraw.Draw(im, "RGBA")

    # hairline cracks
    for _ in range(38):
        x, y = random.randint(30, SIZE - 30), random.randint(30, SIZE - 30)
        points = [(x, y)]
        angle = random.uniform(0, math.tau)
        for _ in range(random.randint(4, 12)):
            angle += random.uniform(-0.5, 0.5)
            length = random.randint(8, 28)
            x += math.cos(angle) * length
            y += math.sin(angle) * length
            points.append((x, y))
        draw.line(points, fill=(2, 4, 8, random.randint(100, 190)), width=random.choice([1, 1, 2]))
        if random.random() < 0.35:
            draw.line(points, fill=(36, 52, 74, 45), width=1)

    # faded central ritual circle
    cx = cy = SIZE // 2
    for r, alpha, width in [(318, 30, 2), (286, 22, 1), (214, 18, 1), (170, 12, 1)]:
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(120, 96, 190, alpha), width=width)
    for i in range(24):
        a = i * math.tau / 24
        x1, y1 = cx + math.cos(a) * 214, cy + math.sin(a) * 214
        x2, y2 = cx + math.cos(a) * 318, cy + math.sin(a) * 318
        draw.line((x1, y1, x2, y2), fill=(104, 88, 168, 18), width=1)
    for i in range(6):
        a = i * math.tau / 6
        x, y = cx + math.cos(a) * 245, cy + math.sin(a) * 245
        draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(101, 220, 240, 28))
    # faint rune marks
    for i in range(12):
        a = i * math.tau / 12 + 0.15
        x, y = cx + math.cos(a) * 286, cy + math.sin(a) * 286
        draw.line((x - 7, y, x + 7, y), fill=(182, 155, 255, 30), width=1)
        draw.line((x, y - 7, x, y + 7), fill=(182, 155, 255, 22), width=1)

    # scattered rubble
    for _ in range(90):
        x, y = random.randint(12, SIZE - 12), random.randint(12, SIZE - 12)
        w, h = random.randint(2, 8), random.randint(2, 5)
        shade = random.choice([(20, 30, 44), (12, 19, 30), (27, 36, 52)])
        draw.polygon(
            [(x, y), (x + w, y - h // 2), (x + w - 2, y + h), (x - 2, y + h // 2)],
            fill=(*shade, 110),
        )

    # directional light pools (warm top-left, cold bottom-right)
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for r, alpha in [(520, 10), (380, 16), (260, 18)]:
        od.ellipse((170 - r, 90 - r, 170 + r, 90 + r), fill=(255, 190, 130, alpha))
    for r, alpha in [(600, 12), (420, 12)]:
        od.ellipse((SIZE - 120 - r, SIZE - 120 - r, SIZE - 120 + r, SIZE - 120 + r),
                   fill=(80, 180, 230, alpha))
    im = Image.alpha_composite(im.convert("RGBA"), overlay).convert("RGB")

    # vignette
    vignette = Image.new("L", (SIZE, SIZE), 0)
    vd = ImageDraw.Draw(vignette)
    vd.ellipse((-SIZE * 0.18, -SIZE * 0.18, SIZE * 1.18, SIZE * 1.18), fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(120))
    dark = Image.new("RGB", (SIZE, SIZE), (2, 4, 9))
    im = Image.composite(im, dark, vignette)

    im.save(OUT / "dungeon-floor.webp", quality=91, method=6)
    print("floor written", OUT / "dungeon-floor.webp")


if __name__ == "__main__":
    main()
