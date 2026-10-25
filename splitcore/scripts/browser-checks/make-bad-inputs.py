# Create the invalid/awkward inputs used by interactions.mjs (requires Pillow).
# Usage: python -I make-bad-inputs.py   (writes into ./out)
from pathlib import Path
from PIL import Image

here = Path(__file__).resolve().parent
out = here / "out"
out.mkdir(exist_ok=True)
Image.new("RGB", (800, 1000), "white").save(out / "blank.png")
Image.new("L", (5000, 4000), 255).save(out / "big.png")  # 20 megapixels
Image.open(here.parent.parent / "public/demo/sample-a.png").rotate(90, expand=True).save(out / "sideways.png")
(out / "bad.pdf").write_bytes(b"%PDF-1.4\n%fake\n")
(out / "bad.heic").write_bytes(b"\x00\x00\x00\x18ftypheic")
print("wrote", sorted(p.name for p in out.iterdir()))
