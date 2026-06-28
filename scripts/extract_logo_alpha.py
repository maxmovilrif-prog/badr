"""Production-grade alpha extraction for a logo rendered on a pure black matte.

A subject composited over pure black behaves like premultiplied alpha:
    observed = alpha * true_color
So we can recover a clean, perfectly anti-aliased cutout by:
  1. Flood-filling the border-connected black region -> hard background (alpha 0),
     which protects interior dark brick seams from being punched out.
  2. Deriving a soft coverage (alpha) from luminance in a thin boundary band so
     edges are feathered, not stair-stepped.
  3. Un-premultiplying (color / coverage) to remove the black spill on edge
     pixels -> zero dark/light fringe.
"""
import sys
import numpy as np
from PIL import Image
from collections import deque

SRC = sys.argv[1]
OUT = sys.argv[2]

im = Image.open(SRC).convert("RGB")
arr = np.asarray(im).astype(np.float32)
h, w, _ = arr.shape
# Perceptual-ish coverage proxy: brightest channel (robust for colored subjects).
lum = arr.max(axis=2)

# 1) Border-connected black background (BFS). Tolerant threshold for matte noise.
T_BG = 22.0
isbg = np.zeros((h, w), dtype=bool)
visited = np.zeros((h, w), dtype=bool)
dq = deque()
for x in range(w):
    dq.append((x, 0)); dq.append((x, h - 1))
for y in range(h):
    dq.append((0, y)); dq.append((w - 1, y))
while dq:
    x, y = dq.popleft()
    if x < 0 or y < 0 or x >= w or y >= h or visited[y, x]:
        continue
    visited[y, x] = True
    if lum[y, x] <= T_BG:
        isbg[y, x] = True
        dq.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

# 2) Coverage / alpha.
#    Interior foreground -> fully opaque. Boundary band -> soft coverage from luma.
#    Build the boundary band = foreground pixels within a small radius of bg.
fg = ~isbg
# dilate bg by a few px (pure-numpy via shifts) to mark the transition band
band = np.zeros((h, w), dtype=bool)
R = 2
bgf = isbg.astype(np.uint8)
acc = np.zeros((h, w), dtype=np.uint16)
for dy in range(-R, R + 1):
    for dx in range(-R, R + 1):
        acc += np.roll(np.roll(bgf, dy, axis=0), dx, axis=1)
near_bg = acc > 0
band = fg & near_bg

alpha = np.where(fg, 255.0, 0.0)
# Soft coverage in the band: ramp luma 0..T_FULL -> 0..255
T_FULL = 120.0
cov = np.clip(lum / T_FULL, 0.0, 1.0)
alpha = np.where(band, np.minimum(alpha, cov * 255.0), alpha)

# 3) Un-premultiply to remove black spill on edges (only where partially covered).
a = np.clip(alpha / 255.0, 0.0, 1.0)
out_rgb = arr.copy()
mask = (a > 0.04) & (a < 0.999)
scale = np.zeros_like(a)
scale[mask] = 1.0 / a[mask]
for c in range(3):
    out_rgb[:, :, c] = np.where(mask, np.clip(arr[:, :, c] * scale, 0, 255), arr[:, :, c])

rgba = np.dstack([out_rgb, alpha]).astype(np.uint8)
Image.fromarray(rgba, mode="RGBA").save(OUT)

# Report
opaque = int((alpha >= 250).sum())
clear = int((alpha <= 5).sum())
soft = int(((alpha > 5) & (alpha < 250)).sum())
print(f"saved {OUT} size={w}x{h} opaque={opaque} transparent={clear} soft_edge={soft}")
