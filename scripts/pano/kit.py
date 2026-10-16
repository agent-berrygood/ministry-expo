"""실사 렌더용 전시홀·부스 키트 (Blender). render.py가 불러 쓴다.

웹 장면의 단순한 상자(폴리곤)를 쓰지 않고, 실제 사회적가치페스타(코엑스 홀) 같은 모습으로 새로 짓는다.
- 전시홀: 실내, 높은 검은 천장 철골 + 천장 조명, 광택 콘크리트 바닥, 벽
- 일반 부스(친환경): 검은 철골 프레임 + 크라프트 허니콤보드 벽 + 뒤에서 빛나는 패브릭 간판
                     + 허니콤보드 데스크(인쇄 앞판, 합판 상판) + 종이 책자 꽂이 + 합판 선반 + 실사 화분 + 스포트라이트
- 장터(마켓 부스): 나무 골조 + 나무 뒷벽 + 나무 조리대 + 철판·전·국솥·그릇 / 선물 상자 + 나무 상 + 실사 의자
- 입구: 트러스 기둥 + 패브릭 현수막 + 풍선
- 교역자 스탠드·존 안내석·환영 데스크: 허니콤보드 몸통 + 합판 상판
크기·위치는 웹 데이터(public/data/*.json)와 같아서 웹에서 내보낸 간판·포스터·사진 인물과 맞물린다.
좌표: 웹 (x, y, z) → Blender (x, -z, y). 부스 로컬에서 웹 정면 +z = Blender -y.
"""

import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

BOOTH_STD = {"w": 4.0, "d": 3.0, "h": 3.0}
BOOTH_WIDE = {"w": 8.0, "d": 5.0, "h": 3.2}
HALL = {"x0": -52.0, "x1": 62.0, "z0": -102.0, "z1": 18.0, "ceiling": 14.0}


def W(x, y, z):
    """웹 좌표 → Blender 좌표"""
    return Vector((x, -z, y))


def hex_to_linear(h):
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)


# ---------- 재질 ----------
_mats = {}


