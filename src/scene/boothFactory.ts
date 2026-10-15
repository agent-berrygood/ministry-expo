import * as THREE from "three";
import { BOOTH, COLORS, STEAM } from "../config";
import type { Booth, BoothPlacement, BoothProp, Zone } from "../data/types";
import { MeshBuilder, deg, glowMaterial, markBake, texturedPlane, vertexColorMaterial } from "./geometry";
import { posterTexture, shade, signTexture, softDotTexture, stripeTexture, tint, woodSignTexture } from "./textures";

// 부스 로컬 좌표: 원점이 바닥 중앙, 정면이 +z (PRD 3.3, 4.2)

export interface BoothObject {
  id: string;
  group: THREE.Group;
  pickables: THREE.Object3D[];
  setHover(on: boolean): void;
  /** 움직이는 것이 있어 다시 그려야 하면 true */
  update?(dt: number, camera: THREE.Vector3): boolean;
}

const PROP_ICON: Record<BoothProp, string> = {
  none: "⛪",
  music: "🎵",
  globe: "🌏",
  book: "📖",
  heart: "💛",
  cross: "✝️",
  meal: "🍚",
  car: "🚐",
  pray: "🙏",
  gift: "🎁",
};

export function createBooth(booth: Booth, zone: Zone, place: BoothPlacement): BoothObject {
  const obj = booth.template === "stall" ? createStall(booth, zone) : createStandard(booth, zone);
  obj.group.position.set(place.x, 0, place.z);
  obj.group.rotation.y = deg(place.rotY);
  obj.group.name = `booth:${booth.id}`;
  for (const p of obj.pickables) p.userData.boothId = booth.id;
  return obj;
}

function hoverable(mats: THREE.MeshStandardMaterial[]) {
  return (on: boolean) => {
    for (const m of mats) m.emissive.setHex(on ? 0x2a2418 : 0x000000);
  };
}

function createStandard(booth: Booth, zone: Zone): BoothObject {
  const { w, d, h } = BOOTH.standard;
  const t = BOOTH.wallThickness;
  const group = new THREE.Group();
  const zoneColor = new THREE.Color(zone.color);
  const b = new MeshBuilder();

  const deep = shade(zone.color, -0.12);
  // 바닥: 나무 단상 + 존 색 러그
  b.use("wood").rbox(w, 0.12, d, 0, 0.06, 0, 0xcaa47c, 0.04);
  b.use("fabric").box(w - 0.7, 0.01, d - 0.8, 0, 0.125, 0.05, tint(zone.color, 0xffffff, 0.7));
  // 벽
  b.use("paint").box(w, h, t, 0, h / 2, -d / 2 + t / 2, COLORS.wall);
  b.box(w, 0.12, t + 0.04, 0, h - 0.06, -d / 2 + t / 2, zoneColor);
  for (const sx of [-1, 1]) {
    b.rbox(t, h, d * 0.62, sx * (w / 2 - t / 2), h / 2, -d / 2 + d * 0.31, COLORS.wall, 0.04);
    b.rbox(0.14, h + 0.3, 0.14, sx * (w / 2 - 0.07), (h + 0.3) / 2, d / 2 - 0.07, deep, 0.05);
    // 옆 벽 선반과 소품
    const sxIn = sx * (w / 2 - t - 0.17);
    b.use("wood").box(0.34, 0.04, 1.2, sxIn, 1.45, -d / 2 + 0.85, COLORS.wood);
    b.use("paint");
    b.rbox(0.18, 0.24, 0.18, sxIn, 1.59, -d / 2 + 0.5, shade(zone.color, 0.12), 0.03);
    b.rbox(0.14, 0.32, 0.22, sxIn, 1.63, -d / 2 + 0.85, 0xfff1c9, 0.02);
    b.use("stone").cylinder(0.08, 0.06, 0.16, sxIn, 1.55, -d / 2 + 1.2, 0xc9b79c, 8);
    b.use("paint");
    b.sphere(0.12, sxIn, 1.7, -d / 2 + 1.2, 0x6aa84f);
  }
  // 간판 받침 (둥근 헤더)
  b.rbox(w + 0.2, 0.66, 0.22, 0, h + 0.2, d / 2 - 0.08, zoneColor, 0.1);
  b.box(w - 2 * t, 0.22, 0.02, 0, 0.34, -d / 2 + t + 0.01, zoneColor);
  // 안내 데스크
  b.rbox(1.7, 0.94, 0.6, 0, 0.12 + 0.47, d / 2 - 0.8, zoneColor, 0.08);
  b.rbox(1.8, 0.06, 0.68, 0, 1.08, d / 2 - 0.8, COLORS.wall, 0.03);
  b.box(1.5, 0.12, 0.02, 0, 0.75, d / 2 - 0.49, COLORS.wall);
  // 안내 책자 꽂이
  const bx = -w / 2 + 0.55;
  const bz = d / 2 - 0.55;
  b.use("wood").rbox(0.42, 1.1, 0.24, bx, 0.12 + 0.55, bz, COLORS.woodDark, 0.03);
  b.use("paint");
  for (let i = 0; i < 3; i++) b.box(0.32, 0.22, 0.02, bx, 0.55 + i * 0.3, bz + 0.13, [zone.color, 0xffffff, shade(zone.color, 0.2)][i]);
  // 화분
  const px = w / 2 - 0.5;
  b.use("stone").rbox(0.42, 0.45, 0.42, px, 0.12 + 0.22, d / 2 - 0.5, 0xd9c7a8, 0.06);
  b.use("paint");
  b.sphere(0.34, px, 0.86, d / 2 - 0.5, 0x6aa84f);
  b.sphere(0.24, px + 0.15, 1.05, d / 2 - 0.42, 0x7fb069);
  // 입구 매트
  // 존 바닥(윗면 0.0135 m)보다 높게 깔아야 굽기에서 가려진 면으로 계산되지 않는다
  b.use("fabric").box(1.6, 0.012, 0.6, 0, 0.024, d / 2 + 0.45, deep);
  b.use("paint");
  addPropModel(b, booth.prop, zone.color, d);

  const bodyMat = vertexColorMaterial();
  const body = markBake(b.build(bodyMat), "atlas", `booth-${booth.id}`);
  group.add(body);

  const sign = texturedPlane(signTexture(booth.name, zone.color), w * 0.95, 0.52);
  sign.position.set(0, h + 0.2, d / 2 + 0.04);
  group.add(sign);

  const poster = texturedPlane(posterTexture(booth.name, PROP_ICON[booth.prop], zone.color, booth.audience || zone.name), 2.0, 1.5);
  // 오른쪽 데스크 뒤에 담당자가 서므로 포스터는 왼쪽 위로 비킨다 (PRD 4.8)
  poster.position.set(-0.4, 2.1, -d / 2 + t + 0.012);
  group.add(poster);

  return {
    id: booth.id,
    group,
    pickables: [body, sign, poster],
    setHover: hoverable([bodyMat, sign.material as THREE.MeshStandardMaterial, poster.material as THREE.MeshStandardMaterial]),
  };
}

