# python tools/debug/sheet.py out.jpg a.jpg "label a" b.jpg "label b" ...
# -> a 2-column contact sheet (half size if wide) in tools/debug/shots/.
import os, sys
from PIL import Image, ImageDraw

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
out, rest = sys.argv[1], sys.argv[2:]
pairs = [(rest[i], rest[i + 1]) for i in range(0, len(rest), 2)]
ims = [Image.open(os.path.join(D, p)).convert("RGB") for p, _ in pairs]
w, h = ims[0].size
s = 0.5 if w > 700 else 1.0
tw, th = int(w * s), int(h * s)
sheet = Image.new("RGB", (tw * 2, th * ((len(ims) + 1) // 2)), "black")
d = ImageDraw.Draw(sheet)
for k, (im, (_, lab)) in enumerate(zip(ims, pairs)):
    x, y = (k % 2) * tw, (k // 2) * th
    sheet.paste(im.resize((tw, th)), (x, y))
    d.rectangle([x, y, x + 8 * len(lab) + 8, y + 16], fill="black")
    d.text((x + 4, y + 3), lab, fill="yellow")
sheet.save(os.path.join(D, out), quality=90)
