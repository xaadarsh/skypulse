"""SkyPulse airliner (twin-engine narrow-body).  Run:  blender -b --python tools/blender/make_airliner.py

Built so nothing floats: the wing and stabiliser roots start inside the fuselage, the winglets are
lofted out of the wing tip, and each pylon runs from inside the nacelle into the wing.
Units are metres, nose at +X, up +Z.  Livery: white body, sky-blue cheatline, violet tail, gradient fin/nacelles.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.append(os.path.dirname(__file__))
from common import OUT, airfoil, apply_all, export, join, material, obj_from_bmesh, preview, reset, rounded_box, srgb  # noqa: E402

R = 2.0
X_TAIL, X_NOSE = -19.0, 19.0


def radius(x):
    if x > 13:      # nose
        t = (x - 13) / (X_NOSE - 13)
        return R * max(0.0, 1 - t ** 2.1) ** 0.5
    if x < -9:      # upswept tail cone
        s = (-9 - x) / (-9 - X_TAIL)
        return R * (1 - 0.88 * s ** 1.35)
    return R


def centre_z(x):
    if x > 13:
        t = (x - 13) / (X_NOSE - 13)
        return -0.32 * t ** 2
    if x < -9:
        return (R - radius(x)) * 0.92  # keeps the roof line nearly straight
    return 0.0


def surf(x, th):
    r = radius(x)
    return Vector((x, r * math.cos(th), centre_z(x) + 1.04 * r * math.sin(th)))


def surf_normal(x, th):
    e = 1e-3
    du = surf(x + e, th) - surf(x - e, th)
    dv = surf(x, th + e) - surf(x, th - e)
    n = dv.cross(du).normalized()
    p = surf(x, th)
    c = Vector((x, 0, centre_z(x)))
    return n if n.dot(p - c) > 0 else -n


def mats():
    return {
        "Paint": material("Paint", "#f5f7fb", rough=0.25, metal=0.05),
        "Belly": material("Belly", "#cfd8e6", rough=0.35, metal=0.05),
        "Accent": material("Accent", "#38bdf8", rough=0.3, metal=0.1),
        "Violet": material("Violet", "#7c6cff", rough=0.3, metal=0.1),
        "Wing": material("Wing", "#dde3ec", rough=0.3, metal=0.25),
        "Window": material("Window", "#2b2416", rough=0.15, emission="#ffd9a0", strength=1.6),
        "Glass": material("Glass", "#0b1426", rough=0.08, metal=0.5),
        "Metal": material("Metal", "#a7b1c2", rough=0.25, metal=0.95),
        "Intake": material("Intake", "#141a26", rough=0.6, metal=0.4),
        "Gradient": material("Gradient", "#ffffff", rough=0.3, metal=0.1, vertex_color=True),
    }


def fuselage(m):
    xs = []
    x = X_TAIL
    while x < X_NOSE:
        xs.append(x)
        step = 0.25 if (x > 14 or x < -15) else 0.6
        x += step
    xs.append(X_NOSE - 0.02)
    n = 48
    bm = bmesh.new()
    rings = [[bm.verts.new(surf(x, 2 * math.pi * k / n)) for k in range(n)] for x in xs]
    tip = bm.verts.new((X_NOSE, 0, centre_z(X_NOSE)))
    tail = bm.verts.new((X_TAIL - 0.05, 0, centre_z(X_TAIL)))
    faces = []
    for a, b in zip(rings, rings[1:]):
        for k in range(n):
            faces.append(bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k])))
    for k in range(n):
        faces.append(bm.faces.new((rings[-1][k], rings[-1][(k + 1) % n], tip)))
        faces.append(bm.faces.new((rings[0][(k + 1) % n], rings[0][k], tail)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    order = ["Paint", "Belly", "Accent", "Violet"]
    for f in bm.faces:
        c = f.calc_center_median()
        r = max(radius(c.x), 1e-3)
        rel = (c.z - centre_z(c.x)) / (1.04 * r)  # -1 bottom .. +1 top
        mi = 0
        if rel < -0.42:
            mi = 1
        if -0.12 < rel < 0.02 and -15 < c.x < 16.2:
            mi = 2
        if c.x < -11.5 and rel > -0.1:
            mi = 3
        f.material_index = mi
    o = obj_from_bmesh("fuselage", bm, [m[k] for k in order])
    sub = o.modifiers.new("sub", "SUBSURF")
    sub.levels = 1
    apply_all(o)
    return o


def surface_panel(name, x, th, size, mat, lift=0.012, bevel=0.06):
    p, nrm = surf(x, th), surf_normal(x, th)
    o = rounded_box(name, size, (0, 0, 0), mat, bevel=bevel, segments=4)
    q = nrm.to_track_quat("Y", "Z")  # panel thickness axis (Y) along the surface normal
    o.rotation_euler = q.to_euler()
    o.location = p + nrm * lift
    apply_all(o)
    return o


def windows(m):
    out = []
    th = math.asin(0.3)
    x = -12.2
    while x < 13.2:
        if not (-1.6 < x < -0.4):  # over-wing exit gap
            for s in (1, -1):
                out.append(surface_panel("win", x, th if s > 0 else math.pi - th, (0.24, 0.03, 0.34), m["Window"], bevel=0.1))
        x += 0.52
    # cockpit glazing
    for x, ang, w, h in [(16.05, 0.42, 0.5, 0.34), (16.6, 0.42, 0.5, 0.34), (17.12, 0.45, 0.42, 0.3)]:
        for s in (1, -1):
            out.append(surface_panel("cpit", x, ang if s > 0 else math.pi - ang, (w, 0.03, h), m["Glass"], lift=0.008, bevel=0.08))
    return join("windows", out)


def lift_surface(name, mat, root_le, root_y, root_z, root_chord, tip_chord, span, sweep, dihedral, t_root, t_tip,
                 winglet=False, n=22):
    """Lofted wing / stabiliser for +Y side. Sections lie in the XZ plane; winglet sections rotate up to vertical."""
    secs = []
    stations = [i / 10 for i in range(11)]
    for s in stations:
        c = root_chord + (tip_chord - root_chord) * s
        y = root_y + span * s
        x_le = root_le - math.tan(math.radians(sweep)) * span * s
        z = root_z + math.tan(math.radians(dihedral)) * span * s
        t = t_root + (t_tip - t_root) * s
        secs.append([Vector((x_le + ax, y, z + az)) for ax, az in airfoil(c, t, n)])
    if winglet:
        y0, z0 = secs[-1][0].y, root_z + math.tan(math.radians(dihedral)) * span
        x0 = root_le - math.tan(math.radians(sweep)) * span
        for k, (dy, dz, dx, c, ang) in enumerate([(0.25, 0.12, -0.15, tip_chord * 0.95, 0.35),
                                                    (0.42, 0.45, -0.4, tip_chord * 0.85, 0.95),
                                                    (0.5, 1.0, -0.75, tip_chord * 0.7, 1.4),
                                                    (0.52, 1.7, -1.1, tip_chord * 0.5, 1.5)]):
            pts = []
            for ax, az in airfoil(c, 0.09, n):
                pts.append(Vector((x0 + dx + ax, y0 + dy - az * math.sin(ang), z0 + dz + az * math.cos(ang))))
            secs.append(pts)
    o = lofted(name, secs, mat)
    return o


def lofted(name, secs, mat):
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in sec] for sec in secs]
    n = len(secs[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bmesh(name, bm, [mat])


def mirror_y(o, name):
    c = o.copy()
    c.data = o.data.copy()
    c.name = name
    bpy.context.scene.collection.objects.link(c)
    c.scale = (1, -1, 1)
    apply_all(c)
    bm = bmesh.new()
    bm.from_mesh(c.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)  # point outwards again after the mirror
    bm.to_mesh(c.data)
    bm.free()
    return c


def gradient(o, axis, lo, hi, c0="#38bdf8", c1="#7c6cff"):
    me = o.data
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    a, b = srgb(c0), srgb(c1)
    for v in me.vertices:
        t = min(1, max(0, ((v.co.z if axis == "z" else v.co.x) - lo) / (hi - lo)))
        attr.data[v.index].color = (*(a[i] + (b[i] - a[i]) * t for i in range(3)), 1)


def lathe(name, profile, x_axis_mats, seg=40):
    """Revolve (x, r) profile around the X axis."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x, r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg))) for k in range(seg)] for x, r in profile]
    for a, b in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bmesh(name, bm, [x_axis_mats])


