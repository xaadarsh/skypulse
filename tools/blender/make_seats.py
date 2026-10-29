"""Economy seat + Business pod.  Run:  blender -b --python tools/blender/make_seats.py

Materials (the app merges meshes by material name and instances them):
  Fabric  - upholstery, tinted per seat by risk colour in the app
  Shell   - plastic seat shell / pod shell
  Metal   - legs and frame
  Screen  - seat-back screen (emissive)
  Armrest - armrests (eco: exported centred at y=0 so the app can place shared armrests between seats)
  Light   - pod reading lamp (emissive)
Units are metres. Seat faces +X.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.append(os.path.dirname(__file__))
from common import OUT, apply_all, export, join, material, obj_from_bmesh, preview, reset, rounded_box  # noqa: E402


def mats():
    return {
        "Fabric": material("Fabric", "#e8ecf4", rough=0.85),
        "Shell": material("Shell", "#2a3346", rough=0.45, metal=0.1),
        "Metal": material("Metal", "#9aa6b8", rough=0.3, metal=0.9),
        "Screen": material("Screen", "#0b1730", rough=0.2, emission="#38bdf8", strength=0.8),
        "Armrest": material("Armrest", "#1f2737", rough=0.6),
        "Light": material("Light", "#fff4dc", emission="#ffe7b0", strength=3.0),
    }


def tube(name, p1, p2, r, mat, seg=12):
    p1, p2 = Vector(p1), Vector(p2)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=(p2 - p1).length)
    o = obj_from_bmesh(name, bm, [mat])
    o.location = (p1 + p2) / 2
    o.rotation_euler = (p2 - p1).to_track_quat("Z", "Y").to_euler()
    apply_all(o)
    return o


def backrest(name, m, width, height, base, recline, thick, bulge=0.025, bucket=0.035):
    """Curved, reclined backrest: front face Fabric, back + rim Shell (solidify material offset)."""
    nu, nv = 10, 14
    bm = bmesh.new()
    grid = []
    for j in range(nv + 1):
        v = j / nv
        row = []
        for i in range(nu + 1):
            y = (i / nu - 0.5) * width
            x = base[0] - recline * v * height + bulge * math.sin(math.pi * v * 0.8) + bucket * (2 * y / width) ** 2
            z = base[1] + v * height
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # make the front (fabric) side face +X
    if sum(f.normal.x for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    o = obj_from_bmesh(name, bm, [m["Fabric"], m["Shell"]])
    s = o.modifiers.new("solid", "SOLIDIFY")
    s.thickness = thick
    s.offset = -1
    s.material_offset = 1
    s.material_offset_rim = 1
    sub = o.modifiers.new("sub", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 2
    apply_all(o)
    return o


def economy():
    reset()
    m = mats()
    parts = [
        rounded_box("cushion", (0.47, 0.43, 0.11), (0.04, 0, 0.44), m["Fabric"], bevel=0.05, segments=5),
        rounded_box("pan", (0.44, 0.42, 0.05), (0.03, 0, 0.365), m["Shell"], bevel=0.02),
        backrest("back", m, 0.43, 0.56, (-0.19, 0.47), 0.3, 0.06),
        rounded_box("head", (0.07, 0.3, 0.15), (-0.335, 0, 0.99), m["Fabric"], bevel=0.035, segments=5, rot=(0, -0.29, 0)),
        # seat-back screen with bezel, on the shell side
        rounded_box("bezel", (0.014, 0.22, 0.15), (-0.348, 0, 0.8), m["Shell"], bevel=0.006, rot=(0, -0.29, 0)),
        rounded_box("screen", (0.006, 0.19, 0.12), (-0.357, 0, 0.8), m["Screen"], bevel=0.003, rot=(0, -0.29, 0)),
    ]
    for y in (-0.16, 0.16):
        parts += [tube("legf", (0.16, y, 0.36), (0.13, y, 0.02), 0.016, m["Metal"]),
                  tube("legr", (-0.15, y, 0.36), (-0.21, y, 0.02), 0.016, m["Metal"]),
                  rounded_box("foot", (0.42, 0.03, 0.03), (-0.04, y, 0.015), m["Metal"], bevel=0.01)]
    parts += [tube("beam1", (0.1, -0.21, 0.33), (0.1, 0.21, 0.33), 0.02, m["Metal"]),
              tube("beam2", (-0.13, -0.21, 0.33), (-0.13, 0.21, 0.33), 0.02, m["Metal"])]
    seat = join("SeatEco", parts)
    # armrest, centred on y=0: the app places one between every pair of seats
    arm = join("Armrest", [rounded_box("arm", (0.38, 0.05, 0.045), (0.0, 0, 0.62), m["Armrest"], bevel=0.02, segments=4),
                           rounded_box("post", (0.05, 0.035, 0.24), (-0.12, 0, 0.49), m["Armrest"], bevel=0.012)])
    export(os.path.join(OUT, "seat_eco.glb"), [seat, arm])
    preview("seat_eco", (1.4, -1.1, 1.2), (0, 0, 0.55), lens=50)


def business():
    reset()
    m = mats()
    m["Shell"] = material("PodShell", "#dfe5ef", rough=0.3, metal=0.05)
    # wrap-around shell: U-shaped wall, tall at the back, lower towards the front
    bm = bmesh.new()
    pts = []
    for k in range(41):
        t = k / 40  # 0 = front-left, 0.5 = back centre, 1 = front-right
        ang = math.pi * (t - 0.5)  # -90..90 degrees around the back
        if abs(ang) < math.pi / 2 * 0.55:
            x = -0.52 + 0.18 * (1 - math.cos(ang * 1.4))
            y = 0.4 * math.sin(ang)
        else:
            side = 1 if ang > 0 else -1
            f = (abs(ang) - math.pi / 2 * 0.55) / (math.pi / 2 * 0.45)
            x = -0.52 + 0.18 * (1 - math.cos(math.pi / 2 * 0.55 * 1.4)) + f * 0.86
            y = side * (0.4 * math.sin(math.pi / 2 * 0.55) + (0.4 - 0.4 * math.sin(math.pi / 2 * 0.55)) * math.sin(f * math.pi / 2))
        front = max(0.0, (x + 0.2) / 0.9)
        h = 1.18 - 0.42 * front ** 1.2
        pts.append((x, y, h))
    bot = [bm.verts.new((x, y, 0.02)) for x, y, _ in pts]
    top = [bm.verts.new((x, y, h)) for x, y, h in pts]
    for i in range(len(pts) - 1):
        bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    shell = obj_from_bmesh("shell", bm, [m["Shell"]])
    s = shell.modifiers.new("solid", "SOLIDIFY")
    s.thickness = 0.045
    s.offset = 0
    sub = shell.modifiers.new("sub", "SUBSURF")
    sub.levels = 2
    apply_all(shell)
    parts = [
        shell,
        rounded_box("base", (0.62, 0.5, 0.34), (-0.02, 0, 0.19), m["Shell"], bevel=0.05),
        rounded_box("cushion", (0.6, 0.6, 0.13), (0.04, 0, 0.45), m["Fabric"], bevel=0.06, segments=5),
        backrest("back", m, 0.6, 0.62, (-0.24, 0.5), 0.36, 0.08, bulge=0.03, bucket=0.05),
        rounded_box("head", (0.09, 0.38, 0.17), (-0.43, 0, 1.08), m["Fabric"], bevel=0.04, segments=5, rot=(0, -0.34, 0)),
        rounded_box("ottoman", (0.3, 0.44, 0.12), (0.62, 0, 0.4), m["Fabric"], bevel=0.05, segments=4),
        rounded_box("ottobase", (0.32, 0.46, 0.33), (0.62, 0, 0.18), m["Shell"], bevel=0.04),
        rounded_box("arml", (0.5, 0.08, 0.05), (0.0, 0.34, 0.66), m["Armrest"], bevel=0.02),
        rounded_box("armr", (0.5, 0.08, 0.05), (0.0, -0.34, 0.66), m["Armrest"], bevel=0.02),
    ]
    lamp_bm = bmesh.new()
    bmesh.ops.create_uvsphere(lamp_bm, u_segments=12, v_segments=8, radius=0.035)
    lamp = obj_from_bmesh("lamp", lamp_bm, [m["Light"]])
    lamp.location = (-0.3, 0.33, 1.02)
    apply_all(lamp)
    parts.append(lamp)
    pod = join("SeatBusiness", parts)
    export(os.path.join(OUT, "seat_business.glb"), [pod])
    preview("seat_business", (2.0, -1.6, 1.7), (0.05, 0, 0.55), lens=50)


economy()
business()
