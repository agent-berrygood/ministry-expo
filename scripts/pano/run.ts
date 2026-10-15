// 실사 시안 렌더 실행: Blender로 bake/render.glb를 360° 사진으로 렌더하고 public/pano/에 웹용으로 둔다.
// 사용: npm run pano            (최종 품질)
//       npm run pano -- --draft (빠른 확인용)
// 먼저 개발 서버에서 http://localhost:5173/?nobake 를 열고 콘솔에서 await __expo.exportRender()
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { Layout } from "../../src/data/types";

const root = path.resolve(import.meta.dirname, "../..");
const draft = process.argv.includes("--draft");
const blender = process.env.BLENDER_PATH ?? "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe";
const quality = draft ? { width: 2048, samples: 48 } : { width: 4096, samples: 192 };

// 시안 지점: 입구 환영, 나눔마당 따뜻한한끼봉사부 앞
const layout = JSON.parse(fs.readFileSync(path.join(root, "public/data/layout.json"), "utf8")) as Layout;
const pick = (id: string, node: string, title: string) => {
  const n = layout.nodes.find((x) => x.id === node);
  if (!n) throw new Error(`이동 지점 없음: ${node}`);
  return { id, node, title, x: n.x, z: n.z, yaw: n.yaw };
};
const spots = [pick("welcome", "n-plaza-welcome", "입구 환영"), pick("warm-meal", "n-booth-warm-meal", "나눔마당 · 따뜻한한끼봉사부")];

if (!fs.existsSync(path.join(root, "bake/render.glb"))) {
  console.error("bake/render.glb가 없습니다. 개발 서버에서 ?nobake 로 열고 콘솔에 await __expo.exportRender() 를 실행하세요.");
  process.exit(1);
}
const started = Date.now();
const r = spawnSync(
  blender,
  ["-b", "--factory-startup", "--python", path.join(root, "scripts/pano/render.py"), "--", root, JSON.stringify(spots), String(quality.width), String(quality.samples)],
  { stdio: "inherit" },
);
if (r.status !== 0) {
  console.error(`Blender 렌더 실패 (종료 코드 ${r.status})`);
  process.exit(1);
}

const dest = path.join(root, "public/pano");
fs.mkdirSync(dest, { recursive: true });
const manifest = [];
for (const s of spots) {
  const src = path.join(root, "bake/pano", `${s.id}.png`);
  await sharp(src).resize(4096).webp({ quality: 85 }).toFile(path.join(dest, `${s.id}.webp`));
  await sharp(src).resize(2048).webp({ quality: 85 }).toFile(path.join(dest, `${s.id}-half.webp`));
  manifest.push({ ...s, file: `pano/${s.id}.webp`, half: `pano/${s.id}-half.webp` });
}
fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
for (const f of fs.readdirSync(dest)) console.log(`  ${f}  ${(fs.statSync(path.join(dest, f)).size / 1024).toFixed(0)} KB`);
console.log(`✅ 360° 렌더 완료 (${((Date.now() - started) / 1000).toFixed(0)}초${draft ? ", 초안" : ""})`);