/** 데스크 위 작은 소품 (아이콘을 입체로 살짝 보여 주는 정도) */
function addPropModel(b: MeshBuilder, prop: BoothProp, color: string, d: number) {
  const y = 1.11;
  const z = d / 2 - 0.8;
  // 데스크 양쪽 뒤에 교역자(왼쪽)·부장(오른쪽)이 서므로 소품은 가운데에 둔다
  const PX = 0.15;
  switch (prop) {
    case "book":
      b.box(0.36, 0.06, 0.26, PX, y + 0.03, z, 0xe85d5d);
      b.box(0.34, 0.06, 0.25, PX, y + 0.09, z, 0x4a90d9);
      b.box(0.32, 0.06, 0.24, PX, y + 0.15, z, 0xf2c14e);
      break;
    case "globe":
      b.cylinder(0.04, 0.1, 0.12, PX, y + 0.06, z, 0x8b6b4a);
      b.sphere(0.17, PX, y + 0.3, z, 0x3d9be9);
      break;
    case "music":
      b.box(0.3, 0.02, 0.22, PX, y + 0.01, z, 0xffffff);
      b.cylinder(0.015, 0.015, 0.5, PX + 0.25, y + 0.25, z, 0x333333, 6);
      b.box(0.34, 0.24, 0.02, PX + 0.25, y + 0.5, z, 0x333333);
      break;
    case "gift":
      b.box(0.3, 0.24, 0.3, PX, y + 0.12, z, color);
      b.box(0.31, 0.25, 0.06, PX, y + 0.12, z, 0xffffff);
      break;
    case "car":
      b.box(0.42, 0.14, 0.2, PX, y + 0.1, z, color);
      b.box(0.26, 0.1, 0.18, PX - 0.03, y + 0.21, z, 0xdde8f0);
      break;
    case "heart":
    case "pray":
    case "cross":
      b.cylinder(0.08, 0.08, 0.16, PX, y + 0.08, z, 0xfff1c9);
      b.sphere(0.04, PX, y + 0.2, z, 0xffc94d);
      break;
    case "meal":
      b.cylinder(0.14, 0.1, 0.1, PX, y + 0.05, z, 0xffffff);
      break;
    case "none":
      break;
  }
}

