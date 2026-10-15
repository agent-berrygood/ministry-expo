import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// 개발 전용 (실사 시안): 보이는 장면 전체를 질감째 GLB로 내보내 bake/render.glb로 저장한다.
// Blender(scripts/pano/render.py)가 재질을 사실적으로 바꿔 360° 사진으로 렌더한다.
// 이름 규칙: surface:* (정점 색 + 재질 종류), tex:* (질감 있는 판), glow:* (전구), billboard:* (사진 인물)
// 정점 색의 알파에 재질 종류(칠한 벽 0, 나무 1, 천 2, 돌 3)를 담는다.

const SURFACE_CODE: Record<string, number> = { "0,0": 0, "0.5,0": 1, "0,0.5": 2, "0.5,0.5": 3 };

export async function exportRenderScene(scene: THREE.Scene): Promise<{ meshes: number; bytes: number }> {
  scene.updateMatrixWorld(true);
  const out = new THREE.Scene();
  let n = 0;

  scene.traverse((o) => {
    const src = o as THREE.Mesh;
    if (!src.isMesh || !src.visible) return;
    // 화살표·그림자 판·사람 실루엣(장난감 같아 실사에서 뺀다)·부장 실루엣(사진 없음)은 내보내지 않는다
    if (isUnder(src, "nav-arrows") || src.name === "shadow-blobs" || src.userData.bakeName === "people") return;
    const mat = src.material as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
    const isFigure = !!src.userData.figureId || (!!src.userData.boothId && mat.alphaTest > 0);
    if (isFigure && (!mat.map || mat.map.image instanceof HTMLCanvasElement)) return;

    const geo = (src.geometry.index ? src.geometry.toNonIndexed() : src.geometry).clone();
    let kind: string;
    let material: THREE.Material;
    if (isFigure) {
      kind = "billboard";
      material = new THREE.MeshStandardMaterial({ map: mat.map, alphaTest: 0.5, side: THREE.DoubleSide });
    } else if (mat.userData?.surface) {
      kind = "surface";
      const tile = geo.getAttribute("surfTile");
      const color = geo.getAttribute("color");
      const rgba = new Float32Array(color.count * 4);
      for (let i = 0; i < color.count; i++) {
        const code = SURFACE_CODE[`${tile.getX(i)},${tile.getY(i)}`] ?? 0;
        rgba.set([color.getX(i), color.getY(i), color.getZ(i), (code + 0.5) / 4], i * 4);
      }
      geo.setAttribute("color", new THREE.BufferAttribute(rgba, 4));
      geo.deleteAttribute("surfTile");
      geo.deleteAttribute("uv1");
      material = new THREE.MeshStandardMaterial({ vertexColors: true, side: mat.side });
    } else if (mat.isMeshBasicMaterial && !mat.map && mat.vertexColors) {
      kind = "glow";
      material = new THREE.MeshStandardMaterial({ vertexColors: true });
    } else {
      kind = "tex";
      geo.deleteAttribute("uv1");
      material = new THREE.MeshStandardMaterial({ map: mat.map ?? null, color: mat.color, vertexColors: mat.vertexColors, side: mat.side });
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `${kind}:${src.userData.bakeName ?? src.userData.figureId ?? src.name ?? n}:${n}`;
    src.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
    // 사진 인물은 회전 없이 보낸다 (Blender가 렌더 지점마다 카메라 쪽으로 돌린다)
    if (kind === "billboard") mesh.quaternion.identity();
    out.add(mesh);
    n++;
  });

  const glb = (await new GLTFExporter().parseAsync(out, { binary: true })) as ArrayBuffer;
  const res = await fetch("/__bake/upload?name=render.glb", { method: "POST", body: glb });
  if (!res.ok) throw new Error(`업로드 실패: ${res.status}`);
  return { meshes: n, bytes: glb.byteLength };
}

function isUnder(o: THREE.Object3D, name: string): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name === name) return true;
  return false;
}
