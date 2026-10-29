"""Bundled environment map (offline): an equirectangular studio/sky HDR rendered with Cycles.
Soft white overhead light, sky-blue and violet fills (the SkyPulse palette), a warm 'sun' and a dark floor.
Run:  blender -b --python tools/blender/make_hdri.py   ->  frontend/public/hdri/studio.hdr
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
from common import ROOT, reset, srgb  # noqa: E402


def emitter(name, loc, size, color, strength, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[1], 1)
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*srgb(color), 1)
    e.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], out.inputs[0])
    o.data.materials.append(m)
    # face the centre
    o.rotation_mode = "QUATERNION"
    from mathutils import Vector
    o.rotation_quaternion = (-Vector(loc)).to_track_quat("Z", "Y")
    return o


reset()
scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.samples = 64
scn.cycles.device = "CPU"
world = bpy.data.worlds.new("w")
scn.world = world
nt = world.node_tree
bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
grad = nt.nodes.new("ShaderNodeTexGradient")
tc = nt.nodes.new("ShaderNodeTexCoord")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
ramp = nt.nodes.new("ShaderNodeValToRGB")
nt.links.new(tc.outputs["Generated"], sep.inputs[0])
# vertical gradient: dark floor -> deep blue horizon -> lighter zenith
mapr = nt.nodes.new("ShaderNodeMapRange")
nt.links.new(tc.outputs["Normal"], sep.inputs[0])
nt.links.new(sep.outputs["Z"], mapr.inputs["Value"])
mapr.inputs["From Min"].default_value = -1
mapr.inputs["From Max"].default_value = 1
nt.links.new(mapr.outputs[0], ramp.inputs["Fac"])
ramp.color_ramp.elements[0].color = (*srgb("#06080f"), 1)
ramp.color_ramp.elements[1].color = (*srgb("#3a4a78"), 1)
e = ramp.color_ramp.elements.new(0.5)
e.color = (*srgb("#141c33"), 1)
nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 0.6

emitter("top", (0, 0, 9), (9, 5), "#ffffff", 5.0)
emitter("sky", (-8, 4, 3), (4, 6), "#7dd3fc", 3.5)
emitter("violet", (8, -4, 3), (4, 6), "#a78bfa", 3.0)
emitter("sun", (5, 7, 6), (1.2, 1.2), "#ffe2b8", 30.0)
emitter("rim", (0, -9, 1.5), (8, 1.2), "#dbe7ff", 2.5)

cam_data = bpy.data.cameras.new("pano")
cam_data.type = "PANO"
for attr, val in (("panorama_type", "EQUIRECTANGULAR"),):
    if hasattr(cam_data, attr):
        setattr(cam_data, attr, val)
    elif hasattr(cam_data, "cycles"):
        setattr(cam_data.cycles, attr, val)
cam = bpy.data.objects.new("pano", cam_data)
scn.collection.objects.link(cam)
cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
scn.camera = cam
scn.render.resolution_x, scn.render.resolution_y = 1024, 512
scn.render.image_settings.file_format = "HDR"
out = os.path.join(ROOT, "frontend", "public", "hdri", "studio.hdr")
os.makedirs(os.path.dirname(out), exist_ok=True)
scn.render.filepath = out
bpy.ops.render.render(write_still=True)
print("exported", out, os.path.getsize(out))
