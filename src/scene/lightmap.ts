import * as THREE from "three";
import { BAKE, LIGHT } from "../config";
import type { BoothObject } from "./boothFactory";
import { bakedSurfaceMaterial } from "./geometry";

// 구운 빛 지도 입히기 (PRD 7.4). public/lightmaps/가 있으면 실시간 조명을 끄고 빛 지도로만 그린다.
// - flat(바닥재): 위에서 내려다본 좌표로 바닥 빛 지도를 쓴다
// - atlas(서 있는 것): Blender가 펼친 좌표(atlas-uv.bin)로 아틀라스 빛 지도를 쓴다
// 빛 지도가 없거나 맞지 않으면 실시간 조명 화면을 그대로 둔다.

interface Manifest {
  scale: { ground: number; atlas: number };
  ground: { x0: number; x1: number; z0: number; z1: number };
  atlas: Record<string, { offset: number; count: number }>;
  files: { ground: { full: string; half: string }; atlas: { full: string; half: string } };
  uv: string;
}

const base = import.meta.env.BASE_URL;

function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      base + url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.channel = 1;
        t.anisotropy = 4;
        resolve(t);
      },
      undefined,
      reject,
    );
  });
}

/** 빛 지도를 입혔으면 true */
export async function applyLightmaps(scene: THREE.Scene, booths: Map<string, BoothObject>, lowPower: boolean): Promise<boolean> {
  // 다시 구울 장면을 내보낼 때는 주소에 ?nobake를 붙여 굽기 전 모습으로 연다
  if (new URLSearchParams(location.search).has("nobake")) return false;
  let manifest: Manifest;
  try {
    const res = await fetch(`${base}lightmaps/manifest.json`);
    if (!res.ok) return false;
    manifest = (await res.json()) as Manifest;
  } catch {
    return false;
  }
  const g = manifest.ground;
  if (g.x0 !== BAKE.ground.x0 || g.x1 !== BAKE.ground.x1 || g.z0 !== BAKE.ground.z0 || g.z1 !== BAKE.ground.z1) {
    console.warn("빛 지도의 바닥 영역이 config.ts BAKE.ground와 다릅니다. 다시 구워 주세요.");
    return false;
  }

  const variant = lowPower ? "half" : "full";
  const [groundMap, atlasMap, uvBuf] = await Promise.all([
    loadTexture(manifest.files.ground[variant]),
    loadTexture(manifest.files.atlas[variant]),
    fetch(base + manifest.uv).then((r) => r.arrayBuffer()),
  ]);
  const uvAll = new Uint16Array(uvBuf);

  scene.updateMatrixWorld(true);
  const W = g.x1 - g.x0;
  const D = g.z1 - g.z0;
  const v = new THREE.Vector3();
  const converted = new Map<THREE.Material, THREE.Material>();
  let skipped = 0;

  const bakedMaterial = (src: THREE.Material, lightMap: THREE.Texture, scale: number): THREE.Material => {
    const key = converted.get(src);
    if (key && (key as THREE.MeshBasicMaterial).lightMap === lightMap) return key;
    const s = src as THREE.MeshStandardMaterial;
    const opts: THREE.MeshBasicMaterialParameters = {
      side: s.side,
      lightMap,
      // MeshBasic은 빛 지도 × 강도 ÷ π를 쓰므로 π를 곱해 Blender 값 그대로 맞춘다
      lightMapIntensity: scale * Math.PI * LIGHT.bakedExposure,
    };
    const m = s.userData.surface
      ? bakedSurfaceMaterial(opts)
      : new THREE.MeshBasicMaterial({ ...opts, map: s.map, vertexColors: s.vertexColors });
    converted.set(src, m);
    return m;
  };

  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.bake) meshes.push(m);
  });

  for (const mesh of meshes) {
    const kind = mesh.userData.bake as "flat" | "atlas";
    const name = mesh.userData.bakeName as string;
    if (kind === "flat") {
      const pos = mesh.geometry.getAttribute("position");
      const uv1 = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        uv1[i * 2] = (v.x - g.x0) / W;
        uv1[i * 2 + 1] = (g.z1 - v.z) / D;
      }
      mesh.geometry.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
      mesh.material = bakedMaterial(mesh.material as THREE.Material, groundMap, manifest.scale.ground);
    } else {
      const entry = manifest.atlas[name];
      // 내보낼 때와 같은 꼭짓점 순서(인덱스 없는 형태)로 맞춘다
      if (mesh.geometry.index) mesh.geometry = mesh.geometry.toNonIndexed();
      const count = mesh.geometry.getAttribute("position").count;
      if (!entry || entry.count !== count) {
        skipped++;
        continue;
      }
      const uv1 = new Float32Array(count * 2);
      for (let i = 0; i < count * 2; i++) uv1[i] = uvAll[entry.offset * 2 + i] / 65535;
      mesh.geometry.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
      mesh.material = bakedMaterial(mesh.material as THREE.Material, atlasMap, manifest.scale.atlas);
    }
  }
  if (skipped) console.warn(`빛 지도와 맞지 않는 메시 ${skipped}개는 굽기 전 모습으로 둡니다. 장면이 바뀌었다면 다시 구워 주세요.`);

  // 굽지 않은 것들(간판, 깃발, 바깥 바닥 등)도 조명 없이 그리고, 실시간 조명과 그림자 판은 치운다
  const lights: THREE.Light[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Light).isLight) lights.push(o as THREE.Light);
    if (o.name === "shadow-blobs") o.visible = false;
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.bake) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (!mat?.isMeshStandardMaterial) return;
    const basic = mat.userData.surface
      ? bakedSurfaceMaterial({ side: mat.side })
      : new THREE.MeshBasicMaterial({ map: mat.map, vertexColors: mat.vertexColors, side: mat.side, transparent: mat.transparent });
    basic.color.setScalar(m.userData.ground ? LIGHT.unbakedGround : LIGHT.unbakedBrightness);
    m.material = basic;
  });
  for (const l of lights) l.removeFromParent();
  scene.environment = null;

  // 마우스를 올린 부스는 살짝 밝게 (구운 재질은 발광이 없으므로 색을 올린다)
  for (const obj of booths.values()) {
    const mats = new Set<THREE.MeshBasicMaterial>();
    obj.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
        // 부스끼리 재질을 같이 쓰면 한 부스만 밝힐 수 없으므로 부스마다 복제한다
        const own = (m.material as THREE.MeshBasicMaterial).clone();
        own.onBeforeCompile = (m.material as THREE.Material).onBeforeCompile;
        own.customProgramCacheKey = (m.material as THREE.Material).customProgramCacheKey;
        m.material = own;
        mats.add(own);
      }
    });
    const base = new Map([...mats].map((m) => [m, m.color.r]));
    obj.setHover = (on) => mats.forEach((m) => m.color.setScalar((base.get(m) ?? 1) * (on ? 1.15 : 1)));
  }
  return true;
}
