# Photo-like receipt fixtures for OCR robustness tests (requires Pillow).
# Small thermal-style text, a slight tilt, blur, uneven lighting, a table background and
# JPEG compression — the conditions that make OCR drop decimal points or read them as commas.
# These are fictional receipts. Usage: python -I scripts/make-photo-fixtures.py
from pathlib import Path
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "fixtures" / "photo-like"
OUT.mkdir(parents=True, exist_ok=True)

RECEIPTS = {
    "pizza-night": [
        "MARCO'S PIZZERIA", "1500 UNIVERSITY DR", "COLLEGE STATION, TX 77840", "(979) 555-0142",
        "FICTIONAL TEST RECEIPT", "DATE 10/24/2026 7:42 PM", "ORDER 4471", "",
        "1 LG PEPPERONI PIZZA        18.99", "1 GARLIC KNOTS               6.49",
        "2 FOUNTAIN DRINK            5.98", "1 CAESAR SALAD               8.25", "",
        "SUBTOTAL                    39.71", "SALES TAX 8.25%             3.28", "TOTAL                       42.99", "",
        "VISA ****4417               42.99", "THANK YOU!",
    ],
    "burger-bar": [
        "THE BURGER BARN", "FICTIONAL TEST RECEIPT", "TABLE 12  SERVER JESS", "",
        "2 x CLASSIC BURGER          23.98", "1 x BBQ BACON BURGER        13.49",
        "3 x SWEET TEA                8.97", "1 x ONION RINGS              5.75",
        "COUPON                      -5.00", "",
        "SUBTOTAL                    47.19", "TAX                          3.89", "TOTAL                       51.08", "",
        "SUGGESTED TIP 18%            9.19", "SUGGESTED TIP 20%           10.22",
    ],
    "cafe-comma": [
        "CORNER CAFE", "FICTIONAL TEST RECEIPT", "",
        "1 LATTE                      4,75", "1 BLUEBERRY MUFFIN           3,25", "2 BAGEL W/ CREAM CHEESE      7,90", "",
        "SUBTOTAL                    15,90", "TAX                          1,31", "TOTAL                       17,21",
    ],
}

FONTS = ["C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/cour.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"]


def font(size):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def render(lines, size=22, tilt=2.0, blur=0.8, seed=1, quality=60):
    rnd = random.Random(seed)
    f = font(size)
    line_h = int(size * 1.45)
    w = 560
    h = 50 + line_h * len(lines) + 50
    paper = Image.new("L", (w, h), 238)
    d = ImageDraw.Draw(paper)
    for i, text in enumerate(lines):
        ink = rnd.randint(25, 70)  # thermal print is never pure black
        d.text((28, 40 + i * line_h), text, fill=ink, font=f)
    # Paper grain.
    px = paper.load()
    for _ in range(w * h // 18):
        x, y = rnd.randrange(w), rnd.randrange(h)
        px[x, y] = max(0, min(255, px[x, y] + rnd.randint(-28, 18)))
    paper = paper.filter(ImageFilter.GaussianBlur(blur)).convert("RGB")
    # Place on a darker table with an uneven light gradient, slight rotation.
    canvas = Image.new("RGB", (w + 220, h + 220), (92, 74, 58))
    canvas.paste(paper, (110, 110))
    canvas = canvas.rotate(tilt, resample=Image.BICUBIC, expand=False, fillcolor=(92, 74, 58))
    shade = Image.linear_gradient("L").resize(canvas.size).rotate(35, expand=False)
    canvas = Image.composite(canvas, Image.eval(canvas, lambda v: int(v * 0.62)), shade)
    return canvas, quality


for name, lines in RECEIPTS.items():
    img, q = render(lines, seed=len(name))
    img.save(OUT / f"{name}.jpg", quality=q)
    hard, q = render(lines, size=19, tilt=-3.2, blur=1.15, seed=len(name) + 7, quality=45)
    hard.save(OUT / f"{name}-hard.jpg", quality=q)
print("wrote", sorted(p.name for p in OUT.iterdir()))
