# 개인사업자 컨설팅 카드 미리보기 이미지 (절차적 렌더, 800x448 · 2026-11-22 · 법인 카드 _make-ceo-preview.py에서 파생)
# 콘셉트: 유리 받침대 위 홀로그램 상가 거리(차양 달린 점포 = 개인사업자) + 우상향 금빛 그래프(절세·소득 상승) · 파랑(하늘색) 톤 — 대시보드 카드 팔레트와 맞춤(실장 11-22: 청록 시안 반려)
import math, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 800, 448
SS = 2                       # 슈퍼샘플링
w, h = W * SS, H * SS
random.seed(7)

def rgb(hexs):
    hexs = hexs.lstrip('#')
    return tuple(int(hexs[i:i + 2], 16) for i in (0, 2, 4))

# ── 배경: 남색 방사형 + 비네트 ──
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
cx, cy = w * 0.52, h * 0.42
d = np.sqrt(((xx - cx) / w) ** 2 + ((yy - cy) / h) ** 2)
base = np.zeros((h, w, 3), np.float32)
c_in, c_out = np.array(rgb('#1a3175'), np.float32), np.array(rgb('#060a1f'), np.float32)
t = np.clip(d / 0.75, 0, 1)[..., None]
base = c_in * (1 - t) + c_out * t

# ── 아이소메트릭 투영 ──
S = 28 * SS
OX, OY = w * 0.50, h * 0.585
C30, S30 = math.cos(math.radians(30)), math.sin(math.radians(30))
def P(x, y, z):
    return (OX + (x - y) * C30 * S, OY + (x + y) * S30 * S - z * S)

layer_fill = Image.new('RGBA', (w, h), (0, 0, 0, 0))   # 면(불투명도 낮음)
layer_line = Image.new('RGBA', (w, h), (0, 0, 0, 0))   # 선(글로우 대상)
layer_gold = Image.new('RGBA', (w, h), (0, 0, 0, 0))   # 금빛 그래프
df = ImageDraw.Draw(layer_fill)
dl = ImageDraw.Draw(layer_line)
dg = ImageDraw.Draw(layer_gold)

INDIGO = rgb('#7dd3fc')
VIOLET = rgb('#bfdbfe')
PALE = rgb('#e0f2fe')
GOLD = rgb('#f6c766')

# ── 받침대(슬래브) ──
R = 4.3
top = [P(-R, -R, 0), P(R, -R, 0), P(R, R, 0), P(-R, R, 0)]
thick = 0.38
bot = [P(-R, -R, -thick), P(R, -R, -thick), P(R, R, -thick), P(-R, R, -thick)]
# 옆면(앞쪽 두 면)
df.polygon([top[1], top[2], bot[2], bot[1]], fill=(30, 46, 96, 255))
df.polygon([top[2], top[3], bot[3], bot[2]], fill=(20, 32, 72, 255))
df.polygon(top, fill=(16, 30, 84, 235))
# 안쪽 유리판
r2 = R - 0.35
inner = [P(-r2, -r2, 0.02), P(r2, -r2, 0.02), P(r2, r2, 0.02), P(-r2, r2, 0.02)]
df.polygon(inner, fill=(26, 50, 130, 200))
dl.line(top + [top[0]], fill=INDIGO + (150,), width=2 * SS)
dl.line([bot[1], bot[2], bot[3]], fill=(120, 170, 230, 90), width=1 * SS)
for a, b in ((top[1], bot[1]), (top[2], bot[2]), (top[3], bot[3])):
    dl.line([a, b], fill=(140, 190, 240, 110), width=1 * SS)

# 바닥 격자
for i in np.linspace(-r2, r2, 15):
    dl.line([P(i, -r2, 0.03), P(i, r2, 0.03)], fill=INDIGO + (38,), width=1 * SS)
    dl.line([P(-r2, i, 0.03), P(r2, i, 0.03)], fill=INDIGO + (38,), width=1 * SS)