def engine(m, y, z_wing, x_le):
    zc = z_wing - 1.45
    xf = x_le + 2.0
    body = lathe("nacelle", [(xf + 0.02, 0.9), (xf, 1.02), (xf - 0.25, 1.12), (xf - 1.2, 1.16), (xf - 2.6, 1.08), (xf - 3.8, 0.88), (xf - 4.4, 0.7)], m["Gradient"])
    inner = lathe("intake", [(xf + 0.02, 0.9), (xf - 0.45, 0.86), (xf - 0.5, 0.0)], m["Intake"])
    spinner = lathe("spinner", [(xf - 0.2, 0.0), (xf - 0.28, 0.12), (xf - 0.45, 0.24), (xf - 0.5, 0.0)], m["Metal"])
    cone = lathe("cone", [(xf - 4.35, 0.62), (xf - 4.8, 0.42), (xf - 5.3, 0.08), (xf - 5.32, 0.0)], m["Metal"])
    parts = [body, inner, spinner, cone]
    for p in parts:
        p.location = (0, y, zc)
        apply_all(p)
    gradient(body, "x", xf - 4.4, xf)
    # pylon: vertical lofted fairing from inside the nacelle up into the wing
    secs = []
    for z in (zc + 0.85, zc + 1.2, z_wing + 0.05):
        secs.append([Vector((x_le + 1.4 + ax, y + az, z)) for ax, az in airfoil(3.8, 0.12, 18, camber=0)])
    parts.append(lofted("pylon", secs, m["Wing"]))
    return parts


