"""Shared helpers for the SkyPulse Blender asset scripts (Blender 4.2+ / 5.x).

Coordinates: Blender X = forward (nose / the direction a passenger faces), Y = left, Z = up.
The glTF exporter converts to three.js Y-up, so +X stays +X, Z becomes Y.
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "frontend", "public", "models")
PREVIEW = os.path.join(ROOT, "tools", "blender", "previews")


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for x in list(coll):
            coll.remove(x)


def srgb(h):
    """'#rrggbb' -> linear RGB tuple (glTF base colours are linear)."""
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def material(name, color="#ffffff", rough=0.5, metal=0.0, emission=None, strength=1.0, vertex_color=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if hasattr(m, "use_nodes") and not m.use_nodes:
        m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*srgb(color), 1)
    m.diffuse_color = (*srgb(color), 1)  # viewport / preview colour
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*srgb(emission), 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    if vertex_color:
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Col"
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def obj_from_bmesh(name, bm, mats=(), smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return o


def rounded_box(name, size, loc, mat, bevel=0.02, segments=4, rot=(0, 0, 0)):
    """Box with bevelled (rounded) edges, modifiers applied."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    o = obj_from_bmesh(name, bm, [mat])
    o.location = loc
    o.rotation_euler = rot
    b = o.modifiers.new("bevel", "BEVEL")
    b.width = min(bevel, min(size) * 0.49)
    b.segments = segments
    b.limit_method = "NONE"
    apply_all(o)
    return o


def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    # bake transforms into the mesh
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.select_set(False)


def join(name, objs):
    """Join objects into one mesh object (keeps per-face materials)."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    o.select_set(False)
    return o


def loft(name, sections, mat, cap_start=True, cap_end=True, smooth=True):
    """Bridge a list of closed point loops (each a list of Vector, same count) into a surface."""
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in sec] for sec in sections]
    n = len(sections[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_start:
        bm.faces.new(list(reversed(rings[0])))
    if cap_end:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bmesh(name, bm, [mat], smooth)


def airfoil(chord, thick, n=20, camber=0.02):
    """NACA-4-like airfoil loop in (x, z), x from leading edge (0) to trailing edge (-chord)."""
    pts = []
    for k in range(n):
        t = k / (n - 1)
        x = 0.5 * (1 - math.cos(math.pi * t))
        yt = 5 * thick * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)
        yc = camber * 4 * x * (1 - x)
        pts.append((x, yc + yt))
    lower = []
    for k in range(n - 2, 0, -1):
        t = k / (n - 1)
        x = 0.5 * (1 - math.cos(math.pi * t))
        yt = 5 * thick * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)
        yc = camber * 4 * x * (1 - x)
        lower.append((x, yc - yt))
    loop = pts + lower
    return [(-x * chord, z * chord) for x, z in loop]


def export(path, objects=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects or bpy.context.scene.objects:
        o.select_set(True)
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
              export_draco_position_quantization=14, export_draco_normal_quantization=10,
              export_texcoords=True, export_normals=True)
    try:
        bpy.ops.export_scene.gltf(**kw, export_vertex_color="MATERIAL")
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    print("exported", path, os.path.getsize(path), "bytes")


def preview(name, cam_loc, target=(0, 0, 0), res=(900, 600), lens=40):
    """Quick Workbench render so the geometry can be checked without opening Blender."""
    os.makedirs(PREVIEW, exist_ok=True)
    scn = bpy.context.scene
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("cam", cam_data)
    scn.collection.objects.link(cam)
    cam.location = cam_loc
    d = Vector(target) - Vector(cam_loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scn.camera = cam
    scn.render.engine = "BLENDER_WORKBENCH"
    scn.display.shading.light = "STUDIO"
    scn.display.shading.color_type = "MATERIAL"
    scn.display.shading.show_cavity = True
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.filepath = os.path.join(PREVIEW, name + ".png")
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
