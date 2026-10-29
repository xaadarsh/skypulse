"""Cabin kit: a 1 m fuselage segment (instanced along the cabin by the app), the front
(galley + cockpit bulkhead + nose), the rear bulkhead (lavatories) and a class divider.
Run:  blender -b --python tools/blender/make_cabin.py

Object names tell the app which side a part is on, so it can fade the wall nearest the camera:
  core*      floor, carpet, aisle lights, bulkheads (always opaque)
  L_lower / R_lower   side wall below the window line
  L_upper / R_upper   wall above, windows' bezels and overhead bins
  L_win / R_win       emissive window panes
Units are metres; the cabin runs along X (front = +X), floor at z = 0.
"""
import math
import os
import sys

import bmesh
import bpy

sys.path.append(os.path.dirname(__file__))
from common import OUT, apply_all, export, join, material, obj_from_bmesh, preview, reset, rounded_box  # noqa: E402

R, ZC = 2.55, 1.15                       # fuselage radius, centre height above the floor
PHI0 = math.asin(-ZC / R)                # angle where the wall meets the floor
PHI_SPLIT = math.asin((0.85 - ZC) / R)   # lower / upper wall split (just above armrest height)
PHI_TOP = math.radians(38)               # top of the cut-away wall
HALF_FLOOR = math.sqrt(R * R - ZC * ZC)


def M():
    return {
        "Wall": material("Wall", "#e9edf3", rough=0.55),
        "Floor": material("Floor", "#151b2a", rough=0.9),
        "Carpet": material("Carpet", "#24304d", rough=0.95),
        "AisleLight": material("AisleLight", "#7dd3fc", emission="#7dd3fc", strength=4.0),
        "Bin": material("Bin", "#f4f6fa", rough=0.35),
        "Trim": material("Trim", "#3a4459", rough=0.5, metal=0.2),
        "Window": material("Window", "#bfe6ff", emission="#a5dbff", strength=2.2),
        "Galley": material("Galley", "#c4ccd8", rough=0.25, metal=0.7),
    }


def wall(name, side, x0, x1, phi_a, phi_b, mat, thick=0.06, n=10):
    """Curved wall strip of the fuselage between two angles, from x0 to x1."""
    bm = bmesh.new()
    rows = []
    for x in (x0, x1):
        row = []
        for k in range(n + 1):
            phi = phi_a + (phi_b - phi_a) * k / n
            row.append(bm.verts.new((x, side * R * math.cos(phi), ZC + R * math.sin(phi))))
        rows.append(row)
    for k in range(n):
        bm.faces.new((rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = obj_from_bmesh(name, bm, [mat])
    s = o.modifiers.new("solid", "SOLIDIFY")
    s.thickness = thick
    s.offset = 1 if side > 0 else -1
    apply_all(o)
    return o


def wall_point(phi, side, inset=0.0):
    r = R - inset
    return side * r * math.cos(phi), ZC + r * math.sin(phi)


def side_parts(m, side, x0, x1, windows=True, bins=True):
    tag = "L" if side > 0 else "R"
    lower = [wall(f"{tag}lw", side, x0, x1, PHI0, PHI_SPLIT, m["Wall"])]
    upper = [wall(f"{tag}uw", side, x0, x1, PHI_SPLIT, PHI_TOP, m["Wall"])]
    win = []
    length = x1 - x0
    if windows:
        phi_w = math.asin((1.38 - ZC) / R)
        y, z = wall_point(phi_w, side, inset=0.035)
        tilt = side * (phi_w - 0.0)
        for k in range(max(1, round(length))):
            xc = x0 + (k + 0.5) * length / max(1, round(length))
            upper.append(rounded_box(f"{tag}bz", (0.36, 0.03, 0.46), (xc, y - side * 0.006, z), m["Trim"], bevel=0.12, segments=6, rot=(tilt, 0, 0)))
            win.append(rounded_box(f"{tag}wn", (0.27, 0.02, 0.37), (xc, y - side * 0.02, z), m["Window"], bevel=0.11, segments=6, rot=(tilt, 0, 0)))
    if bins:
        ybin = side * (1.55 + 0.31)
        upper.append(rounded_box(f"{tag}bin", (length - 0.03, 0.62, 0.44), ((x0 + x1) / 2, ybin, 2.06), m["Bin"], bevel=0.07, segments=5))
        upper.append(rounded_box(f"{tag}lip", (length - 0.05, 0.03, 0.05), ((x0 + x1) / 2, side * 1.548, 1.9), m["Trim"], bevel=0.012))
        # bin support panel above the bins up to the wall top
        upper.append(rounded_box(f"{tag}pan", (length - 0.02, 0.5, 0.05), ((x0 + x1) / 2, side * 2.0, 2.3), m["Bin"], bevel=0.02))
    out = [join(f"{tag}_lower", lower), join(f"{tag}_upper", upper)]
    if win:
        out.append(join(f"{tag}_win", win))
    return out


def floor(m, x0, x1, lights=True):
    length = x1 - x0
    xc = (x0 + x1) / 2
    parts = [rounded_box("floor", (length, 2 * HALF_FLOOR, 0.1), (xc, 0, -0.05), m["Floor"], bevel=0.01),
             rounded_box("carpet", (length, 2 * HALF_FLOOR - 0.3, 0.012), (xc, 0, 0.006), m["Carpet"], bevel=0.004)]
    if lights:
        for y in (-0.3, 0.3):
            parts.append(rounded_box("strip", (length - 0.12, 0.035, 0.012), (xc, y, 0.016), m["AisleLight"], bevel=0.005))
    return parts


def segment():
    reset()
    m = M()
    core = join("core", floor(m, -0.5, 0.5))
    objs = [core] + side_parts(m, 1, -0.5, 0.5) + side_parts(m, -1, -0.5, 0.5)
    export(os.path.join(OUT, "cabin_segment.glb"), objs)
    preview("cabin_segment", (3.5, -6.0, 4.5), (0, 0, 1.0), lens=35)


def bulkhead(m, x, door=0.95, height=2.25, door_h=2.0, mat="Wall"):
    """Cross wall shaped to the fuselage (never pokes outside it) with a doorway in the middle."""
    inset = 0.04
    def arc_y(z):
        return math.sqrt(max(0.0, (R - inset) ** 2 - (z - ZC) ** 2))
    pts = [(-door / 2, 0), (-door / 2, door_h), (door / 2, door_h), (door / 2, 0)]
    for k in range(13):  # right side, floor up to the top
        z = height * k / 12
        pts.append((arc_y(z), z))
    for k in range(12, -1, -1):  # left side, top down to the floor
        z = height * k / 12
        pts.append((-arc_y(z), z))
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, z)) for y, z in pts]
    bm.faces.new(verts)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="EAR_CLIP")
    o = obj_from_bmesh("bulkhead", bm, [m[mat]], smooth=False)
    s = o.modifiers.new("solid", "SOLIDIFY")
    s.thickness = 0.08
    s.offset = 0
    apply_all(o)
    return [o, rounded_box("bkTrim", (0.1, door + 0.12, 0.05), (x, 0, door_h), m["Trim"], bevel=0.01)]


