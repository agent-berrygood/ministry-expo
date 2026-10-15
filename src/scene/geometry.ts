import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// 드로우콜을 줄이려고(PRD 8장) 단색 도형은 정점 색으로 칠해서 하나로 합친다.

export class MeshBuilder {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, matrix?: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (matrix) g.applyMatrix4(matrix);
    const c = new THREE.Color(color);
    const count = g.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute("uv");
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rotY = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, at(x, y, z, rotY));
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

export function at(x: number, y: number, z: number, rotY = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationY(rotY);
  m.setPosition(x, y, z);
  return m;
}

export function vertexColorMaterial(opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...opts });
}

/** 글자 텍스처를 붙인 평면 */
export function texturedPlane(tex: THREE.Texture, w: number, h: number): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

export const deg = (d: number) => (d * Math.PI) / 180;
