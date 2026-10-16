import * as THREE from "three";
import { BOOTH, COLORS, DECOR } from "../config";
import type { ExpoIndex } from "../data/load";
import type { NavNode } from "../data/types";
import { MeshBuilder, deg, glowMaterial, markBake, vertexColorMaterial } from "./geometry";
import { blobShadowTexture } from "./textures";

// 분위기 연출용 장식. 모두 정점 색으로 합쳐서 몇 개의 드로우콜로 끝낸다 (PRD 8장).

/** 재현 가능한 의사 난수 (새로고침해도 같은 배치) */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 바닥에 까는 부드러운 그림자 모음 → 인스턴스 메시 2개 */
export class ShadowBlobs {
  private circles: THREE.Matrix4[] = [];
  private rects: THREE.Matrix4[] = [];

  add(x: number, z: number, w: number, d: number, rotY = 0, shape: "circle" | "rect" = "circle"): void {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, DECOR.blobY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, rotY, 0, "YXZ")),
      new THREE.Vector3(w, d, 1),
    );
    (shape === "circle" ? this.circles : this.rects).push(m);
  }

  build(scene: THREE.Scene): void {
    for (const [list, shape, opacity] of [
      [this.circles, "circle", 0.32],
      [this.rects, "rect", 0.28],
    ] as const) {
      if (list.length === 0) continue;
      const mat = new THREE.MeshBasicMaterial({
        color: 0x3a2a18,
        alphaMap: blobShadowTexture(shape),
        transparent: true,
        opacity,
        depthWrite: false,
      });
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, list.length);
      mesh.name = "shadow-blobs";
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.renderOrder = 1;
      scene.add(mesh);
    }
  }
}

interface Street {
  z: number;
  minX: number;
  maxX: number;
}

/** 노드 좌표에서 동서 통로를 뽑는다 */
export function streetsOf(nodes: NavNode[]): Street[] {
  const rows = new Map<number, number[]>();
  for (const n of nodes) {
    if (n.booth || n.x === 0) continue;
    rows.set(n.z, [...(rows.get(n.z) ?? []), n.x]);
  }
  // 지점이 둘 이상 늘어선 줄만 통로로 본다 (입구 환영 지점처럼 혼자 있는 지점은 통로가 아니다)
  return [...rows].filter(([, xs]) => xs.length >= 2).map(([z, xs]) => ({ z, minX: Math.min(...xs, 0) - 3.5, maxX: Math.max(...xs, 0) + 3.5 }));
}

/** 통로 위 트러스 + 펜던트 조명 + 삼각 깃발 */
export function addOverhead(scene: THREE.Scene, nodes: NavNode[]): void {
  const frame = new MeshBuilder();
  const flagsSurface = "fabric";
  const flags = new MeshBuilder().use(flagsSurface);
  const bulbs = new MeshBuilder();
  const y = DECOR.trussY;
  const half = DECOR.trussHalfWidth;
  const metal = 0x6b5e52;

  const run = (ax: number, az: number, bx: number, bz: number) => {
    // 진행 방향(a→b)을 따라 양쪽 레일을 깐다
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const px = -uz;
    const pz = ux;
    const rot = Math.atan2(-uz, ux);
    for (const s of [-1, 1]) {
      const ox = px * half * s;
      const oz = pz * half * s;
      frame.box(len, 0.1, 0.1, (ax + bx) / 2 + ox, y, (az + bz) / 2 + oz, metal, rot);
      frame.box(len, 0.06, 0.06, (ax + bx) / 2 + ox, y + 0.45, (az + bz) / 2 + oz, metal, rot);
    }
    const palette = DECOR.flagColors;
    let k = 0;
    for (let t = 0; t < len; t += DECOR.crossEvery) {
      const cx = ax + ux * t;
      const cz = az + uz * t;
      // 가로대
      frame.box(half * 2, 0.08, 0.08, cx, y, cz, metal, rot + Math.PI / 2);
      // 펜던트 조명 (가로대 가운데)
      frame.box(0.02, 0.9, 0.02, cx, y - 0.45, cz, 0x3a3a3a);
      bulbs.sphere(0.16, cx, y - 1.0, cz, COLORS.lantern);
      // 이 칸에 레일을 따라 늘어진 깃발
      const segLen = Math.min(DECOR.crossEvery, len - t);
      const n = Math.max(2, Math.floor(segLen / DECOR.flagSpacing));
      for (const s of [-1, 1]) {
        const ox = px * half * s;
        const oz = pz * half * s;
        for (let i = 0; i < n; i++) {
          const t0 = t + (i / n) * segLen;
          const t1 = t + ((i + 0.8) / n) * segLen;
          const sag = Math.sin((i / n) * Math.PI) * 0.35;
          flags.pennant(ax + ux * t0 + ox, az + uz * t0 + oz, ax + ux * t1 + ox, az + uz * t1 + oz, y - 0.06 - sag, 0.42, palette[k++ % palette.length]);
        }
      }
    }
  };

  for (const st of streetsOf(nodes)) run(st.minX, st.z, st.maxX, st.z);
  const zs = nodes.filter((n) => n.x === 0 && !n.booth).map((n) => n.z);
  run(0, -12, 0, Math.min(...zs) - 2);

  // 트러스 기둥: 통로 양 끝과 교차로 모서리
  const posts: [number, number][] = [];
  for (const st of streetsOf(nodes)) {
    for (const x of [st.minX, st.maxX]) for (const s of [-1, 1]) posts.push([x, st.z + s * half]);
  }
  posts.push([-half, -12], [half, -12]);
  for (const [x, z] of posts) {
    frame.box(0.14, y + 0.5, 0.14, x, (y + 0.5) / 2, z, metal);
    frame.rbox(0.5, 0.12, 0.5, x, 0.06, z, 0x4b4038, 0.03);
  }

  const frameMesh = frame.build(vertexColorMaterial({ roughness: 0.45, metalness: 0.65 }));
  frameMesh.castShadow = true;
  // 깃발은 삼각형 수백 개라 빛 지도에 넣지 않는다 (구운 화면에서는 색만 칠한다)
  const flagMesh = flags.build(vertexColorMaterial({ side: THREE.DoubleSide, roughness: 0.95 }));
  const bulbMesh = bulbs.build(glowMaterial());
  // 실사 렌더(scripts/pano)가 이름으로 골라낸다
  flagMesh.name = "overhead-flags";
  bulbMesh.name = "overhead-bulbs";
  scene.add(markBake(frameMesh, "atlas", "overhead-frame"), flagMesh, bulbMesh);
}

