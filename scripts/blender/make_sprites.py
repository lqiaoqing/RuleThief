"""
Blender 5.2 headless sprite renderer for RULE THIEF style proof.

Run:
  "D:/QSoftware/Programs/Blender Foundation/Blender 5.2/blender.exe" \
    --background --factory-startup --python scripts/blender/make_sprites.py

Outputs raw transparent PNGs to art-source/sprites/raw/.
The smoothing/outline pass is done by scripts/postprocess_sprites.py (Pillow).
"""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

try:
    SCRIPT_DIR = Path(__file__).resolve().parent
except NameError:
    SCRIPT_DIR = Path(os.getcwd())
PROJECT = SCRIPT_DIR.parents[1]
OUT_DIR = PROJECT / "art-source" / "sprites" / "raw"
OUT_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# scene / helpers
# ---------------------------------------------------------------------------

def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def srgb(value: str) -> tuple[float, float, float, float]:
    value = value.lstrip("#")
    rgb = [int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
    linear = []
    for c in rgb:
        linear.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*linear, 1.0)


def material(
    name: str,
    color: str,
    *,
    metallic: float = 0.0,
    roughness: float = 0.62,
    emission: str | None = None,
    emission_strength: float = 0.0,
):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = srgb(color)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = srgb(emission)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def collection(name: str):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def put(obj, coll) -> None:
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


def shade(obj, smooth: bool = True) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if smooth:
        bpy.ops.object.shade_smooth()
    else:
        bpy.ops.object.shade_flat()
    obj.select_set(False)


def sphere(name, loc, scale, mat, coll, *, segments=32, rings=16, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, radius=1.0, location=loc
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    shade(obj, smooth)
    obj.data.materials.append(mat)
    put(obj, coll)
    return obj


def cone(name, loc, r1, r2, depth, mat, coll, *, rot=(0, 0, 0), vertices=16, smooth=False):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=r1,
        radius2=r2,
        depth=depth,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    shade(obj, smooth)
    obj.data.materials.append(mat)
    put(obj, coll)
    return obj


def cylinder(name, loc, radius, depth, mat, coll, *, rot=(0, 0, 0), vertices=20, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot
    )
    obj = bpy.context.object
    obj.name = name
    shade(obj, smooth)
    obj.data.materials.append(mat)
    put(obj, coll)
    return obj


def torus(name, loc, major, minor, mat, coll, *, rot=(0, 0, 0), smooth=True):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, location=loc, rotation=rot,
        major_segments=32, minor_segments=12
    )
    obj = bpy.context.object
    obj.name = name
    shade(obj, smooth)
    obj.data.materials.append(mat)
    put(obj, coll)
    return obj