# ── 빌딩(뒤→앞 순서로 그려 가림 처리) ──
def box(x, y, sx, sy, hz, col, win=True, alpha=1.0):
    x0, x1, y0, y1 = x - sx / 2, x + sx / 2, y - sy / 2, y + sy / 2
    v = {
        'a': P(x0, y0, hz), 'b': P(x1, y0, hz), 'c': P(x1, y1, hz), 'd': P(x0, y1, hz),
        'B': P(x1, y0, 0), 'C': P(x1, y1, 0), 'D': P(x0, y1, 0),
    }
    fa = int(150 * alpha)
    df.polygon([v['b'], v['c'], v['C'], v['B']], fill=(40, 80, 170, fa))     # 오른쪽 면
    df.polygon([v['c'], v['d'], v['D'], v['C']], fill=(28, 58, 140, fa))     # 왼쪽 면
    df.polygon([v['a'], v['b'], v['c'], v['d']], fill=(80, 140, 230, int(170 * alpha)))  # 윗면
    lc = col + (int(230 * alpha),)
    dl.line([v['a'], v['b'], v['c'], v['d'], v['a']], fill=PALE + (int(240 * alpha),), width=2 * SS)
    for p, q in ((v['b'], v['B']), (v['c'], v['C']), (v['d'], v['D'])):
        dl.line([p, q], fill=lc, width=2 * SS)
    dl.line([v['B'], v['C'], v['D']], fill=lc, width=1 * SS)
    if win:
        # 창문 줄(가로 층선)
        floors = max(2, int(hz / 0.32))
        for k in range(1, floors):
            z = hz * k / floors
            dl.line([P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], fill=col + (int(70 * alpha),), width=1 * SS)
        # 세로 멀리언
        for f in (0.33, 0.66):
            yy_ = y0 + (y1 - y0) * f
            dl.line([P(x1, yy_, 0), P(x1, yy_, hz)], fill=col + (int(55 * alpha),), width=1 * SS)
            xx_ = x0 + (x1 - x0) * f
            dl.line([P(xx_, y1, 0), P(xx_, y1, hz)], fill=col + (int(55 * alpha),), width=1 * SS)

AWN = [rgb('#fbbf24'), rgb('#f9a8d4'), rgb('#fde68a'), rgb('#fb923c'), rgb('#93c5fd')]
def awning(x, y, sx, hz, col):
    """점포 정면(오른쪽 면, x1) 위 차양 — 줄무늬 기울어진 판"""
    x1 = x + sx / 2
    y0, y1 = y - sx / 2, y + sx / 2
    zt, zb, out = hz * 0.78, hz * 0.62, 0.38
    n = 6
    for k in range(n):
        ya, yb = y0 + (y1 - y0) * k / n, y0 + (y1 - y0) * (k + 1) / n
        quad = [P(x1, ya, zt), P(x1, yb, zt), P(x1 + out, yb, zb), P(x1 + out, ya, zb)]
        c = col if k % 2 == 0 else PALE
        df.polygon(quad, fill=c + (170,))
    dl.line([P(x1 + out, y0, zb), P(x1 + out, y1, zb)], fill=col + (230,), width=2 * SS)
    # 간판(차양 위 가로 띠)
    dl.line([P(x1, y0 + 0.1, hz * 0.9), P(x1, y1 - 0.1, hz * 0.9)], fill=col + (255,), width=3 * SS)

shops = [
    # x, y, size, height — 두 줄 상가(뒤 줄 2층, 앞 줄 1층)
    (-2.6, -2.6, 1.3, 2.2), (-2.6, -0.8, 1.3, 1.8), (-2.6, 1.0, 1.3, 2.4), (-2.6, 2.8, 1.2, 1.6),
    (0.6, -2.8, 1.3, 1.6), (0.6, -1.0, 1.4, 2.9), (0.6, 0.9, 1.3, 1.5), (0.6, 2.7, 1.2, 2.0),
]
shops.sort(key=lambda t: t[0] + t[1])
for i_, (x, y, sz, hz) in enumerate(shops):
    box(x, y, sz, sz, hz, VIOLET if hz > 2.5 else INDIGO, alpha=1.0)
    awning(x, y, sz, hz, AWN[i_ % len(AWN)])

# 동전 더미(앞쪽 길 위) — 소득 상징
def coins(x, y, n):
    for k in range(n):
        z = 0.05 + k * 0.16
        c = P(x, y, z); rx, ry = 0.42 * S * C30, 0.42 * S * S30
        dg.ellipse([c[0] - rx, c[1] - ry, c[0] + rx, c[1] + ry], fill=GOLD + (150,), outline=GOLD + (255,), width=1 * SS)
coins(2.7, 1.2, 4); coins(3.4, 2.4, 6); coins(2.2, 3.3, 3)

tx, ty = 0.6, -1.0
spire = P(tx, ty, 2.9 + 0.5)

# ── 금빛 우상향 그래프(빌딩 위 공중) ──
pts3 = [(-3.8, 2.6, 3.0), (-2.8, 1.4, 3.5), (-1.7, 0.4, 3.3), (-0.8, -0.6, 4.1),
        (0.5, -1.5, 4.4), (1.6, -2.3, 5.1), (2.9, -3.1, 5.9)]