def front():
    """Galley + cockpit wall + nose, from x = 0 (meets the cabin) to the nose tip."""
    reset()
    m = M()
    core = floor(m, 0, 2.6, lights=False) + bulkhead(m, 0.12)
    for y in (1, -1):  # galley units both sides
        core += [rounded_box("galley", (0.7, 1.15, 1.05), (1.0, y * 1.55, 0.53), m["Galley"], bevel=0.03),
                 rounded_box("galtop", (0.74, 1.2, 0.04), (1.0, y * 1.55, 1.07), m["Trim"], bevel=0.01),
                 rounded_box("galupper", (0.5, 1.1, 0.6), (1.1, y * 1.6, 1.75), m["Galley"], bevel=0.03)]
        for k in range(3):
            core.append(rounded_box("handle", (0.02, 0.18, 0.02), (0.64, y * (1.15 + k * 0.38), 0.9), m["Trim"], bevel=0.008))
    core += bulkhead(m, 1.95, door=0.85, height=2.2, door_h=1.95, mat="Trim")
    # cockpit door
    core.append(rounded_box("cdoor", (0.05, 0.8, 1.9), (1.93, 0, 0.95), m["Wall"], bevel=0.02))
    # nose: lower shell tapering to the tip (cut away above the window line)
    bm = bmesh.new()
    rings = []
    for i in range(13):
        t = i / 12
        x = 2.6 + t * 3.2
        r = R * math.sqrt(max(0.0, 1 - t ** 2.2)) + 0.02
        zc = ZC - 0.6 * t ** 2
        ring = []
        for k in range(17):
            phi = math.pi + PHI0 * 0 + (k / 16) * math.pi  # lower half: 180..360 degrees
            ring.append(bm.verts.new((x, r * math.cos(phi), zc + r * math.sin(phi) * 0.95)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(16):
            bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    nose = obj_from_bmesh("nose", bm, [m["Wall"]])
    s = nose.modifiers.new("solid", "SOLIDIFY")
    s.thickness = 0.06
    apply_all(nose)
    core.append(nose)
    objs = [join("core", core)] + side_parts(m, 1, 0, 2.6, windows=False, bins=False) + side_parts(m, -1, 0, 2.6, windows=False, bins=False)
    export(os.path.join(OUT, "cabin_front.glb"), objs)
    preview("cabin_front", (6.5, -6.5, 5.0), (1.8, 0, 0.8), lens=35)


def rear():
    """Rear bulkhead with two lavatory doors, from x = -1.2 to 0 (meets the cabin)."""
    reset()
    m = M()
    core = floor(m, -1.2, 0, lights=False)
    core += [rounded_box("lav", (1.0, 1.3, 2.25), (-0.65, y * 1.35, 1.12), m["Wall"], bevel=0.04) for y in (1, -1)]
    core += [rounded_box("lavdoor", (0.03, 0.75, 1.85), (-0.14, y * 1.25, 0.98), m["Trim"], bevel=0.02) for y in (1, -1)]
    core += [rounded_box("lavsign", (0.02, 0.18, 0.08), (-0.12, y * 1.25, 2.03), m["AisleLight"], bevel=0.01) for y in (1, -1)]
    core.append(rounded_box("rearwall", (0.08, 0.9, 2.25), (-1.15, 0, 1.12), m["Wall"], bevel=0.02))
    objs = [join("core", core)] + side_parts(m, 1, -1.2, 0, windows=False) + side_parts(m, -1, -1.2, 0, windows=False)
    export(os.path.join(OUT, "cabin_rear.glb"), objs)


def divider():
    """Low class-divider partitions on both sides of the aisle."""
    reset()
    m = M()
    parts = []
    for y in (1, -1):
        parts.append(rounded_box("div", (0.07, 1.55, 1.15), (0, y * (0.55 + 1.55 / 2), 0.58), m["Wall"], bevel=0.03))
        parts.append(rounded_box("divtop", (0.1, 1.58, 0.05), (0, y * (0.55 + 1.55 / 2), 1.16), m["Trim"], bevel=0.015))
    export(os.path.join(OUT, "cabin_divider.glb"), [join("core", parts)])


segment()
front()
rear()
divider()
