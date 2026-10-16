"""실사 시안: 360° 파노라마 렌더 (Blender 백그라운드, scripts/pano/run.ts가 부른다)

입력: bake/render.glb (브라우저에서 __expo.exportRender()로 내보낸 장면), 렌더 지점 목록(JSON)
출력: bake/pano/{id}.png (등장방형 360° 사진)

사용: blender -b --factory-startup --python scripts/pano/render.py -- <root> <지점JSON> <가로px> <샘플수>
지점JSON: [{"id": "welcome", "x": -0.9, "z": -5.6}, ...]  (웹 좌표, 눈높이 1.6 m)
"""

import json
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1 :]
ROOT, SPOTS, WIDTH, SAMPLES = args[0], json.loads(args[1]), int(args[2]), int(args[3])
EYE = 1.6
ASSETS = os.environ.get("RENDER_ASSETS_DIR", "")
OUT = os.path.join(ROOT, "bake", "pano")
os.makedirs(OUT, exist_ok=True)


def log(msg):
    print(f"[pano] {msg}", flush=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "bake", "render.glb"), merge_vertices=False)
scene = bpy.context.scene
objs = [o for o in scene.objects if o.type == "MESH"]
kind = lambda o: o.name.split(":", 1)[0]  # noqa: E731
log(f"메시 {len(objs)}개")

# ---------- 렌더 설정 ----------
scene.render.engine = "CYCLES"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.render.resolution_x = WIDTH
scene.render.resolution_y = WIDTH // 2
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
for vt, look in (("AgX", "AgX - Medium High Contrast"), ("Filmic", "Medium High Contrast")):
    try:
        scene.view_settings.view_transform = vt
        try:
            scene.view_settings.look = look
        except TypeError:
            pass
        break
    except TypeError:
        continue
scene.view_settings.exposure = -1.0
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = os.environ.get("BAKE_DEVICE", "CUDA")
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != "CPU"
    scene.cycles.device = "GPU"
except Exception as e:  # noqa: BLE001
    log(f"GPU 설정 실패, CPU로 렌더: {e}")

# ---------- 하늘: 실제 대기 산란 하늘 + 해 (웹 햇빛 방향과 맞춘다) ----------
world = bpy.data.worlds.new("Sky")
scene.world = world
world.use_nodes = True
nt = world.node_tree
sky = nt.nodes.new("ShaderNodeTexSky")
sky.sky_type = "MULTIPLE_SCATTERING"
sky.sun_elevation = math.radians(38)
# 해를 크게(옅은 구름 낀 느낌) 해서 트러스 레일 같은 얇은 물체의 그림자가 칼같이 까맣게 떨어지지 않게 한다
sky.sun_size = math.radians(6)
sky.sun_intensity = 0.7
# 웹 햇빛은 (-35,45,25)에서 (0,0,-40)을 비춘다 → 해는 웹 (-35, -65) 쪽 하늘 = Blender (x, y) = (-35, 65) 방향
# sun_rotation은 +X축에서 반시계 방향 각도
sky.sun_rotation = math.atan2(65, -35) % (2 * math.pi)
bg = nt.nodes["Background"]
bg.inputs["Strength"].default_value = 0.4
nt.links.new(sky.outputs["Color"], bg.inputs["Color"])


# ---------- 재질 ----------
def surface_material():
    """정점 색 = 바탕색, 정점 알파 = 재질 종류(칠한 벽0·나무1·천2·돌3) → 절차적 질감"""
    m = bpy.data.materials.new("Surface")
    m.use_nodes = True
    t = m.node_tree
    N, L = t.nodes, t.links
    bsdf = N["Principled BSDF"]
    col = N.new("ShaderNodeVertexColor")
    col.layer_name = "Color"
    coord = N.new("ShaderNodeTexCoord")
    code = N.new("ShaderNodeMath")
    code.operation = "MULTIPLY"
    code.inputs[1].default_value = 4.0
    L.new(col.outputs["Alpha"], code.inputs[0])
    flo = N.new("ShaderNodeMath")
    flo.operation = "FLOOR"
    L.new(code.outputs[0], flo.inputs[0])

    def is_code(k):
        c = N.new("ShaderNodeMath")
        c.operation = "COMPARE"
        c.inputs[1].default_value = k
        c.inputs[2].default_value = 0.1
        L.new(flo.outputs[0], c.inputs[0])
        return c.outputs[0]

    # 질감 무늬 (오브젝트 좌표, m 단위)
    noise = N.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.0
    noise.inputs["Detail"].default_value = 6.0
    L.new(coord.outputs["Object"], noise.inputs["Vector"])
    fine = N.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 60.0
    L.new(coord.outputs["Object"], fine.inputs["Vector"])
    wave = N.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 2.5
    wave.inputs["Distortion"].default_value = 6.0
    wave.inputs["Detail"].default_value = 4.0
    L.new(coord.outputs["Object"], wave.inputs["Vector"])

    def lerp(a, b, f):
        mix = N.new("ShaderNodeMix")
        mix.data_type = "FLOAT"
        L.new(f, mix.inputs["Factor"])
        if isinstance(a, float):
            mix.inputs["A"].default_value = a
        else:
            L.new(a, mix.inputs["A"])
        if isinstance(b, float):
            mix.inputs["B"].default_value = b
        else:
            L.new(b, mix.inputs["B"])
        return mix.outputs["Result"]

    def remap(sock, lo, hi):
        r = N.new("ShaderNodeMapRange")
        r.inputs["To Min"].default_value = lo
        r.inputs["To Max"].default_value = hi
        L.new(sock, r.inputs["Value"])
        return r.outputs["Result"]

    # 재질별 밝기 변화와 거칠기
    v_paint = remap(noise.outputs["Fac"], 0.95, 1.03)
    v_wood = remap(wave.outputs["Fac"], 0.72, 1.06)
    v_fabric = remap(fine.outputs["Fac"], 0.86, 1.04)
    v_stone = remap(noise.outputs["Fac"], 0.85, 1.08)
    shade = lerp(lerp(lerp(v_paint, v_wood, is_code(1)), v_fabric, is_code(2)), v_stone, is_code(3))
    rough = lerp(lerp(lerp(0.5, 0.42, is_code(1)), 0.92, is_code(2)), 0.7, is_code(3))
    tint = N.new("ShaderNodeMix")
    tint.data_type = "RGBA"
    tint.blend_type = "MULTIPLY"
    tint.inputs["Factor"].default_value = 1.0
    L.new(col.outputs["Color"], tint.inputs["A"])
    L.new(shade, tint.inputs["B"])
    L.new(tint.outputs["Result"], bsdf.inputs["Base Color"])
    L.new(rough, bsdf.inputs["Roughness"])
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    L.new(lerp(fine.outputs["Fac"], wave.outputs["Fac"], is_code(1)), bump.inputs["Height"])
    L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def glow_material():
    m = bpy.data.materials.new("Glow")
    m.use_nodes = True
    t = m.node_tree
    em = t.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 0.82, 0.5, 1)
    em.inputs["Strength"].default_value = 8.0
    t.links.new(em.outputs[0], t.nodes["Material Output"].inputs["Surface"])
    t.nodes.remove(t.nodes["Principled BSDF"])
    return m


