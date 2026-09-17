import base64, mimetypes, os, re, sys
BASE = os.path.dirname(os.path.abspath(__file__))
name = sys.argv[1] if len(sys.argv) > 1 else "wood"
src = os.path.join(BASE, f"{name}.template.html")
dst = (os.path.abspath(sys.argv[2]) if len(sys.argv) > 2
       else os.path.join(BASE, f"{name}.html"))
html = open(src, encoding="utf-8").read()

# ── 1. [[koma|<art-class>|<extra classes>]] 전개 ─────────────────────────
DIRS = {"lion":"n ne e se s sw w nw", "tiger":"n ne e se s sw w nw",
        "giraffe":"n e s w", "giraffe2":"n e s w",
        "elephant":"ne se sw nw", "chick":"n", "chick2":"n",
        "rooster":"n ne e s w nw"}
def koma(m):
    art = m.group(1).strip()
    extra = (m.group(2) or "").strip()
    piece = art.split("-", 1)[1]
    pips = "".join(f'<i class="m dot {d}"></i>' for d in DIRS[piece].split())
    return (f'<div class="koma {extra}"><div class="face"></div>'
            f'<div class="box"><i class="art {art}"></i>{pips}</div></div>')
html, n_koma = re.subn(r"\[\[koma\|([^|\]]+)(?:\|([^\]]*))?\]\]", koma, html)

# ── 2. [[include|<path>]] → 파일 내용 그대로 (엔진처럼 따로 두고 테스트하는 코드) ──
def inc(m):
    p = os.path.join(BASE, m.group(1))
    return open(p, encoding="utf-8").read()
html, n_inc = re.subn(r"\[\[include\|([A-Za-z0-9_\-./]+)\]\]", inc, html)

# ── 3. ASSET:<path> → data URI (자산마다 한 번만 등장하도록 CSS 클래스에서 참조) ──
cache, missing = {}, []
def sub(m):
    rel = m.group(1)
    p = os.path.join(BASE, rel)
    if not os.path.exists(p):
        missing.append(rel); return m.group(0)
    if rel not in cache:
        mime = mimetypes.guess_type(p)[0] or "application/octet-stream"
        cache[rel] = f"data:{mime};base64," + base64.b64encode(open(p,"rb").read()).decode()
    return cache[rel]
html = re.sub(r"ASSET:([A-Za-z0-9_\-./]+)", sub, html)
open(dst, "w", encoding="utf-8").write(html)
dup = [r for r in cache if html.count(cache[r]) > 1]
print(f"koma expanded: {n_koma} | includes: {n_inc} | assets: {len(cache)} | missing: {missing or 'none'} | duplicated: {dup or 'none'}")
print(f"output: {dst}  {os.path.getsize(dst)/1024/1024:.2f} MB")
