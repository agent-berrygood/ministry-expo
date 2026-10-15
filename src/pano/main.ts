import * as THREE from "three";
import "../styles/tokens.css";
import "../styles/app.css";
import { LOOK } from "../config";
import { h } from "../ui/dom";

// 실사 시안 (거리뷰 방식): Blender로 렌더한 360° 사진(public/pano/)을 둘러보고 화살표로 지점을 오간다.
// 사진 가운데 = 웹 북쪽(-z), 사진 왼쪽 = 서쪽. 방향 계산은 본 앱과 같은 좌표(yaw 0 = -z)를 쓴다.

interface Pano {
  id: string;
  title: string;
  x: number;
  z: number;
  yaw: number;
  file: string;
  half: string;
}

const base = import.meta.env.BASE_URL;
const stage = document.getElementById("stage")!;
const ui = document.getElementById("ui")!;
const lowPower = matchMedia("(pointer: coarse)").matches;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 200);
camera.rotation.order = "YXZ";

// 안쪽에서 보는 구. 사진 가운데(u=0.5)가 -z를 보도록 돌린다
const sphereGeo = new THREE.SphereGeometry(50, 96, 48).scale(-1, 1, 1).rotateY(-Math.PI / 2);
const makeSphere = () => new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
let front = makeSphere();
let back = makeSphere();
scene.add(back, front);

const arrows = new THREE.Group();
scene.add(arrows);
const arrowGeo = (() => {
  const s = 0.55;
  const shape = new THREE.Shape();
  shape.moveTo(0, s);
  shape.lineTo(s * 0.95, -s * 0.15);
  shape.lineTo(s * 0.62, -s * 0.48);
  shape.lineTo(0, s * 0.22);
  shape.lineTo(-s * 0.62, -s * 0.48);
  shape.lineTo(-s * 0.95, -s * 0.15);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
})();
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false });
const discMat = new THREE.MeshBasicMaterial({ color: 0x1f1a14, transparent: true, opacity: 0.35, depthTest: false });

let yaw = 0;
let pitch = (-6 * Math.PI) / 180;
let panos: Pano[] = [];
let current: Pano | null = null;
let busy = false;
const loader = new THREE.TextureLoader();
const title = h("span", { class: "hud-where" }, h("i"), "불러오는 중…");

ui.append(
  h(
    "div",
    { class: "hud-top" },
    h("div", { class: "hud-title" }, h("strong", {}, "사역박람회 · 실사 시안"), title),
    h("div", { class: "hud-actions" }, h("a", { class: "btn", href: `${base}#/` }, "기존 3D로 보기")),
  ),
  h("div", { class: "hint", role: "status" }, "Blender로 렌더한 360° 사진이에요. 끌어서 둘러보고 바닥 화살표로 이동하세요"),
);

function loadTexture(p: Pano): Promise<THREE.Texture> {
  return new Promise((resolve, reject) =>
    loader.load(
      base + (lowPower ? p.half : p.file),
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        resolve(t);
      },
      undefined,
      reject,
    ),
  );
}

async function show(p: Pano, faceYawDeg?: number): Promise<void> {
  if (busy) return;
  busy = true;
  const tex = await loadTexture(p);
  // 새 사진은 뒤 구에 올리고 앞 구를 서서히 지운다
  [front, back] = [back, front];
  (front.material as THREE.MeshBasicMaterial).map = tex;
  (front.material as THREE.MeshBasicMaterial).needsUpdate = true;
  front.renderOrder = 1;
  back.renderOrder = 0;
  const fm = front.material as THREE.MeshBasicMaterial;
  fm.opacity = 0;
  current = p;
  if (faceYawDeg !== undefined) yaw = THREE.MathUtils.degToRad(faceYawDeg);
  title.replaceChildren(h("i"), p.title);
  buildArrows();
  const t0 = performance.now();
  await new Promise<void>((done) => {
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 600);
      fm.opacity = k;
      if (k < 1) requestAnimationFrame(step);
      else done();
    };
    step();
  });
  busy = false;
}

function buildArrows(): void {
  arrows.clear();
  if (!current) return;
  for (const p of panos) {
    if (p === current) continue;
    const dir = Math.atan2(-(p.x - current.x), -(p.z - current.z));
    const g = new THREE.Group();
    g.position.set(-Math.sin(dir) * 3, -1.55, -Math.cos(dir) * 3);
    g.rotation.y = dir;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), discMat);
    disc.rotation.x = -Math.PI / 2;
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.z = 0.08;
    disc.userData.to = p.id;
    disc.renderOrder = 5;
    arrow.renderOrder = 6;
    g.add(disc, arrow);
    arrows.add(g);
  }
}

// ---------- 입력: 끌어서 둘러보기, 화살표 누르기, 휠로 확대 ----------
const el = renderer.domElement;
el.style.touchAction = "none";
let drag: { x: number; y: number; moved: number } | null = null;
el.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY, moved: 0 };
  el.setPointerCapture(e.pointerId);
});
el.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = e.clientX;
  drag.y = e.clientY;
  const speed = LOOK.dragSpeed * (camera.fov / 75);
  yaw += dx * speed;
  pitch = THREE.MathUtils.clamp(pitch + dy * speed, -1.2, 1.2);
});
el.addEventListener("pointerup", (e) => {
  const click = drag && drag.moved < LOOK.clickSlop;
  drag = null;
  if (!click) return;
  const r = el.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = ray.intersectObjects(arrows.children, true).find((i) => i.object.userData.to);
  const to = panos.find((p) => p.id === hit?.object.userData.to);
  if (to && current) show(to, THREE.MathUtils.radToDeg(Math.atan2(-(to.x - current.x), -(to.z - current.z))));
});
el.addEventListener(
  "wheel",
  (e) => {
    camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.03, 35, 90);
    camera.updateProjectionMatrix();
    e.preventDefault();
  },
  { passive: false },
);

function resize(): void {
  const w = stage.clientWidth;
  const hgt = stage.clientHeight;
  renderer.setSize(w, hgt);
  camera.aspect = w / hgt;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

renderer.setAnimationLoop(() => {
  camera.rotation.set(pitch, yaw, 0);
  renderer.render(scene, camera);
});

fetch(`${base}pano/manifest.json`)
  .then((r) => r.json() as Promise<Pano[]>)
  .then((list) => {
    panos = list;
    const start = list[0];
    if (start) show(start, start.yaw);
  })
  .catch(() => title.replaceChildren(h("i"), "360° 사진이 아직 없어요"));
