import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// 개발 전용 (PRD 7.4): 굽기 대상(markBake)만 골라 GLB로 내보내 개발 서버에 올린다 → bake/scene.glb
// 이후 `npm run bake`가 Blender로 빛 지도를 굽는다.

export async function exportBakeScene(scene: THREE.Scene): Promise<{ meshes: number; vertices: number; bytes: number }> {
  scene.updateMatrixWorld(true);
  const out = new THREE.Scene();
  let vertices = 0;
  const names = new Set<string>();

  scene.traverse((o) => {
    const src = o as THREE.Mesh;
    if (!src.isMesh || !src.userData.bake) return;
    const name = `${src.userData.bake}:${src.userData.bakeName}`;
    if (names.has(name)) throw new Error(`굽기 이름 중복: ${name}`);
    names.add(name);

    // 웹에서 빛 지도를 입힐 때와 같은 순서가 되도록 항상 인덱스 없는(삼각형마다 꼭짓점 3개) 형태로 보낸다
    const geo = src.geometry.index ? src.geometry.toNonIndexed() : src.geometry;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", geo.getAttribute("position").clone());
    g.setAttribute("normal", geo.getAttribute("normal").clone());
    // Blender는 정점 색을 주변 반사광 색으로 쓴다. 색이 없는 것(천막 등)은 흰색으로 채운다
    const n = g.getAttribute("position").count;
    const color = geo.getAttribute("color")?.clone() ?? new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3);
    g.setAttribute("color", color);
    const side = (src.material as THREE.Material).side;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side });
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    src.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
    out.add(mesh);
    vertices += g.getAttribute("position").count;
  });

  const glb = (await new GLTFExporter().parseAsync(out, { binary: true })) as ArrayBuffer;
  const res = await fetch("/__bake/upload", { method: "POST", body: glb });
  if (!res.ok) throw new Error(`업로드 실패: ${res.status}`);
  return { meshes: names.size, vertices, bytes: glb.byteLength };
}