def _node_tex_bump(nt, b, scale, strength, kind="noise"):
    coord = nt.nodes.new("ShaderNodeTexCoord")
    if kind == "noise":
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = scale
        out = tex.outputs["Fac"]
    else:  # voronoi: 허니콤보드 표면의 미세한 요철
        tex = nt.nodes.new("ShaderNodeTexVoronoi")
        tex.inputs["Scale"].default_value = scale
        out = tex.outputs["Distance"]
    nt.links.new(coord.outputs["Object"], tex.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    nt.links.new(out, bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return out


def mat(name, color, rough=0.5, metal=0.0, coat=0.0, bump=0.0, bump_scale=150.0, bump_kind="noise",
        wood=False, emission=0.0, transmission=0.0, mottle=0.0):
    key = (name, tuple(round(v, 3) for v in color))
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = color
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if coat:
        for k in ("Coat Weight", "Clearcoat"):
            if k in b.inputs:
                b.inputs[k].default_value = coat
    if transmission:
        for k in ("Transmission Weight", "Transmission"):
            if k in b.inputs:
                b.inputs[k].default_value = transmission
    if emission:
        for k in ("Emission Color", "Emission"):
            if k in b.inputs:
                b.inputs[k].default_value = color
        if "Emission Strength" in b.inputs:
            b.inputs["Emission Strength"].default_value = emission
    coord = None
    if wood or mottle:
        coord = nt.nodes.new("ShaderNodeTexCoord")
        if wood:
            tex = nt.nodes.new("ShaderNodeTexWave")
            tex.inputs["Scale"].default_value = 2.5
            tex.inputs["Distortion"].default_value = 8.0
            tex.inputs["Detail"].default_value = 5.0
            lo = 0.72
        else:
            tex = nt.nodes.new("ShaderNodeTexNoise")
            tex.inputs["Scale"].default_value = 1.2
            tex.inputs["Detail"].default_value = 8.0
            lo = 1.0 - mottle
        nt.links.new(coord.outputs["Object"], tex.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = tuple(v * lo for v in color[:3]) + (1,)
        ramp.color_ramp.elements[1].color = color
        nt.links.new(tex.outputs["Fac"] if "Fac" in tex.outputs else tex.outputs[0], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    if bump:
        _node_tex_bump(nt, b, bump_scale, bump, bump_kind)
    _mats[key] = m
    return m


KRAFT = lambda: mat("HoneycombKraft", hex_to_linear("#b48c62"), rough=0.88, bump=0.15, bump_scale=60, bump_kind="voronoi", mottle=0.12)  # noqa: E731
STEEL = lambda: mat("BlackSteel", (0.025, 0.025, 0.027, 1), rough=0.38, metal=0.8)  # noqa: E731
PLY = lambda: mat("Plywood", hex_to_linear("#d9b98e"), rough=0.55, wood=True)  # noqa: E731
TIMBER = lambda: mat("Timber", hex_to_linear("#9b6a3f"), rough=0.6, wood=True)  # noqa: E731
LIGHTBOX = lambda: mat("FabricLightbox", (0.92, 0.92, 0.9, 1), rough=0.9, emission=0.6, bump=0.05, bump_scale=400)  # noqa: E731
PAPER = lambda: mat("Paper", (0.88, 0.88, 0.85, 1), rough=0.85)  # noqa: E731
CERAMIC = lambda: mat("Ceramic", (0.9, 0.9, 0.88, 1), rough=0.15, coat=0.6)  # noqa: E731
STAINLESS = lambda: mat("Stainless", (0.72, 0.72, 0.74, 1), rough=0.22, metal=1.0)  # noqa: E731
CAST_IRON = lambda: mat("CastIron", (0.03, 0.03, 0.03, 1), rough=0.55, metal=0.6)  # noqa: E731
JEON = lambda: mat("Jeon", hex_to_linear("#d99a3a"), rough=0.5, bump=0.4, bump_scale=30)  # noqa: E731
CONCRETE = lambda: mat("PolishedConcrete", (0.36, 0.36, 0.35, 1), rough=0.32, coat=0.2, mottle=0.25, bump=0.02, bump_scale=8)  # noqa: E731
CEILING = lambda: mat("CeilingBlack", (0.015, 0.015, 0.017, 1), rough=0.8)  # noqa: E731
HALLWALL = lambda: mat("HallWall", (0.16, 0.16, 0.17, 1), rough=0.7, mottle=0.1)  # noqa: E731
LATEX = lambda c: mat(f"Balloon-{c}", hex_to_linear(c), rough=0.18, coat=0.8)  # noqa: E731


def print_fabric(color):
    return mat(f"Print-{color}", hex_to_linear(color), rough=0.75, bump=0.03, bump_scale=400)


# ---------- 도형 모으기: 재질별로 한 메시에 쌓는다 ----------
class Builder:
    def __init__(self, name):
        self.name = name
        self.parts = {}

    def _bm(self, m):
        if m not in self.parts:
            self.parts[m] = bmesh.new()
        return self.parts[m]

    def box(self, m, size, center, rot_z=0.0):
        mtx = Matrix.Translation(center) @ Matrix.Rotation(rot_z, 4, "Z") @ Matrix.Diagonal((size[0], size[1], size[2], 1))
        bmesh.ops.create_cube(self._bm(m), size=1.0, matrix=mtx)

    def cyl(self, m, r, a, b, segments=10, r2=None):
        a, b = Vector(a), Vector(b)
        d = b - a
        if d.length < 1e-6:
            return
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        bmesh.ops.create_cone(self._bm(m), cap_ends=True, segments=segments, radius1=r, radius2=r if r2 is None else r2,
                              depth=d.length, matrix=Matrix.Translation((a + b) / 2) @ rot)

    def sphere(self, m, r, c, squash=1.0):
        bmesh.ops.create_uvsphere(self._bm(m), u_segments=16, v_segments=10, radius=r,
                                  matrix=Matrix.Translation(c) @ Matrix.Diagonal((1, 1, squash, 1)))

    def build(self, location=(0, 0, 0), rot_z=0.0, bevel=0.004):
        objs = []
        for m, bm in self.parts.items():
            me = bpy.data.meshes.new(f"kit-{self.name}-{m.name}")
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
            bm.to_mesh(me)
            bm.free()
            me.materials.append(m)
            o = bpy.data.objects.new(me.name, me)
            o.location = location
            o.rotation_euler = (0, 0, rot_z)
            bpy.context.scene.collection.objects.link(o)
            if bevel:
                mod = o.modifiers.new("Bevel", "BEVEL")
                mod.width = bevel
                mod.segments = 2
                mod.limit_method = "ANGLE"
                mod.angle_limit = math.radians(40)
            objs.append(o)
        self.parts = {}
        return objs


def booth_xform(place):
    rot = math.radians(place["rotY"])
    return Matrix.Translation(W(place["x"], 0, place["z"])) @ Matrix.Rotation(rot, 4, "Z"), rot


def spot_light(name, src, tgt, energy=60, size_deg=60, color=(1.0, 0.9, 0.78)):
    ld = bpy.data.lights.new(name, "SPOT")
    ld.energy = energy
    ld.spot_size = math.radians(size_deg)
    ld.spot_blend = 0.65
    ld.color = color
    ld.shadow_soft_size = 0.04
    lo = bpy.data.objects.new(name, ld)
    lo.location = src
    lo.rotation_euler = (Vector(tgt) - Vector(src)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(lo)


# ---------- 일반 부스 (친환경 허니콤보드) ----------
def booth_eco(booth, place, zone_color, plant_src):
    w, d, h = BOOTH_STD["w"], BOOTH_STD["d"], BOOTH_STD["h"]
    col = hex_to_linear(zone_color)
    tint = tuple(0.55 * c + 0.45 * 0.32 for c in col[:3]) + (1,)
    carpet = mat(f"BoothCarpet-{zone_color}", tint, rough=1.0, bump=0.3, bump_scale=300)
    printed = print_fabric(zone_color)
    L = W
    b = Builder(f"booth-{booth['id']}")
    zb = -d / 2 + 0.10  # 뒷벽 판 중심 (안쪽 면 = -d/2 + 0.12, 웹 포스터와 맞물림)
    side_depth = d * 0.62

    # 바닥 카펫 (4 cm)
    b.box(carpet, (w, d, 0.04), L(0, 0.02, 0))
    # 허니콤보드 벽 (두께 4 cm)
    b.box(KRAFT(), (w - 0.06, 0.04, 2.92), L(0, 0.04 + 1.46, zb))
    for sx in (-1, 1):
        b.box(KRAFT(), (0.04, side_depth, 2.92), L(sx * (w / 2 - 0.05), 0.04 + 1.46, -d / 2 + 0.08 + side_depth / 2))
    # 뒷벽 아래 인쇄 띠
    b.box(printed, (w - 0.3, 0.004, 0.32), L(0, 0.42, zb + 0.022))
    # 검은 철골 프레임 (각관 30 mm)
    t = 0.03
    corners_back = [(sx * (w / 2 - 0.05), zb) for sx in (-1, 1)]
    side_front = [(sx * (w / 2 - 0.05), -d / 2 + 0.08 + side_depth) for sx in (-1, 1)]
    front = [(sx * (w / 2 - 0.07), d / 2 - 0.07) for sx in (-1, 1)]
    for (x, z) in corners_back + side_front:
        b.box(STEEL(), (t, t, h), L(x, h / 2 + 0.04, z))
    for (x, z) in front:
        b.box(STEEL(), (t, t, h + 0.5), L(x, (h + 0.5) / 2 + 0.04, z))
    for sx in (-1, 1):
        b.box(STEEL(), (t, d - 0.15, t), L(sx * (w / 2 - 0.06), h + 0.04, 0.0))
    b.box(STEEL(), (w - 0.08, t, t), L(0, h + 0.04, zb))
    # 뒤에서 빛나는 패브릭 간판 (웹 간판 판이 앞면에 붙는다)
    b.box(LIGHTBOX(), (w + 0.2, 0.22, 0.66), L(0, h + 0.2, d / 2 - 0.08))
    # 트랙 스포트라이트 3개
    for x in (-1.25, 0, 1.25):
        b.cyl(STEEL(), 0.01, L(x, h + 0.04, d / 2 - 0.3), L(x, h - 0.1, d / 2 - 0.45))
        b.cyl(STEEL(), 0.045, L(x, h - 0.1, d / 2 - 0.45), L(x, h - 0.2, d / 2 - 0.58), segments=14)
    # 데스크: 허니콤보드 몸통 + 인쇄 앞판 + 합판 상판(1.10 m: 사진 인물의 아래 끝을 가린다)
    dz = d / 2 - 0.8
    b.box(KRAFT(), (1.7, 0.6, 1.0), L(0, 0.04 + 0.5, dz))
    b.box(printed, (1.56, 0.004, 0.78), L(0, 0.58, dz + 0.302))
    b.box(PLY(), (1.8, 0.68, 0.04), L(0, 1.08, dz))
    b.box(PAPER(), (0.3, 0.22, 0.02), L(0.25, 1.11, dz))
    b.box(PAPER(), (0.28, 0.2, 0.015), L(0.27, 1.125, dz + 0.02))
    # 종이 책자 꽂이
    bx, bz = -w / 2 + 0.55, d / 2 - 0.55
    b.box(KRAFT(), (0.42, 0.26, 1.1), L(bx, 0.04 + 0.55, bz))
    for i in range(3):
        b.box(printed if i != 1 else PAPER(), (0.3, 0.02, 0.22), L(bx, 0.6 + i * 0.3, bz + 0.12))
    # 합판 선반과 소품
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.25)
        b.box(PLY(), (0.34, 1.2, 0.025), L(x, 1.45, -d / 2 + 0.85))
        b.box(KRAFT(), (0.18, 0.18, 0.18), L(x, 1.55, -d / 2 + 0.5))
        b.box(printed, (0.12, 0.2, 0.26), L(x, 1.59, -d / 2 + 0.85))
        b.box(PAPER(), (0.1, 0.16, 0.22), L(x, 1.57, -d / 2 + 1.15))
    xf, rot = booth_xform(place)
    b.build(location=xf.to_translation(), rot_z=rot)
    if plant_src:
        place_asset(plant_src, xf @ L(w / 2 - 0.5, 0.04, d / 2 - 0.5), 1.15, rot_z=rot)
    for x in (-1.25, 0, 1.25):
        spot_light(f"spot-{booth['id']}", xf @ L(x, h - 0.22, d / 2 - 0.62), xf @ L(x * 0.6, 1.2, -d / 2 + 0.2), energy=70)


# ---------- 장터 (마켓 부스) ----------
def booth_market(booth, place, zone_color, stool_src):
    w, d, h = BOOTH_WIDE["w"], BOOTH_WIDE["d"], BOOTH_WIDE["h"]
    is_meal = booth["id"] == "warm-meal"
    L = W
    b = Builder(f"stall-{booth['id']}")
    # 나무 마루
    b.box(TIMBER(), (w, d, 0.12), L(0, 0.06, 0))
    # 기둥·보 (10 cm 각재)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box(TIMBER(), (0.12, 0.12, h), L(sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1)))
    for sz in (-1, 1):
        b.box(TIMBER(), (w, 0.14, 0.14), L(0, h, sz * (d / 2 - 0.1)))
    # 나무 판자 뒷벽 + 선반 두 단
    for i in range(10):
        b.box(PLY(), (w - 0.25, 0.03, 0.235), L(0, 0.12 + 0.125 + i * 0.245, -d / 2 + 0.07))
    for y in (1.6, 2.2):
        b.box(TIMBER(), (w - 0.3, 0.3, 0.04), L(0, y, -d / 2 + 0.25))
    # 조리대: 판자 앞면 + 두꺼운 상판
    cz = d / 2 - 1.0
    top = 1.155
    b.box(TIMBER(), (w * 0.72, 0.85, 0.95), L(0, 0.12 + 0.475, cz))
    b.box(print_fabric(zone_color), (w * 0.6, 0.005, 0.5), L(0, 0.6, cz + 0.43))
    b.box(PLY(), (w * 0.74, 0.95, 0.07), L(0, 1.12, cz))
    # 철판과 전
    gx = -1.5
    b.box(CAST_IRON(), (1.5, 0.62, 0.05), L(gx, top + 0.025, cz))
    b.box(STAINLESS(), (1.56, 0.68, 0.03), L(gx, top - 0.005, cz))
    for (jx, jz) in ((-0.45, -0.12), (-0.05, 0.13), (0.35, -0.1), (-0.3, 0.17), (0.42, 0.18)):
        b.cyl(JEON(), 0.15, L(gx + jx, top + 0.05, cz + jz), L(gx + jx, top + 0.075, cz + jz), segments=24)
    b.cyl(CERAMIC(), 0.26, L(0, top, cz + 0.15), L(0, top + 0.03, cz + 0.15), segments=32, r2=0.2)
    for i in range(4):
        y = top + 0.035 + i * 0.024
        b.cyl(JEON(), 0.14, L(0.03 * (i % 2), y, cz + 0.15), L(0.03 * (i % 2), y + 0.022, cz + 0.15), segments=24)
    if is_meal:
        b.cyl(STAINLESS(), 0.42, L(1.5, top, cz - 0.05), L(1.5, top + 0.5, cz - 0.05), segments=40, r2=0.4)
        b.cyl(STAINLESS(), 0.43, L(1.5, top + 0.5, cz - 0.05), L(1.5, top + 0.54, cz - 0.05), segments=40)
        b.sphere(STEEL(), 0.05, L(1.5, top + 0.58, cz - 0.05))
        b.box(TIMBER(), (0.9, 0.5, 0.03), L(2.55, top + 0.015, cz + 0.05))
        for i in range(3):
            b.cyl(CERAMIC(), 0.1, L(2.27 + i * 0.28, top + 0.03, cz + 0.05), L(2.27 + i * 0.28, top + 0.12, cz + 0.05), segments=24, r2=0.065)
        for i in range(6):
            b.cyl(CERAMIC(), 0.09, L(-2.6 + i * 0.3, 1.62, -d / 2 + 0.25), L(-2.6 + i * 0.3, 1.7, -d / 2 + 0.25), segments=20, r2=0.06)
        b.cyl(STAINLESS(), 0.24, L(2.4, 1.62, -d / 2 + 0.3), L(2.4, 1.95, -d / 2 + 0.3), segments=32)
    else:
        for (x, s, dz2, c) in ((1.3, 0.34, 0.0, "#e76f51"), (1.75, 0.26, 0.05, "#e9c46a"), (2.3, 0.3, -0.1, "#2a9d8f")):
            b.box(KRAFT(), (s, s, s), L(x, top + s / 2, cz + dz2))
            b.box(print_fabric(c), (s + 0.01, 0.05, s + 0.01), L(x, top + s / 2, cz + dz2))
        b.box(KRAFT(), (0.26, 0.26, 0.26), L(1.32, top + 0.34 + 0.13, cz))
        for i in range(5):
            b.box(KRAFT(), (0.3, 0.25, 0.22), L(-2.6 + i * 0.4, 1.73, -d / 2 + 0.25))
    # 앞마당 나무 상
    for tx in (-2.2, 2.2):
        tz = d / 2 + 1.6
        b.box(TIMBER(), (1.3, 0.8, 0.05), L(tx, 0.47, tz))
        for lx in (-0.55, 0.55):
            for lz in (-0.32, 0.32):
                b.box(TIMBER(), (0.06, 0.06, 0.45), L(tx + lx, 0.22, tz + lz))
    xf, rot = booth_xform(place)
    b.build(location=xf.to_translation(), rot_z=rot)
    if stool_src:
        for tx in (-2.2, 2.2):
            for sx in (-0.9, 0.9):
                place_asset(stool_src, xf @ L(tx + sx, 0.0, d / 2 + 1.6), 0.45, rot_z=rot + (0 if sx < 0 else math.pi))
    # 따뜻한 조명 (전구줄 대신 천막 아래 스포트)
    for x in (-2.5, 0, 2.5):
        spot_light(f"stall-{booth['id']}", xf @ L(x, h - 0.15, d / 2 - 0.4), xf @ L(x * 0.8, 1.0, -d / 2 + 0.5), energy=90, size_deg=80, color=(1.0, 0.82, 0.6))


# ---------- 데스크·스탠드 ----------
def kraft_desk(name, center, rot, size, top_size, plant_src=None, plant_at=None):
    b = Builder(name)
    sx, sz, sy = size
    b.box(KRAFT(), (sx, sz, sy), center + Vector((0, 0, sy / 2)), rot_z=rot)
    tx, tz, ty = top_size
    b.box(PLY(), (tx, tz, ty), center + Vector((0, 0, sy + ty / 2)), rot_z=rot)
    b.build()
    if plant_src and plant_at is not None:
        place_asset(plant_src, plant_at, 0.45, rot_z=rot)


def build_desks(layout, booths, plant_src):
    booth_by_id = {bt["id"]: bt for bt in booths}
    # 환영 데스크
    e = layout["figures"]["entrance"]
    kraft_desk("welcome", W(e["x"], 0, e["z"]), 0.0, (1.5, 0.55, 1.0), (1.62, 0.66, 0.06),
               plant_src, W(e["x"] - 0.6, 1.06, e["z"]))
    for s in layout["figures"]["clergy"]:
        if s.get("desk"):
            kraft_desk(s["id"], W(s["x"], 0, s["z"]), 0.0, (1.4, 0.55, 1.0), (1.52, 0.66, 0.06))
        elif s.get("front") and s.get("booth"):
            bt = booth_by_id[s["booth"]]
            d = (BOOTH_WIDE if bt["size"] == "wide" else BOOTH_STD)["d"]
            xf, rot = booth_xform(layout["booths"][s["booth"]])
            kraft_desk(f"{s['id']}-podium", xf @ W(s.get("offset", 0), 0, d / 2 + 0.85), rot, (0.62, 0.42, 1.0), (0.7, 0.5, 0.05))


# ---------- 입구 게이트 ----------
def truss_column(b, x, z, height, size=0.3):
    hs = size / 2
    for dx in (-hs, hs):
        for dz in (-hs, hs):
            b.cyl(STAINLESS(), 0.024, W(x + dx, 0.0, z + dz), W(x + dx, height, z + dz), segments=8)
    steps = int(height / 0.5)
    for i in range(steps):
        y0, y1 = i * 0.5, (i + 1) * 0.5
        for (ax, az, bx, bz) in ((-hs, -hs, hs, -hs), (hs, hs, -hs, hs), (-hs, -hs, -hs, hs), (hs, hs, hs, -hs)):
            b.cyl(STAINLESS(), 0.009, W(x + ax, y0, z + az), W(x + bx, y1, z + bz), segments=6)


def build_gate():
    b = Builder("gate")
    z = -10.0
    for s in (-1, 1):
        truss_column(b, s * 3.6, z, 5.1, size=0.4)
        b.box(STEEL(), (0.7, 0.7, 0.02), W(s * 3.6, 0.01, z))
        for i, c in enumerate(("#f97316", "#facc15", "#22c55e", "#0ea5e9", "#a855f7")):
            ang = i * 1.3
            b.sphere(LATEX(c), 0.32, W(s * 4.35 + math.cos(ang) * 0.3, 3.7 + (i % 3) * 0.22, z + 0.25 + math.sin(ang) * 0.3), squash=1.15)
        b.cyl(PAPER(), 0.004, W(s * 4.3, 2.2, z + 0.25), W(s * 4.3, 3.5, z + 0.25), segments=4)
    # 패브릭 현수막 상자 (웹 간판 판이 앞뒤에 붙는다)
    b.box(LIGHTBOX(), (8.6, 0.8, 1.4), W(0, 4.4, z))
    b.build()


# ---------- 바닥: 전시회 통로 카펫 (웹의 파스텔 바닥판 대신) ----------
def carpet_mat(name, hexc):
    return mat(f"Carpet-{name}", hex_to_linear(hexc), rough=1.0, bump=0.25, bump_scale=600, mottle=0.08)


def build_floors(layout):
    """통로마다 높이를 조금씩 달리해 겹치는 면이 같은 평면에 놓이지 않게 한다 (Cycles 검은 얼룩 방지)"""
    nodes = layout["nodes"]
    b = Builder("floors")
    aisle = carpet_mat("aisle", "#34373c")
    zs = [n["z"] for n in nodes if n["x"] == 0 and not n.get("booth")]
    zmin = min(zs) - 3
    b.box(aisle, (4.2, 3 - zmin, 0.012), W(0, 0.006, (3 + zmin) / 2))
    rows = {}
    for n in nodes:
        if n.get("booth") or n["x"] == 0:
            continue
        rows.setdefault(n["z"], []).append(n["x"])
    for z, xs in rows.items():
        if len(xs) < 2:
            continue
        x0, x1 = min(xs + [0]) - 3.5, max(xs + [0]) + 3.5
        b.box(aisle, (x1 - x0, 4.2, 0.010), W((x0 + x1) / 2, 0.005, z))
    center = next((n for n in nodes if n["id"] == "n-plaza-center"), None)
    if center:
        b.cyl(carpet_mat("plaza", "#55585d"), 7.2, W(center["x"], 0, center["z"]), W(center["x"], 0.016, center["z"]), segments=72)
        b.cyl(carpet_mat("plaza-ring", "#7c6a58"), 7.4, W(center["x"], 0, center["z"]), W(center["x"], 0.014, center["z"]), segments=72)
    madang = next((n for n in nodes if n["id"] == "n-plaza-madang"), None)
    if madang:
        b.box(carpet_mat("madang", "#6e5a48"), (20, 13, 0.014), W(madang["x"], 0.007, madang["z"] - 5.2))
    b.box(carpet_mat("red", "#5a1215"), (3.2, 8.8, 0.018), W(0, 0.009, -5.4))
    b.build(bevel=0)


# ---------- 전시홀 ----------
def build_hall():
    x0, x1, z0, z1, ch = HALL["x0"], HALL["x1"], HALL["z0"], HALL["z1"], HALL["ceiling"]
    b = Builder("hall")
    b.box(CONCRETE(), (x1 - x0, z1 - z0, 0.02), W((x0 + x1) / 2, -0.01, (z0 + z1) / 2))
    # 바닥 줄눈 (6 m)
    joint = mat("ConcreteJoint", (0.2, 0.2, 0.2, 1), rough=0.6)
    x = x0
    while x <= x1:
        b.box(joint, (0.012, z1 - z0, 0.002), W(x, 0.0005, (z0 + z1) / 2))
        x += 6
    z = z0
    while z <= z1:
        b.box(joint, (x1 - x0, 0.012, 0.002), W((x0 + x1) / 2, 0.0005, z))
        z += 6
    # 벽과 천장
    b.box(HALLWALL(), (x1 - x0, 0.3, ch), W((x0 + x1) / 2, ch / 2, z0))
    b.box(HALLWALL(), (x1 - x0, 0.3, ch), W((x0 + x1) / 2, ch / 2, z1))
    b.box(HALLWALL(), (0.3, z1 - z0, ch), W(x0, ch / 2, (z0 + z1) / 2))
    b.box(HALLWALL(), (0.3, z1 - z0, ch), W(x1, ch / 2, (z0 + z1) / 2))
    b.box(CEILING(), (x1 - x0, z1 - z0, 0.2), W((x0 + x1) / 2, ch, (z0 + z1) / 2))
    # 천장 철골 (9 m 간격 보 + 3 m 간격 도리)
    x = x0 + 4.5
    while x < x1:
        b.box(STEEL(), (0.35, z1 - z0, 0.9), W(x, ch - 0.6, (z0 + z1) / 2))
        x += 9
    z = z0 + 3
    while z < z1:
        b.box(STEEL(), (x1 - x0, 0.12, 0.25), W((x0 + x1) / 2, ch - 1.2, z))
        z += 3
    b.build(bevel=0)
    # 천장 조명: 10 m 간격 고천장등 (보이는 등기구 + 면광원)
    fixture = mat("HighBayLens", (1.0, 0.97, 0.92, 1), rough=0.3, emission=12.0)
    fb = Builder("highbay")
    x = x0 + 6
    while x < x1:
        z = z0 + 6
        while z < z1:
            fb.cyl(STEEL(), 0.32, W(x, ch - 2.1, z), W(x, ch - 1.8, z), segments=20, r2=0.18)
            fb.cyl(fixture, 0.3, W(x, ch - 2.12, z), W(x, ch - 2.1, z), segments=20)
            ld = bpy.data.lights.new("highbay", "AREA")
            ld.shape = "DISK"
            ld.size = 0.6
            ld.energy = 1500
            ld.color = (1.0, 0.96, 0.9)
            lo = bpy.data.objects.new("highbay", ld)
            lo.location = W(x, ch - 2.15, z)
            bpy.context.scene.collection.objects.link(lo)
            z += 10
        x += 10
    fb.build(bevel=0)


def setup_indoor_world(world):
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    for n in list(world.node_tree.nodes):
        if n.type not in ("OUTPUT_WORLD", "BACKGROUND"):
            world.node_tree.nodes.remove(n)
    bg.inputs["Color"].default_value = (0.05, 0.05, 0.055, 1)
    bg.inputs["Strength"].default_value = 0.6


# ---------- 에셋 ----------
_asset_cache = {}


def load_asset(path):
    """glTF 에셋을 한 번 불러와 숨겨 두고 복제해서 쓴다. 바닥 중앙 기준, 높이 1 m로 맞춘 원본을 돌려준다"""
    if path in _asset_cache:
        return _asset_cache[path]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if not new:
        _asset_cache[path] = None
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in new:
        o.select_set(True)
    bpy.context.view_layer.objects.active = new[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bb = [Vector(c) for c in o.bound_box]
    zmin = min(v.z for v in bb)
    height = max(v.z for v in bb) - zmin
    cx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2
    cy = (min(v.y for v in bb) + max(v.y for v in bb)) / 2
    o.data.transform(Matrix.Translation((-cx, -cy, -zmin)))
    o.data.transform(Matrix.Scale(1.0 / max(height, 1e-3), 4))
    o.hide_render = True
    o.hide_set(True)
    _asset_cache[path] = o
    return o


def place_asset(src, location, height, rot_z=0.0):
    o = src.copy()
    o.hide_render = False
    o.hide_set(False)
    o.location = location
    o.rotation_euler = (0, 0, rot_z)
    o.scale = (height, height, height)
    bpy.context.scene.collection.objects.link(o)
    return o


# ---------- 웹 도형 정리 ----------
def delete_faces_by_color(o, pred):
    me = o.data
    col = me.color_attributes.get("Color")
    if not col:
        return 0
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    doomed = [f for f in bm.faces if pred(col.data[me.polygons[f.index].loop_indices[0]].color)]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(me)
    bm.free()
    return len(doomed)


def near(c, ref, tol=0.03):
    return all(abs(c[i] - ref[i]) < tol for i in range(3))


TREE_COLORS = [hex_to_linear(h) for h in ("#7fb069", "#8cbf74", "#6fa35c", "#7a5232")]


def build_all(root, objs, assets_dir, log):
    data = lambda f: json.load(open(os.path.join(root, "public", "data", f), encoding="utf-8"))  # noqa: E731
    booths, zones, layout = data("booths.json"), data("zones.json"), data("layout.json")
    zone_color = {z["id"]: z["color"] for z in zones}

    def asset(rel):
        p = os.path.join(assets_dir, rel) if assets_dir else ""
        return load_asset(p) if p and os.path.exists(p) else None

    plant_small = asset("potted_plant_04/potted_plant_04_1k.gltf")
    plant_big = asset("potted_plant_02/potted_plant_02_1k.gltf")
    stool = asset("folding_wooden_stool/folding_wooden_stool_1k.gltf")
    log(f"에셋: 작은 화분 {bool(plant_small)}, 큰 화분 {bool(plant_big)}, 의자 {bool(stool)}")

    def hide(prefixes):
        n = 0
        for o in objs:
            if o.name.startswith(prefixes):
                o.hide_render = True
                n += 1
        return n

    # 웹의 단순 도형을 숨긴다: 부스 몸통, 입구, 트러스·깃발·전구(실내), 데스크·스탠드, 바깥 바닥
    hide(("surface:booth-", "surface:gate-body:", "surface:overhead-", "glow:", "surface:welcome-desk:", "tex:ground-outer:", "tex:ground-venue:",
          "surface:streets-carpet:", "surface:zone-floors:", "surface:madang-floor:", "surface:plaza-disc:", "surface:gate-carpet:"))
    hide(tuple(f"surface:{s['id']}-podium:" for s in layout["figures"]["clergy"]) + tuple(f"surface:{s['id']}:" for s in layout["figures"]["clergy"] if s.get("desk")))

    build_hall()
    build_floors(layout)
    log("전시홀 완료")
    for bt in booths:
        pl = layout["booths"][bt["id"]]
        if bt["template"] == "standard":
            booth_eco(bt, pl, zone_color[bt["zone"]], plant_small)
        else:
            booth_market(bt, pl, zone_color[bt["zone"]], stool)
    log(f"부스 {len(booths)}개 완료")
    build_desks(layout, booths, plant_small)
    build_gate()
    log("데스크·스탠드·입구 완료")

    # 존 배너 기둥은 검은 철골로
    for o in objs:
        if o.name.startswith("surface:banner-"):
            o.data.materials.clear()
            o.data.materials.append(STEEL())

    # 웹의 화단 상자·원형 받침·벤치는 숨기고, 바닥에 실사 화분만 둔다
    hide(("surface:streets-planters:", "surface:plaza-furniture:"))
    if plant_big:
        zs = [nn["z"] for nn in layout["nodes"] if nn["x"] == 0 and not nn.get("booth")]
        zmin = min(zs) - 3
        z = -14
        while z > zmin + 4:
            if not any(abs(rz - z) < 5 for rz in (-20, -48, -72)):
                for x in (-2.9, 2.9):
                    place_asset(plant_big, W(x, 0, z), 1.6, rot_z=z)
            z -= 9
    center = next(nn for nn in layout["nodes"] if nn["id"] == "n-plaza-center")
    if plant_big:
        for sx, sz in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            place_asset(plant_big, W(center["x"] + sx * 4.6, 0, center["z"] + sz * 4.6), 2.0, rot_z=sx + sz)