def cube(name, loc, scale, mat, coll, *, rot=(0, 0, 0), bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("soft edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    obj.data.materials.append(mat)
    put(obj, coll)
    return obj


def mesh(name, verts, faces, mat, coll, *, solidify=0.0, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    obj = bpy.data.objects.new(name, me)
    coll.objects.link(obj)
    if solidify:
        mod = obj.modifiers.new("thickness", "SOLIDIFY")
        mod.thickness = solidify
        mod.offset = 0.0
    shade(obj, smooth)
    obj.data.materials.append(mat)
    return obj


def look_at(obj, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


# ---------------------------------------------------------------------------
# build assets
# ---------------------------------------------------------------------------

clear_scene()

# palette
INK = "#070b14"
DEEP = "#111a2b"
STEEL = "#243249"
SILVER = "#8fa3bd"
PALE = "#d9e6f2"
GOLD = "#e9bd6b"
VIOLET = "#7c5bd6"
PURPLE = "#b69bff"
CYAN = "#65dcf0"
ORANGE = "#ff9a52"
RED = "#ff5f6d"
ROSE = "#d44e72"

# materials
m_cloak = material("cloak", "#2b183d", roughness=0.82)
m_cloak_trim = material("cloak trim", "#a8324c", roughness=0.7)
m_tome = material("tome", "#32131f", roughness=0.55)
m_skin = material("skin", "#cfae9c", roughness=0.75)
m_hair = material("white hair", "#dbe6f0", roughness=0.65)
m_dark = material("dark metal", STEEL, metallic=0.65, roughness=0.35)
m_darker = material("black metal", "#0c1420", metallic=0.5, roughness=0.45)
m_gold = material("gold", GOLD, metallic=0.85, roughness=0.28)
m_red_glow = material("red gem", "#ff4c61", roughness=0.2, emission="#ff304c", emission_strength=5.5)
m_cyan_glow = material("cyan glow", CYAN, roughness=0.2, emission=CYAN, emission_strength=5.0)
m_orange_glow = material("orange glow", ORANGE, roughness=0.2, emission=ORANGE, emission_strength=6.5)
m_purple_glow = material("purple glow", PURPLE, roughness=0.2, emission=PURPLE, emission_strength=4.0)
m_beetle = material("beetle shell", "#211b3c", metallic=0.7, roughness=0.33)
m_beetle_plate = material("beetle plates", "#3b2f5e", metallic=0.75, roughness=0.25)
m_bat = material("bat body", "#141f34", roughness=0.55)
m_bat_wing = material("bat wing", "#2a1e4c", roughness=0.6)
m_eye_red = material("beetle eye", "#ffddb0", roughness=0.2, emission="#ff5a2e", emission_strength=7.0)
m_boss_cloak = material("arbiter cloak", "#171024", roughness=0.72)
m_boss_body = material("arbiter body", "#120c1f", metallic=0.55, roughness=0.4)
m_boss_iris = material("arbiter iris", "#3a2166", roughness=0.22, emission="#8a5cff", emission_strength=2.0)
m_boss_iris_ring = material("arbiter iris ring", "#9df4ff", roughness=0.2, emission=CYAN, emission_strength=3.6)
m_boss_pupil = material("arbiter pupil", "#05030a", roughness=0.25)
m_boss_ring = material("arbiter ring", "#8d6a39", metallic=0.8, roughness=0.25)
m_shard = material("shard", "#2a1d44", metallic=0.5, roughness=0.3,
                   emission="#5f3b9a", emission_strength=2.2)

# collections
c_player = collection("PLAYER")
c_beetle = collection("BEETLE")
c_bat = collection("BAT")
c_boss = collection("BOSS")
c_rig = collection("RIG")

# ---------------------------------------------------------------------------
# PLAYER · the rule thief
# ---------------------------------------------------------------------------
# cloak / body
cone("cloak", (0, 0, 0.72), 0.68, 0.23, 1.28, m_cloak, c_player, vertices=20, smooth=True)
torus("cloak trim", (0, 0, 1.24), 0.34, 0.055, m_cloak_trim, c_player)
sphere("head", (0, -0.04, 1.48), (0.26, 0.24, 0.28), m_skin, c_player)
sphere("hair mass", (0, 0.01, 1.57), (0.3, 0.28, 0.26), m_hair, c_player)
# a few white hair spikes, swept back
for i, (x, z, ang) in enumerate([(-0.19, 1.7, -0.5), (-0.06, 1.74, -0.2), (0.08, 1.73, 0.2), (0.2, 1.68, 0.5)]):
    cone(f"hair spike {i}", (x, 0.08, z), 0.075, 0.005, 0.32, m_hair, c_player,
         rot=(math.radians(90), 0, ang), vertices=8)
# crown
cylinder("crown band", (0, -0.03, 1.78), 0.2, 0.07, m_gold, c_player, vertices=16)
for i, ang in enumerate([-2.5, -0.8, 0.8, 2.5]):
    x = 0.17 * math.sin(ang)
    y = -0.03 - 0.17 * math.cos(ang)
    cone(f"crown point {i}", (x, y, 1.86), 0.055, 0.005, 0.14, m_gold, c_player, vertices=8)
# face / eyes
for x in (-0.09, 0.09):
    sphere("eye", (x, -0.265, 1.49), (0.027, 0.02, 0.035), m_dark, c_player, segments=16, rings=8)
# hands
sphere("right hand", (0.45, -0.16, 1.06), (0.09, 0.08, 0.09), m_skin, c_player)
# staff
cylinder("staff shaft", (0.56, -0.22, 1.02), 0.028, 1.9, m_dark, c_player,
         rot=(0, math.radians(-6), 0), vertices=12)
sphere("staff gem", (0.46, -0.22, 1.99), (0.115, 0.115, 0.14), m_red_glow, c_player)
torus("staff ring", (0.46, -0.22, 1.99), 0.16, 0.022, m_gold, c_player,
      rot=(math.radians(90), 0, 0))
# feet
for x in (-0.18, 0.18):
    sphere("foot", (x, -0.28, 0.1), (0.12, 0.17, 0.1), m_darker, c_player, segments=16, rings=8)
# shoulder mantle and belt
cone("mantle", (0, 0, 1.13), 0.57, 0.33, 0.26, m_cloak, c_player, vertices=20, smooth=True)
torus("mantle trim", (0, 0, 1.02), 0.46, 0.028, m_gold, c_player)
torus("belt", (0, 0, 0.78), 0.44, 0.032, m_gold, c_player)
# glowing rule-rune on the cloak
torus("cloak rune", (0, -0.49, 0.88), 0.088, 0.014, m_cyan_glow, c_player,
      rot=(math.radians(90), 0, 0))
sphere("rune core", (0, -0.51, 0.88), (0.028, 0.018, 0.028), m_cyan_glow, c_player)
# left hand + stolen tome
sphere("left hand", (-0.42, -0.2, 1.0), (0.09, 0.08, 0.09), m_skin, c_player)
cube("tome", (-0.5, -0.26, 1.04), (0.19, 0.13, 0.045), m_tome, c_player,
     rot=(math.radians(12), 0, math.radians(-22)), bevel=0.012)
cube("tome rune", (-0.5, -0.335, 1.05), (0.1, 0.06, 0.008), m_red_glow, c_player,
     rot=(math.radians(12), 0, math.radians(-22)), bevel=0.004)
# a small red cape panel behind, catches rim light
mesh(
    "cape",
    [(-0.34, 0.12, 1.18), (0.34, 0.12, 1.18), (0.45, 0.2, 0.3), (-0.45, 0.2, 0.3)],
    [(0, 1, 2, 3)],
    m_cloak_trim,
    c_player,
    solidify=0.025,
)

# ---------------------------------------------------------------------------
# BEETLE · iron-spike beetle
# ---------------------------------------------------------------------------
sphere("body", (0, 0, 0.52), (0.88, 1.08, 0.5), m_beetle, c_beetle)
sphere("shell center", (0, 0.08, 0.78), (0.62, 0.72, 0.22), m_beetle_plate, c_beetle)
for i, y in enumerate([-0.5, 0.02, 0.52]):
    sphere(f"shell plate {i}", (0, y, 0.88), (0.5 - 0.05 * i, 0.28, 0.14), m_beetle_plate, c_beetle)
cube("shell ridge", (0, 0.06, 1.0), (0.07, 0.9, 0.07), m_dark, c_beetle, bevel=0.02)
# glowing cracks in the carapace
for i, (x, y, z, rx, ry, rz) in enumerate([
    (-0.32, -0.24, 0.94, math.radians(18), math.radians(-35), 0),
    (0.34, -0.1, 0.95, math.radians(-12), math.radians(32), 0),
    (-0.42, 0.3, 0.88, math.radians(12), math.radians(-42), 0),
    (0.4, 0.38, 0.86, math.radians(-18), math.radians(40), 0),
]):
    cylinder(f"ember crack {i}", (x, y, z), 0.018, 0.34, m_orange_glow, c_beetle,
             rot=(rx, ry, rz), vertices=8)
# horn and mandibles
cone("horn", (0, -0.95, 0.62), 0.17, 0.012, 0.62, m_dark, c_beetle,
     rot=(math.radians(90), 0, 0), vertices=12)
for x in (-1, 1):
    cone("mandible", (x * 0.17, -1.0, 0.38), 0.06, 0.004, 0.34, m_dark, c_beetle,
         rot=(math.radians(96), 0, math.radians(-x * 14)), vertices=8)
# spikes
spike_specs = [
    ((-0.82, 0, 0.72), (0, math.radians(-68), 0)),
    ((0.82, 0, 0.72), (0, math.radians(68), 0)),
    ((-0.54, -0.58, 0.82), (math.radians(-42), math.radians(-48), 0)),
    ((0.54, -0.58, 0.82), (math.radians(-42), math.radians(48), 0)),
    ((-0.54, 0.58, 0.82), (math.radians(42), math.radians(-48), 0)),
    ((0.54, 0.58, 0.82), (math.radians(42), math.radians(48), 0)),
    ((-0.3, -0.3, 1.02), (math.radians(-15), math.radians(-18), 0)),
    ((0.3, 0.3, 1.02), (math.radians(15), math.radians(18), 0)),
]
for i, (loc, rot) in enumerate(spike_specs):
    cone(f"spike {i}", loc, 0.13, 0.005, 0.6, m_dark, c_beetle, rot=rot, vertices=10)
# eyes
for x in (-0.2, 0.2):
    sphere("beetle eye", (x, -0.78, 0.7), (0.075, 0.035, 0.075), m_eye_red, c_beetle, segments=16, rings=8)
# legs
for side in (-1, 1):
    for i, y in enumerate([-0.42, 0.02, 0.46]):
        cylinder(
            f"leg {side} {i}",
            (side * 0.72, y, 0.25),
            0.035,
            0.62,
            m_darker,
            c_beetle,
            rot=(math.radians(90), math.radians(side * 55), 0),
            vertices=8,
        )

# ---------------------------------------------------------------------------
# BAT · lightning bat
# ---------------------------------------------------------------------------
sphere("bat body", (0, 0, 1.2), (0.34, 0.3, 0.42), m_bat, c_bat)
sphere("bat head", (0, -0.2, 1.5), (0.24, 0.22, 0.24), m_bat, c_bat)
for x in (-0.13, 0.13):
    cone("ear", (x, -0.18, 1.72), 0.07, 0.005, 0.28, m_bat, c_bat,
         rot=(0, math.radians(-12 if x < 0 else 12), 0), vertices=8)
    sphere("bat eye", (x, -0.39, 1.51), (0.038, 0.02, 0.045), m_cyan_glow, c_bat, segments=16, rings=8)
# jagged wing meshes (left mirrored to right)
wing_left = [
    (0.0, 0.0, 1.24),       # root
    (-0.4, 0.04, 1.48),
    (-0.82, -0.02, 1.52),
    (-0.68, -0.16, 1.34),   # notch
    (-1.22, -0.24, 1.36),   # long tip
    (-0.94, -0.36, 1.16),   # notch
    (-1.1, -0.54, 1.02),    # lower tip
    (-0.68, -0.42, 1.07),   # notch
    (-0.44, -0.24, 1.12),
    (-0.18, -0.08, 1.16),
]
wing_faces = [(0, i, i + 1) for i in range(1, len(wing_left) - 1)]
mesh("wing left", wing_left, wing_faces, m_bat_wing, c_bat, solidify=0.03, smooth=True)
wing_right = [(-x, y, z) for (x, y, z) in wing_left]
mesh("wing right", wing_right, wing_faces, m_bat_wing, c_bat, solidify=0.03, smooth=True)
# glowing wing bones / veins
for side in (-1, 1):
    for pts in [
        [(0, 0.02, 1.25), (side * 0.4, 0.04, 1.48), (side * 0.82, -0.02, 1.52),
         (side * 1.2, -0.24, 1.36)],
        [(side * 0.42, 0.02, 1.42), (side * 0.68, -0.16, 1.34),
         (side * 0.94, -0.36, 1.16)],
        [(side * 0.44, 0.0, 1.3), (side * 0.68, -0.42, 1.07),
         (side * 1.08, -0.54, 1.02)],
    ]:
        for a, b in zip(pts, pts[1:]):
            va, vb = Vector(a), Vector(b)
            mid = (va + vb) * 0.5
            length = (vb - va).length
            obj = cylinder("wing bone", mid, 0.011, length, m_cyan_glow, c_bat, vertices=8)
            obj.rotation_euler = (vb - va).to_track_quat("Z", "Y").to_euler()
# wing tip sparks
for side in (-1, 1):
    sphere("wing spark", (side * 1.2, -0.24, 1.36), (0.035, 0.02, 0.035), m_cyan_glow, c_bat,
           segments=12, rings=6)
# tail
cone("tail", (0, 0.28, 1.05), 0.1, 0.005, 0.55, m_bat, c_bat,
     rot=(math.radians(-70), 0, 0), vertices=8)
sphere("tail tip", (0, 0.06, 1.34), (0.035, 0.035, 0.035), m_cyan_glow, c_bat, segments=12, rings=6)

# ---------------------------------------------------------------------------
# BOSS · RULE ARBITER
# ---------------------------------------------------------------------------
# robed arbiter body
cone("arbiter robe", (0, 0, 1.05), 1.28, 0.5, 2.15, m_boss_cloak, c_boss, vertices=24, smooth=True)
# vertical robe folds catch the rim light
for x in (-0.34, 0.0, 0.34):
    cone("robe fold", (x, -0.05, 0.95), 0.08, 0.02, 1.7, m_boss_body, c_boss,
         vertices=8, smooth=True)
# pauldrons
for side in (-1, 1):
    sphere("pauldron", (side * 0.66, 0, 2.0), (0.3, 0.24, 0.18), m_boss_body, c_boss)
    cone("shoulder spike", (side * 0.82, 0.02, 2.08), 0.1, 0.006, 0.65, m_dark, c_boss,
         rot=(0, math.radians(side * 55), 0), vertices=8)
# hood mass behind the eye
sphere("arbiter hood", (0, 0.08, 2.48), (1.0, 0.68, 0.9), m_boss_cloak, c_boss)
# eye socket / iris / slit pupil
sphere("arbiter socket", (0, -0.28, 2.35), (0.78, 0.4, 0.7), m_boss_body, c_boss)
sphere("arbiter iris", (0, -0.48, 2.35), (0.56, 0.24, 0.56), m_boss_iris, c_boss)
sphere("arbiter pupil", (0, -0.7, 2.35), (0.09, 0.035, 0.32), m_boss_pupil, c_boss)
sphere("arbiter glint", (-0.13, -0.72, 2.48), (0.045, 0.012, 0.045), m_cyan_glow,
       c_boss, segments=16, rings=8)
# heavy brow plates make the eye read as an arbiter, not a face
cube("brow left", (-0.28, -0.58, 2.62), (0.34, 0.1, 0.12), m_boss_body, c_boss,
     rot=(0, 0, math.radians(-16)), bevel=0.03)
cube("brow right", (0.28, -0.58, 2.62), (0.34, 0.1, 0.12), m_boss_body, c_boss,
     rot=(0, 0, math.radians(16)), bevel=0.03)
cube("lower lid", (0, -0.58, 2.08), (0.5, 0.08, 0.08), m_boss_body, c_boss,
     bevel=0.025)
# vertical halo rings
torus("halo outer", (0, 0.06, 2.35), 1.28, 0.05, m_boss_ring, c_boss,
      rot=(math.radians(90), 0, 0))
# floating obelisk shards around the halo
for i in range(8):
    a = i * math.tau / 8
    radius = 1.5 + 0.1 * math.sin(i * 2.1)
    loc = (math.cos(a) * radius, 0.08 + math.sin(a) * 0.28,
           2.35 + math.sin(a) * 1.05)
    cube(
        f"shard {i}",
        loc,
        (0.13, 0.07, 0.34 + 0.1 * (i % 3)),
        m_shard,
        c_boss,
        rot=(a * 0.7, a * 0.3, a),
        bevel=0.02,
    )
# crown spikes around the base of the halo
for i in range(10):
    a = i * math.tau / 10
    x, y = math.cos(a) * 1.0, math.sin(a) * 0.25
    cone(f"arbiter spike {i}", (x, y, 1.35), 0.12, 0.008, 0.55, m_dark, c_boss,
         rot=(math.radians(90), 0, a), vertices=8)
# lower robe spikes / tattered edge
for i in range(9):
    a = i * math.tau / 9
    x, y = math.cos(a) * 1.05, math.sin(a) * 0.5
    cone(f"robe spike {i}", (x, y, 0.25), 0.12, 0.006, 0.5, m_dark, c_boss,
         rot=(math.radians(90), 0, a), vertices=8)

# ---------------------------------------------------------------------------
# camera / lights / render setup
# ---------------------------------------------------------------------------
cam_data = bpy.data.cameras.new("StyleCam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 3.3
cam = bpy.data.objects.new("StyleCam", cam_data)
c_rig.objects.link(cam)
cam.location = (0, -7.2, 8.6)
look_at(cam, Vector((0, 0, 0.95)))
bpy.context.scene.camera = cam


def add_area(name, loc, energy, color, size, target=(0, 0, 1.0)):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.color = srgb(color)[:3]
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    c_rig.objects.link(obj)
    obj.location = loc
    look_at(obj, Vector(target))
    return obj


add_area("key", (-3.8, -4.8, 6.5), 380, "#ffe1c0", 4.0)
add_area("fill", (4.2, -3.2, 3.8), 210, CYAN, 3.0)
add_area("rim", (0.5, 4.5, 5.6), 520, PURPLE, 3.2)
add_area("top", (0.0, -0.8, 7.5), 180, "#bcd7ff", 3.5)

world = bpy.data.worlds.new("StyleWorld")
bpy.context.scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.006, 0.009, 0.02, 1.0)
bg.inputs[1].default_value = 0.35

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.render.threads_mode = "AUTO"

ASSETS = [
    ("PLAYER", c_player, "player_raw.png", 3.4, 512, 0.95),
    ("BEETLE", c_beetle, "beetle_raw.png", 3.2, 512, 0.75),
    ("BAT", c_bat, "bat_raw.png", 3.9, 512, 1.15),
    ("BOSS", c_boss, "boss_raw.png", 5.0, 768, 1.65),
]

HIDE = [s.strip().lower() for s in os.environ.get("HIDE", "").split(",") if s.strip()]
ONLY = os.environ.get("ONLY", "").strip().upper()

for name, coll, filename, ortho, resolution, target_z in ASSETS:
    if ONLY and name != ONLY:
        continue
    for c in (c_player, c_beetle, c_bat, c_boss):
        c.hide_render = c != coll
    for obj in coll.objects:
        obj.hide_render = any(token in obj.name.lower() for token in HIDE)
    cam_data.ortho_scale = ortho
    look_at(cam, Vector((0, 0, target_z)))
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.filepath = str(OUT_DIR / filename)
    print(f"[RULE THIEF] rendering {name} -> {scene.render.filepath}")
    bpy.ops.render.render(write_still=True)

print("[RULE THIEF] done:", OUT_DIR)
