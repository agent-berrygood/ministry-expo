import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { POST, SURFACE } from "../config";
import { surfaceAtlasTexture } from "./textures";

// 드로우콜을 줄이려고(PRD 8장) 도형은 정점 색으로 칠해서 하나로 합친다.
// 질감(칠한 벽·나무·천·돌)은 한 장의 아틀라스에서 고르므로 질감이 달라도 드로우콜이 늘지 않는다.

export type Surface = keyof typeof SURFACE.tiles;

export class MeshBuilder {
  private parts: THREE.BufferGeometry[] = [];
  private surfaceKind: Surface = "paint";

  /** 이후에 추가하는 도형의 질감을 정한다 */
  use(kind: Surface): this {
    this.surfaceKind = kind;
    return this;
  }

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, matrix?: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    boxMapUv(g, SURFACE.scale[this.surfaceKind]);
    if (matrix) g.applyMatrix4(matrix);
    const count = g.getAttribute("position").count;
    const c = new THREE.Color(color);
    const colors = new Float32Array(count * 3);
    const tiles = new Float32Array(count * 2);
    const [tu, tv] = SURFACE.tiles[this.surfaceKind];
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      tiles[i * 2] = tu;
      tiles[i * 2 + 1] = tv;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("surfTile", new THREE.BufferAttribute(tiles, 2));
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rotY = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, at(x, y, z, rotY));
  }

  /** 모서리가 둥근 상자 */
  rbox(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, radius = 0.06, rotY = 0): this {
    const r = Math.min(radius, w / 2.01, h / 2.01, d / 2.01);
    return this.add(new RoundedBoxGeometry(w, h, d, 1, r), color, at(x, y, z, rotY));
  }

  capsule(r: number, len: number, x: number, y: number, z: number, color: THREE.ColorRepresentation): this {
    return this.add(new THREE.CapsuleGeometry(r, len, 3, 8), color, at(x, y, z));
  }

  /** 아래로 늘어진 삼각 깃발 (a→b 사이에 걸림) */
  pennant(ax: number, az: number, bx: number, bz: number, y: number, drop: number, color: THREE.ColorRepresentation): this {
    const geo = new THREE.BufferGeometry();
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    geo.setAttribute("position", new THREE.Float32BufferAttribute([ax, y, az, mx, y - drop, mz, bx, y, bz], 3));
    geo.computeVertexNormals();
    return this.add(geo, color);
  }

  cylinder(rTop: number, rBottom: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, segments = 12): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, segments), color, at(x, y, z));
  }

  sphere(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation): this {
    return this.add(new THREE.SphereGeometry(r, 8, 6), color, at(x, y, z));
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  build(material: THREE.Material): THREE.Mesh {
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    if (!merged) throw new Error("도형 합치기 실패");
    merged.computeBoundingSphere();
    return new THREE.Mesh(merged, material);
  }
}

/**
 * 박스 매핑 UV: 면의 방향에 따라 로컬 좌표 두 축을 UV로 쓴다.
 * 크기가 다른 도형이어도 질감 무늬의 실제 크기(m)가 같게 보인다.
 */
function boxMapUv(g: THREE.BufferGeometry, metersPerTile: number): void {
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u: number, v: number;
    if (ax >= ay && ax >= az) [u, v] = [pos.getZ(i), pos.getY(i)];
    else if (ay >= az) [u, v] = [pos.getX(i), pos.getZ(i)];
    else [u, v] = [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u / metersPerTile;
    uv[i * 2 + 1] = v / metersPerTile;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

export function at(x: number, y: number, z: number, rotY = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationY(rotY);
  m.setPosition(x, y, z);
  return m;
}

let atlas: THREE.Texture | null = null;

/**
 * 정점 색 × 질감 아틀라스 재질.
 * 아틀라스의 칸(surfTile) 안에서 UV를 반복시키려고 셰이더의 map 샘플링만 바꾼다.
 */
export function vertexColorMaterial(opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  atlas ??= surfaceAtlasTexture();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, map: atlas, ...opts });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 surfTile;\nvarying vec2 vSurfTile;\nvarying vec2 vSurfUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvSurfTile = surfTile;\nvSurfUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vSurfTile;\nvarying vec2 vSurfUv;")
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
          // 칸 가장자리 번짐을 막으려고 2%씩 안쪽만 쓴다
          vec2 surfUv = vSurfTile + 0.01 + fract(vSurfUv) * 0.48;
          vec4 sampledDiffuseColor = textureGrad(map, surfUv, dFdx(vSurfUv) * 0.48, dFdy(vSurfUv) * 0.48);
          diffuseColor *= sampledDiffuseColor;
        #endif`,
      );
  };
  mat.customProgramCacheKey = () => "surface-atlas";
  return mat;
}

/** 전구처럼 스스로 빛나는 재질. 밝기를 1 이상으로 올려 데스크톱에서 블룸이 걸리게 한다. */
export function glowMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.color.setScalar(POST.emissiveBoost);
  return m;
}

/** 글자 텍스처를 붙인 평면 */
export function texturedPlane(tex: THREE.Texture, w: number, h: number): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

export const deg = (d: number) => (d * Math.PI) / 180;
