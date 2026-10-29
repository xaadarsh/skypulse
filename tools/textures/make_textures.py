"""Procedural textures for the Home scene (no downloads):
  earth_day.jpg    equirectangular land/ocean colour map
  earth_night.jpg  city-lights map for the night side
  cloud.png        soft, shaded cloud sprite (RGBA)
Noise is sampled on the unit sphere, so the maps have no seam.  Run:  python tools/textures/make_textures.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "textures"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)
PERM = rng.permutation(256)
PERM = np.concatenate([PERM, PERM])
GRAD = rng.normal(size=(256, 3))
GRAD /= np.linalg.norm(GRAD, axis=1, keepdims=True)


def noise3(x, y, z):
    """Gradient (Perlin-style) noise, vectorised."""
    xi, yi, zi = np.floor(x).astype(int) & 255, np.floor(y).astype(int) & 255, np.floor(z).astype(int) & 255
    xf, yf, zf = x - np.floor(x), y - np.floor(y), z - np.floor(z)
    fade = lambda t: t * t * t * (t * (t * 6 - 15) + 10)
    u, v, w = fade(xf), fade(yf), fade(zf)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                h = PERM[PERM[PERM[xi + dx] + yi + dy] + zi + dz]
                g = GRAD[h]
                dot = g[..., 0] * (xf - dx) + g[..., 1] * (yf - dy) + g[..., 2] * (zf - dz)
                wx = u if dx else 1 - u
                wy = v if dy else 1 - v
                wz = w if dz else 1 - w
                out = out + wx * wy * wz * dot
    return out


def fbm(p, octaves=6, freq=1.6):
    total, amp = 0, 0.5
    for _ in range(octaves):
        total = total + amp * noise3(p[0] * freq, p[1] * freq, p[2] * freq)
        freq *= 2.03
        amp *= 0.5
    return total


def sphere_coords(w, h):
    lon = (np.arange(w) + 0.5) / w * 2 * np.pi - np.pi
    lat = np.pi / 2 - (np.arange(h) + 0.5) / h * np.pi
    lon, lat = np.meshgrid(lon, lat)
    return np.stack([np.cos(lat) * np.cos(lon), np.sin(lat), np.cos(lat) * np.sin(lon)]), lat


def mix(a, b, t):
    t = np.clip(t, 0, 1)[..., None]
    return np.array(a) * (1 - t) + np.array(b) * t


def earth(w=1024, h=512):
    p, lat = sphere_coords(w, h)
    warp = fbm(p * 1.0 + 5.2, 3)
    height = fbm(p + warp * 0.6, 7) - 0.04
    land = height > 0.03
    ocean = mix([8, 30, 70], [22, 78, 130], (height + 0.35) / 0.38)
    t = (height - 0.03) / 0.35
    green = mix([46, 112, 72], [120, 128, 76], t * 1.6)
    terrain = mix(green, [150, 132, 104], (t - 0.45) * 2)
    arid = fbm(p * 2 + 11, 4)
    terrain = mix(terrain, [176, 150, 108], (arid - 0.05) * 3 * (np.abs(lat) < 0.6))
    img = np.where(land[..., None], terrain, ocean)
    ice = np.clip((np.abs(lat) - 1.15) * 5 + fbm(p * 3, 3) * 2, 0, 1)
    img = mix(img, [236, 242, 248], ice)
    Image.fromarray(img.clip(0, 255).astype(np.uint8)).save(OUT / "earth_day.jpg", quality=86)
    # city lights: clustered on land, more near coasts and mid-latitudes
    coast = np.exp(-((height - 0.03) / 0.06) ** 2)
    cluster = np.clip(fbm(p * 4 + 3, 4) * 3, 0, 1)
    density = land * (0.25 + coast) * cluster * np.exp(-((np.abs(lat) - 0.6) / 0.5) ** 2)
    pts = (rng.random(density.shape) < density * 0.11).astype(np.float32)
    lights = Image.fromarray((pts * 255).astype(np.uint8))
    glow = np.asarray(lights.filter(ImageFilter.GaussianBlur(1.6)), dtype=np.float32) * 2.2
    core = np.asarray(lights, dtype=np.float32)
    v = np.clip(core * 0.8 + glow, 0, 255)[..., None]
    night = v * np.array([1.0, 0.82, 0.55]) + (density[..., None] * 22) * np.array([1.0, 0.8, 0.5])
    Image.fromarray(np.clip(night, 0, 255).astype(np.uint8)).save(OUT / "earth_night.jpg", quality=88)


def cloud(size=256):
    """Billowy cumulus: many overlapping soft puffs inside an ellipse, eroded by noise, lit from above."""
    y, x = np.mgrid[0:size, 0:size] / size * 2 - 1
    dens = np.zeros_like(x)
    crng = np.random.default_rng(3)
    for _ in range(38):
        cx, cy = crng.normal(0, 0.28), crng.normal(0.05, 0.13)
        r = crng.uniform(0.16, 0.32) * (1.15 - abs(cx))
        cy -= r * 0.4  # puffs bulge upward from a flatter base
        dens += np.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (r * r)) * 2.2)
    base = np.clip((0.32 - y) * 6, 0, 1)  # flat-ish bottom
    p = np.stack([x * 3.0, y * 3.0, np.full_like(x, 0.61)])
    n = fbm(p, 5, 1.0)
    d = np.clip(dens * base * 0.9 + n * 0.35 - 0.25, 0, None)
    alpha = np.clip(d * 1.6, 0, 1) ** 1.3
    alpha *= np.clip(1 - (x ** 2 + (y * 1.4) ** 2) ** 3, 0, 1)
    light = np.clip(1.02 - (y + 0.3) * 0.35 + n * 0.18 - np.clip(dens - 1.6, 0, 1) * 0.05, 0.62, 1.05)
    rgb = np.stack([light * 250, light * 252, light * 255], -1)
    rgb = mix(rgb, [176, 188, 214], np.clip((y - 0.05) * 2.2, 0, 1))
    img = np.concatenate([rgb.clip(0, 255), (alpha * 255)[..., None]], -1).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(OUT / "cloud.png", optimize=True)


earth()
cloud()
for f in sorted(OUT.iterdir()):
    print(f.name, f.stat().st_size)