surf, glow = surface_material(), glow_material()
# 바닥재용: 요철(범프)을 빼야 얇은 판에서 음영이 깨지지 않는다
surf_flat = surf.copy()
surf_flat.name = "SurfaceFlat"
for link in list(surf_flat.node_tree.links):
    if link.to_socket.name == "Normal" and link.to_node.type == "BSDF_PRINCIPLED":
        surf_flat.node_tree.links.remove(link)
FLAT_NAMES = ("streets-carpet", "zone-floors", "madang-floor", "plaza-disc", "gate-carpet", "ground-venue")
for o in objs:
    k = kind(o)
    if k == "surface":
        o.data.materials.clear()
        o.data.materials.append(surf_flat if any(f in o.name for f in FLAT_NAMES) else surf)
    elif k == "glow":
        o.data.materials.clear()
        o.data.materials.append(glow)
    else:
        # 질감 있는 판(간판·포스터·천막·바닥·사진): 가져온 재질을 쓰되 무광에 가깝게
        for m in o.data.materials:
            b = m.node_tree.nodes.get("Principled BSDF") if m and m.use_nodes else None
            if b:
                b.inputs["Roughness"].default_value = 0.75 if k != "billboard" else 1.0
                if "Specular IOR Level" in b.inputs and k == "billboard":
                    b.inputs["Specular IOR Level"].default_value = 0.0

# ---------- 실사 키트: 부스·트러스·화분·의자 (scripts/pano/kit.py) ----------
kit.build_all(ROOT, objs, ASSETS, log)
# 실내 전시홀: 하늘 대신 천장 조명과 부스 조명으로 비춘다
kit.setup_indoor_world(world)
scene.view_settings.exposure = float(os.environ.get("PANO_EXPOSURE", "-0.7"))

# ---------- 모양 다듬기: 겹친 꼭짓점 합치기 → 모서리 둥글게 → 부드러운 음영 ----------
# 두께 몇 cm짜리 바닥재는 점을 합치거나 둥글리거나 부드럽게 칠하면 음영이 깨져 검게 나오므로 그대로 둔다
FLAT = ("streets-carpet", "zone-floors", "madang-floor", "plaza-disc", "gate-carpet", "ground-venue")
surface_objs = [o for o in objs if kind(o) == "surface" and not any(f in o.name for f in FLAT)]

bpy.ops.object.select_all(action="DESELECT")
for o in surface_objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = surface_objs[0]
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.object.mode_set(mode="OBJECT")
for o in surface_objs:
    bev = o.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.01
    bev.segments = 2
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(35)
    bev.harden_normals = False
try:
    bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
except Exception as e:  # noqa: BLE001
    log(f"자동 부드러운 음영 실패(무시): {e}")
log("모양 다듬기 완료")

# ---------- 카메라와 렌더 ----------
cam_data = bpy.data.cameras.new("Pano")
cam_data.type = "PANO"
cam_data.panorama_type = "EQUIRECTANGULAR"
cam = bpy.data.objects.new("Pano", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
billboards = [o for o in objs if kind(o) == "billboard"]

for spot in SPOTS:
    bx, by = spot["x"], -spot["z"]
    cam.location = (bx, by, EYE)
    # 화면 가운데 = 웹 북쪽(-z) = Blender +Y
    cam.rotation_euler = (math.radians(90), 0, 0)
    # 사진 인물은 이 지점을 바라보게 돌린다 (평면 앞면이 Blender -Y)
    for o in billboards:
        dx, dy = bx - o.location.x, by - o.location.y
        o.rotation_mode = "XYZ"
        o.rotation_euler = (0, 0, math.atan2(dx, -dy))
    scene.render.filepath = os.path.join(OUT, f"{spot['id']}.png")
    log(f"{spot['id']} 렌더 중... ({WIDTH}x{WIDTH // 2}, 샘플 {SAMPLES})")
    bpy.ops.render.render(write_still=True)
    log(f"{spot['id']} 완료")
log("끝")