pts = [P(*p) for p in pts3]
dg.line(pts, fill=GOLD + (255,), width=3 * SS, joint='curve')
for p in pts[:-1]:
    r = 4 * SS
    dg.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=GOLD + (255,))
# 화살촉
ax, ay = pts[-1]
bx, by = pts[-2]
ang = math.atan2(ay - by, ax - bx)
L = 16 * SS
tri = [(ax + math.cos(ang) * 6 * SS, ay + math.sin(ang) * 6 * SS),
       (ax - math.cos(ang - 0.5) * L, ay - math.sin(ang - 0.5) * L),
       (ax - math.cos(ang + 0.5) * L, ay - math.sin(ang + 0.5) * L)]
dg.polygon(tri, fill=GOLD + (255,))
# 그래프에서 바닥으로 내리는 점선 투영선
for p3 in pts3[1:-1]:
    a = P(*p3); b = P(p3[0], p3[1], 0.04)
    n = 14
    for k in range(0, n, 2):
        s0 = k / n; s1 = (k + 1) / n
        dg.line([(a[0] + (b[0] - a[0]) * s0, a[1] + (b[1] - a[1]) * s0),
                 (a[0] + (b[0] - a[0]) * s1, a[1] + (b[1] - a[1]) * s1)], fill=GOLD + (70,), width=1 * SS)

# ── 떠 있는 홀로그램 패널 2장 ──
def panel(x, y, z, wd, ht):
    a, b = P(x, y, z + ht), P(x + wd, y, z + ht)
    c, d_ = P(x + wd, y, z), P(x, y, z)
    df.polygon([a, b, c, d_], fill=(120, 126, 255, 28))
    dl.line([a, b, c, d_, a], fill=INDIGO + (160,), width=1 * SS)
    for k in range(1, 4):
        zz = z + ht * k / 4.5
        dl.line([P(x + wd * 0.12, y, zz), P(x + wd * (0.35 + 0.15 * k), y, zz)], fill=PALE + (90,), width=1 * SS)
panel(-4.9, -3.9, 2.6, 2.0, 1.3)
panel(3.6, -4.4, 2.0, 1.0, 1.0)

# 수직 데이터 빛기둥
for _ in range(16):
    x = random.uniform(-r2, r2); y = random.uniform(-r2, r2)
    z1 = random.uniform(2.2, 6.0)
    dl.line([P(x, y, 0.05), P(x, y, z1)], fill=INDIGO + (random.randint(25, 60),), width=1 * SS)
    p = P(x, y, z1)
    dl.ellipse([p[0] - 2 * SS, p[1] - 2 * SS, p[0] + 2 * SS, p[1] + 2 * SS], fill=PALE + (200,))

# ── 합성(가산 글로우) ──
def arr(im):
    a = np.asarray(im).astype(np.float32) / 255.0
    return a[..., :3] * a[..., 3:4]

img = base / 255.0
fill = np.asarray(layer_fill).astype(np.float32) / 255.0
img = img * (1 - fill[..., 3:4]) + fill[..., :3] * fill[..., 3:4]

for lay, strength in ((layer_line, 1.0), (layer_gold, 1.15)):
    sharp = arr(lay)
    g1 = arr(lay.filter(ImageFilter.GaussianBlur(3 * SS)))
    g2 = arr(lay.filter(ImageFilter.GaussianBlur(14 * SS)))
    img = img + strength * (sharp * 1.0 + g1 * 1.7 + g2 * 2.1)

# 첨탑·그래프 끝 강한 광점
for (px, py), col, rad in ((spire, PALE, 26), (pts[-1], GOLD, 34)):
    dd = np.sqrt((xx - px) ** 2 + (yy - py) ** 2) / (rad * SS)
    img += (np.exp(-dd ** 2 * 2.2) * 0.85)[..., None] * (np.array(col, np.float32) / 255.0)

# 반사광(받침대 아래 은은한 빛) + 대각 광택
dd = np.sqrt(((xx - OX) / (w * 0.42)) ** 2 + ((yy - (OY + 30 * SS)) / (h * 0.16)) ** 2)
img += (np.exp(-dd ** 2) * 0.10)[..., None] * np.array([0.45, 0.65, 1.0], np.float32)

# 톤매핑
img = 1 - np.exp(-img * 1.25)
out = Image.fromarray(np.clip(img * 255, 0, 255).astype(np.uint8), 'RGB')
out = out.resize((W, H), Image.LANCZOS)
dst = sys.argv[1]
out.save(dst, 'WEBP', quality=86, method=6)
print('saved', dst, out.size)