/** 사람 실루엣. 이동 지점과 화살표 자리는 피해서 세운다. */
export function addPeople(scene: THREE.Scene, index: ExpoIndex, blobs: ShadowBlobs): void {
  const rand = rng(20261015);
  const b = new MeshBuilder().use("fabric");
  const nodes = index.data.layout.nodes;
  const shirts = DECOR.shirtColors;
  const skins = DECOR.skinColors;

  // 교역자 안내석·환영 데스크 앞은 비워 둔다 (사람이 가리지 않게)
  const desks = [index.data.layout.figures.entrance, ...index.data.layout.figures.clergy.filter((c) => c.desk)].map((d) => ({ x: d.x ?? 0, z: d.z ?? 0 }));
  const blocked = (x: number, z: number) =>
    nodes.some((n) => Math.hypot(n.x - x, n.z - z) < DECOR.personKeepOut) ||
    desks.some((d) => Math.hypot(d.x - x, d.z - z) < DECOR.deskKeepOut) ||
    // 통로 지점에서 나가는 화살표 자리(3 m 앞)
    nodes.some((n) => !n.booth && Math.abs(n.x - x) < 1.2 && Math.abs(n.z - z) < 3.6 && Math.abs(n.z - z) > 0.01 && n.x !== 0);

  const person = (x: number, z: number, facing: number, child = false) => {
    if (blocked(x, z)) return;
    const s = child ? 0.68 : 0.88 + rand() * 0.2;
    const shirt = shirts[Math.floor(rand() * shirts.length)];
    const skin = skins[Math.floor(rand() * skins.length)];
    const pants = rand() > 0.5 ? 0x3f4a5a : 0x6b5a48;
    b.capsule(0.13 * s, 0.5 * s, x, 0.38 * s, z, pants);
    b.capsule(0.22 * s, 0.42 * s, x, 0.98 * s, z, shirt);
    b.sphere(0.17 * s, x, 1.48 * s, z, skin);
    // 머리카락: 얼굴 반대쪽(뒤통수)으로 살짝 치우친 반구 느낌
    b.sphere(0.165 * s, x + Math.sin(facing) * 0.03, 1.53 * s, z + Math.cos(facing) * 0.03, rand() > 0.3 ? 0x2b2118 : 0x7a5a3a);
    blobs.add(x, z, 0.9 * s, 0.9 * s);
  };

  // 부스 앞 손님: 부스 양쪽 모서리 앞에 서서 부스를 본다
  // 부스 앞에 교역자가 서는 부스는 손님을 세우지 않는다
  const frontBooths = new Set(index.data.layout.figures.clergy.filter((c) => c.front && c.booth).map((c) => c.booth));
  for (const booth of index.data.booths) {
    const p = index.data.layout.booths[booth.id];
    if (!p || booth.template !== "standard" || frontBooths.has(booth.id)) continue;
    const rot = deg(p.rotY);
    const fx = Math.sin(rot);
    const fz = Math.cos(rot);
    const rx = Math.cos(rot);
    const rz = -Math.sin(rot);
    const roll = rand();
    const count = roll < DECOR.visitorNone ? 0 : roll < DECOR.visitorNone + DECOR.visitorOne ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const side = i === 0 ? (rand() < 0.5 ? -1 : 1) : -1 * (rand() < 0.5 ? -1 : 1);
      const lateral = side * (1.6 + rand() * 0.4);
      const fwd = BOOTH.standard.d / 2 + 0.6 + rand() * 0.6;
      person(p.x + fx * fwd + rx * lateral, p.z + fz * fwd + rz * lateral, rot + Math.PI, rand() < 0.15);
    }
  }

  // 통로를 오가는 사람들
  for (const st of streetsOf(nodes)) {
    for (let x = st.minX + 3; x < st.maxX - 3; x += DECOR.walkerGap + rand() * DECOR.walkerGap) {
      const side = rand() < 0.5 ? -1 : 1;
      person(x, st.z + side * (1.7 + rand() * 0.3), rand() * Math.PI * 2, rand() < 0.12);
    }
  }
  // 대로
  for (let z = -16; z > -76; z -= DECOR.walkerGap + 2 + rand() * DECOR.walkerGap) person((rand() < 0.5 ? -1 : 1) * (1.6 + rand() * 0.4), z, rand() * Math.PI * 2);

  // 나눔마당 상에 둘러앉은 사람들
  for (const id of ["joy-sharing", "warm-meal"]) {
    const p = index.data.layout.booths[id];
    if (!p) continue;
    const tz = p.z + BOOTH.wide.d / 2 + 1.6;
    for (const tx of [-2.2, 2.2]) {
      if (rand() < 0.5) person(p.x + tx - 0.9, tz + 0.05, deg(90), rand() < 0.3);
      if (rand() < 0.4) person(p.x + tx + 0.9, tz - 0.05, deg(-90));
    }
  }

  scene.add(markBake(b.build(vertexColorMaterial({ roughness: 0.9 })), "atlas", "people"));
}