def build():
    reset()
    m = mats()
    parts = [fuselage(m), windows(m)]
    # wings (low wing, root inside the fuselage)
    wing_le, wing_z = 3.4, -1.0
    wr = lift_surface("wingR", m["Wing"], wing_le, 0.2, wing_z, 6.4, 1.45, 16.8, 27, 5.5, 0.14, 0.1, winglet=True)
    # wing-root fairing blends wing into the belly
    fair = rounded_box("fairing", (7.5, 3.4, 1.0), (0.9, 0, -1.55), m["Belly"], bevel=0.45, segments=6)
    parts += [wr, mirror_y(wr, "wingL"), fair]
    y_eng = 5.9
    s = (y_eng - 0.2) / 16.8
    x_le = wing_le - math.tan(math.radians(27)) * 16.8 * s
    z_w = wing_z + math.tan(math.radians(5.5)) * 16.8 * s
    eng = engine(m, y_eng, z_w, x_le)
    parts += eng + [mirror_y(e, e.name + "L") for e in eng]
    # tail: vertical fin (gradient livery) and horizontal stabilisers
    secs = []
    for k in range(9):
        t = k / 8
        h = 7.0 * t
        c = 6.6 + (2.3 - 6.6) * t
        x_le_f = -12.0 - math.tan(math.radians(38)) * h
        secs.append([Vector((x_le_f + ax, az, 1.55 + h)) for ax, az in airfoil(c, 0.11, 20, camber=0)])
    fin = lofted("fin", secs, m["Gradient"])
    gradient(fin, "z", 1.6, 8.5)
    hs = lift_surface("stabR", m["Wing"], -14.6, 0.1, 0.95, 4.0, 1.4, 6.4, 32, 7, 0.1, 0.08)
    parts += [fin, hs, mirror_y(hs, "stabL")]
    for o in parts:
        try:
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
            o.select_set(False)
        except Exception:
            pass
    plane = join("Airliner", parts)
    export(os.path.join(OUT, "airliner.glb"), [plane])
    preview("airliner_front", (30, -26, 12), (0, 0, 0), lens=45)
    preview("airliner_side", (2, -48, 4), (0, 0, 1), lens=45)
    preview("airliner_top", (-8, -14, 44), (0, 0, 0), lens=40)


build()