function createStall(booth: Booth, zone: Zone): BoothObject {
  const { w, d, h } = BOOTH.wide;
  const group = new THREE.Group();
  const b = new MeshBuilder();
  const wood = COLORS.wood;
  const woodDark = COLORS.woodDark;
  const isMeal = booth.id === "warm-meal";

  // 마루, 뒷벽, 기둥
  b.use("wood").box(w, 0.14, d, 0, 0.07, 0, 0xd8b88f);
  b.box(w, 2.5, 0.14, 0, 1.25 + 0.14, -d / 2 + 0.07, 0xf3e3c7);
  b.box(w, 0.12, 0.3, 0, 1.6, -d / 2 + 0.25, wood);
  b.box(w, 0.12, 0.3, 0, 2.2, -d / 2 + 0.25, wood);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.box(0.16, h, 0.16, sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1), woodDark);
  }
  b.box(w, 0.18, 0.18, 0, h, d / 2 - 0.1, woodDark);
  b.box(w, 0.18, 0.18, 0, h, -d / 2 + 0.1, woodDark);

  // 조리대
  const cz = d / 2 - 1.0;
  b.use("paint").box(w * 0.72, 0.95, 0.85, 0, 0.14 + 0.475, cz, shade(zone.color, -0.05));
  b.use("wood");
  b.box(w * 0.74, 0.07, 0.95, 0, 1.12, cz, wood);
  const top = 1.155;

  // 철판과 전
  b.use("paint");
  const gx = -1.5;
  b.box(1.5, 0.06, 0.62, gx, top + 0.03, cz, 0x2f2f33);
  b.box(1.56, 0.04, 0.68, gx, top + 0.005, cz, 0x55555b);
  const jeon = [[-0.45, -0.12], [-0.05, 0.13], [0.35, -0.1], [-0.3, 0.17], [0.42, 0.18]];
  for (const [jx, jz] of jeon) b.cylinder(0.15, 0.15, 0.03, gx + jx, top + 0.075, cz + jz, 0xe2a43a, 14);
  // 전 접시
  b.cylinder(0.26, 0.2, 0.04, 0.0, top + 0.02, cz + 0.15, 0xffffff, 16);
  for (let i = 0; i < 4; i++) b.cylinder(0.14, 0.14, 0.025, 0.0 + (i % 2) * 0.05, top + 0.05 + i * 0.026, cz + 0.15, 0xd9952f, 12);

  if (isMeal) {
    // 큰 국솥, 밥공기, 쟁반
    b.cylinder(0.42, 0.38, 0.5, 1.5, top + 0.25, cz - 0.05, 0x8a8f96, 18);
    b.cylinder(0.44, 0.44, 0.04, 1.5, top + 0.52, cz - 0.05, 0x6e737a, 18);
    b.sphere(0.06, 1.5, top + 0.57, cz - 0.05, 0x3a3d42);
    b.box(0.9, 0.03, 0.5, 2.55, top + 0.015, cz + 0.05, 0x9c6b3f);
    for (let i = 0; i < 3; i++) b.cylinder(0.11, 0.07, 0.09, 2.27 + i * 0.28, top + 0.075, cz + 0.05, 0xffffff, 12);
    // 뒷선반 밥솥과 그릇
    for (let i = 0; i < 5; i++) b.cylinder(0.1, 0.07, 0.08, -2.6 + i * 0.32, 1.7, -d / 2 + 0.25, 0xffffff, 10);
    b.cylinder(0.25, 0.25, 0.32, 2.4, 1.82, -d / 2 + 0.3, 0xe9e2d6, 14);
  } else {
    // 나눔 상자, 선물 꾸러미
    const gifts: [number, number, number, number][] = [
      [1.3, 0.34, 0.0, 0xf97316], [1.75, 0.26, 0.05, 0xec4899], [1.5, 0.22, 0.04, 0x0ea5e9], [2.3, 0.3, -0.1, 0x65a30d],
    ];
    let stackY = top;
    gifts.forEach(([gx2, size, dz, color], i) => {
      const y = i === 2 ? stackY + 0.34 : top;
      b.box(size, size, size, gx2, y + size / 2, cz + dz, color);
      b.box(size + 0.01, size + 0.01, 0.05, gx2, y + size / 2, cz + dz, 0xffffff);
      if (i === 0) stackY = top;
    });
    b.box(1.0, 0.55, 0.6, -2.4, 0.14 + 0.275, d / 2 + 0.55, 0xc58b52);
    b.box(1.02, 0.04, 0.62, -2.4, 0.7, d / 2 + 0.55, woodDark);
  }

  // 앞마당 낮은 상과 의자
  b.use("wood");
  for (const tx of [-2.2, 2.2]) {
    const tz = d / 2 + 1.6;
    b.box(1.3, 0.06, 0.8, tx, 0.45, tz, wood);
    for (const lx of [-0.55, 0.55]) for (const lz of [-0.32, 0.32]) b.box(0.06, 0.42, 0.06, tx + lx, 0.21, tz + lz, woodDark);
    for (const sx of [-0.9, 0.9]) b.use("fabric").cylinder(0.2, 0.2, 0.36, tx + sx, 0.18, tz, 0x6b8f71, 10).use("wood");
  }
  // 앞마당 바닥 깔개
  b.use("fabric").box(w + 1, 0.02, 3.0, 0, 0.03, d / 2 + 1.6, 0xf2d7b0);

  const bodyMat = vertexColorMaterial();
  const body = markBake(b.build(bodyMat), "atlas", `booth-${booth.id}`);
  group.add(body);

  // 줄무늬 천막
  const awningTex = stripeTexture(zone.color, "#fffaf0", 10);
  const awningMat = new THREE.MeshStandardMaterial({ map: awningTex, side: THREE.DoubleSide, roughness: 0.95 });
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, d + 0.6), awningMat);
  awning.rotation.x = -Math.PI / 2 + 0.22;
  awning.position.set(0, h + 0.38, 0);
  group.add(markBake(awning, "atlas", `booth-${booth.id}-awning`));
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, 0.4), awningMat);
  valance.position.set(0, h - 0.08, d / 2 + 0.36);
  group.add(markBake(valance, "atlas", `booth-${booth.id}-valance`));

  // 나무 간판
  const sign = texturedPlane(woodSignTexture(booth.name, isMeal ? "따뜻한 밥 한 끼, 같이 먹어요" : "기쁨을 함께 나눠요"), 3.8, 1.2);
  sign.position.set(0, h + 1.15, d / 2 + 0.25);
  group.add(sign);

  // 전구줄 (자체 발광)
  const bulbs = new MeshBuilder();
  const n = 11;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = -w / 2 + 0.1 + t * (w - 0.2);
    const sag = Math.sin(t * Math.PI) * 0.35;
    bulbs.sphere(0.07, x, h - 0.25 - sag, d / 2 + 0.05, COLORS.lantern);
  }
  const bulbMesh = bulbs.build(glowMaterial());
  group.add(bulbMesh);

  // 따뜻한 조명
  const light = new THREE.PointLight(0xffb066, 9, 11, 1.6);
  light.position.set(0, h - 0.4, d / 2 - 0.4);
  group.add(light);

  // 철판 위 김
  const steam = createSteam(new THREE.Vector3(gx, top + 0.1, cz), 1.2);
  group.add(steam.points);

  return {
    id: booth.id,
    group,
    pickables: [body, awning, valance, sign],
    setHover: hoverable([bodyMat, awningMat, sign.material as THREE.MeshStandardMaterial]),
    update: steam.update,
  };
}

function createSteam(origin: THREE.Vector3, spread: number) {
  const count = STEAM.particles;
  const positions = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    life[i] = Math.random();
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    map: softDotTexture(),
    size: 0.5,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const world = new THREE.Vector3();

  const place = () => {
    for (let i = 0; i < count; i++) {
      const l = life[i];
      const s = seeds[i];
      positions[i * 3] = origin.x + (s - 0.5) * spread + Math.sin(l * 6 + s * 10) * 0.08;
      positions[i * 3 + 1] = origin.y + l * STEAM.rise;
      positions[i * 3 + 2] = origin.z + (((s * 7.3) % 1) - 0.5) * 0.4;
    }
    geo.attributes.position.needsUpdate = true;
  };
  place();

  return {
    points,
    update(dt: number, camera: THREE.Vector3) {
      points.getWorldPosition(world);
      if (world.distanceTo(camera) > STEAM.activeDistance) return false;
      for (let i = 0; i < count; i++) {
        life[i] += dt * (0.35 + seeds[i] * 0.25);
        if (life[i] > 1) {
          life[i] -= 1;
          seeds[i] = Math.random();
        }
      }
      place();
      return true;
    },
  };
}
