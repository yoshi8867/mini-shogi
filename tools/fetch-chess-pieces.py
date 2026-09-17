# 체스 기물(검정)을 기존 기물과 같은 알파 마스크로 만든다.
# 원본: Wikimedia Commons, Cburnett 세트, CC BY-SA 3.0
# 실행: python tools/fetch-chess-pieces.py
import os, json, io, urllib.request
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA   = "mini-shogi-asset-fetch/1.0 (https://github.com/yoshi8867/mini-shogi)"
API  = "https://commons.wikimedia.org/w/api.php"
SIZE, PAD = 320, 0.05

# 체스 기물 → 동물쇼기 기물
# 같은 그림을 여러 기물이 쓰므로 파일은 종류당 하나만 둔다.
# 킹 → 사자·호랑이 / 퀸 → 닭 / 룩 → 기린 / 비숍 → 코끼리 / 폰 → 병아리
MAP = {"Chess_kdt45.svg": ["king"],
       "Chess_qdt45.svg": ["queen"],
       "Chess_rdt45.svg": ["rook"],
       "Chess_bdt45.svg": ["bishop"],
       "Chess_pdt45.svg": ["pawn"]}

def get(url):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30).read()

q = (API + "?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=640&titles="
     + "|".join("File:" + f for f in MAP))
pages = json.loads(get(q))["query"]["pages"].values()
urls = {p["title"].replace("File:", "").replace(" ", "_"): p["imageinfo"][0]["thumburl"]
        for p in pages}

def mask(a, name, out_dir):
    """알파 배열(0~1)을 잘라 정사각 캔버스에 담고 320px 마스크로 저장."""
    ys, xs = np.nonzero(a > 0.30)
    art = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = art.shape
    side = int(max(h, w) * (1 + 2 * PAD))
    cv = np.zeros((side, side), np.float32)
    oy, ox = (side - h) // 2, (side - w) // 2
    cv[oy:oy + h, ox:ox + w] = art
    a8 = Image.fromarray((cv * 255).astype(np.uint8), "L").resize((SIZE, SIZE), Image.LANCZOS)
    Image.merge("RGBA", (Image.new("L", (SIZE, SIZE), 0),) * 3 + (a8,)).save(
        os.path.join(out_dir, f"{name}.png"), optimize=True)
    return float((art > 0.3).mean()) * 100

for variant in ("pieces-chess", "pieces-chess-line"):
    os.makedirs(os.path.join(ROOT, "docs/design", variant), exist_ok=True)

for src, names in MAP.items():
    im = Image.open(io.BytesIO(get(urls[src]))).convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    alpha = arr[..., 3] / 255.0
    lum   = arr[..., :3].mean(axis=2)

    # ① 실루엣 — 기물 전체를 하나의 덩어리로
    sil = alpha.copy()
    # ② 먹선 — 흰 내부선을 뚫어 새김처럼
    line = alpha * np.clip((210.0 - lum) / (210.0 - 90.0), 0, 1)

    for name in names:
        c1 = mask(sil,  name, os.path.join(ROOT, "docs/design/pieces-chess"))
        c2 = mask(line, name, os.path.join(ROOT, "docs/design/pieces-chess-line"))
        print(f"{name:11s} <- {src:17s} 실루엣 {c1:4.0f}%   먹선 {c2:4.0f}%")