/** 중앙 광장: 네 모서리 나무 화단 + 벤치 */
export function addPlazaFurniture(scene: THREE.Scene, cx: number, cz: number, blobs: ShadowBlobs): void {
  const b = new MeshBuilder();
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + sx * 4.6;
    const z = cz + sz * 4.6;
    b.use("stone").cylinder(1.1, 1.2, 0.55, x, 0.28, z, 0xd9c7a8, 20);
    b.use("paint");
    b.cylinder(1.0, 1.0, 0.04, x, 0.56, z, 0x6d8b4f, 20);
    b.cylinder(0.12, 0.16, 1.8, x, 1.4, z, 0x7a5232, 8);
    b.sphere(1.0, x, 2.7, z, 0x7fb069);
    b.sphere(0.75, x + 0.55, 2.35, z + 0.2, 0x8cbf74);
    b.sphere(0.7, x - 0.45, 2.45, z - 0.35, 0x6fa35c);
    blobs.add(x, z, 3.4, 3.4);
    // 화단 바깥쪽을 보는 벤치
    const rot = Math.atan2(sx, sz);
    const bx = x + Math.sin(rot) * 1.75;
    const bz = z + Math.cos(rot) * 1.75;
    b.use("wood").rbox(1.5, 0.08, 0.45, bx, 0.45, bz, COLORS.wood, 0.03, rot + Math.PI / 2);
    b.rbox(1.5, 0.35, 0.06, bx - Math.sin(rot) * 0.22, 0.68, bz - Math.cos(rot) * 0.22, COLORS.wood, 0.02, rot + Math.PI / 2);
    b.use("paint");
    for (const s of [-0.6, 0.6]) {
      const lx = bx + Math.cos(rot) * s;
      const lz = bz - Math.sin(rot) * s;
      b.box(0.08, 0.45, 0.4, lx, 0.22, lz, 0x4b4038, rot + Math.PI / 2);
    }
  }
  scene.add(markBake(b.build(vertexColorMaterial()), "atlas", "plaza-furniture"));
}

/** 입구 게이트 기둥에 매단 풍선 다발 */
export function addBalloons(b: MeshBuilder, x: number, y: number, z: number): void {
  const colors = DECOR.flagColors;
  const offsets: [number, number, number][] = [[0, 0.4, 0], [0.35, 0.15, 0.1], [-0.33, 0.2, -0.05], [0.12, -0.1, 0.32], [-0.1, 0.05, -0.34]];
  offsets.forEach(([ox, oy, oz], i) => {
    b.add(new THREE.SphereGeometry(0.32, 14, 10).scale(1, 1.15, 1), colors[(i * 3) % colors.length], new THREE.Matrix4().makeTranslation(x + ox, y + oy, z + oz));
  });
}
