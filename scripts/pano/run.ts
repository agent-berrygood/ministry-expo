// 실사 시안 렌더 실행: Blender로 bake/render.glb를 360° 사진으로 렌더하고 public/pano/에 웹용으로 둔다.
// 사용: npm run pano            (최종 품질)
//       npm run pano -- --draft (빠른 확인용)
//       npm run pano -- --booths=galilee,zion-choir  (담당자 사진을 바꾼 부스와 그 부스가 가까이 보이는 지점만 다시)
// 먼저 개발 서버에서 http://localhost:5173/?nobake 를 열고 콘솔에서 await __expo.exportRender()
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { Layout } from "../../src/data/types";

const root = path.resolve(import.meta.dirname, "../..");
// 에셋 경로(RENDER_ASSETS_DIR) 등 컴퓨터별 설정
try {
  process.loadEnvFile(path.join(root, ".env.local"));
} catch {
  // 없으면 Blender 기본 하늘·소품으로 렌더한다
}
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
// 렌더 지점: 기본은 시안 2곳, --all 이면 모든 이동 지점, --nodes a,b 면 지정한 지점
const nodesArg = process.argv.find((x) => x.startsWith("--nodes="))?.slice(8);
const titleOf = (id: string): string => {
  const n = layout.nodes.find((x) => x.id === id);
  if (n?.booth) {
    const booths = JSON.parse(fs.readFileSync(path.join(root, "public/data/booths.json"), "utf8")) as { id: string; name: string }[];
    return booths.find((b) => b.id === n.booth)?.name ?? id;
  }
  return id;
};
// 부스 지점 + 그 지점과 이어진 지점(부스 앞모습이 가깝게 보이는 곳)
const boothsArg = process.argv.find((x) => x.startsWith("--booths="))?.slice(9);
const boothNodes = (ids: string[]): string[] => {
  const set = new Set<string>();
  for (const n of layout.nodes) {
    if (!n.booth || !ids.includes(n.booth)) continue;
    set.add(n.id);
    for (const l of n.links) set.add(l);
  }
  return layout.nodes.map((n) => n.id).filter((id) => set.has(id));
};
const spots = process.argv.includes("--all")
  ? layout.nodes.map((n) => pick(n.id, n.id, titleOf(n.id)))
  : boothsArg
    ? boothNodes(boothsArg.split(",")).map((id) => pick(id, id, titleOf(id)))
    : nodesArg
    ? nodesArg.split(",").map((id) => pick(id, id, titleOf(id)))
    : [pick("welcome", "n-plaza-welcome", "입구 환영"), pick("warm-meal", "n-booth-warm-meal", "나눔마당 · 따뜻한한끼봉사부")];

if (!fs.existsSync(path.join(root, "bake/render.glb"))) {
  console.error("bake/render.glb가 없습니다. 개발 서버에서 ?nobake 로 열고 콘솔에 await __expo.exportRender() 를 실행하세요.");
  process.exit(1);
}
if (spots.length === 0) {
  console.error("다시 렌더할 지점이 없습니다. 부스 id를 확인하세요.");
  process.exit(1);
}
const started = Date.now();
const r = spawnSync(
  blender,
  ["-b", "--factory-startup", "--python", path.join(root, "scripts/pano/render.py"), "--", root, JSON.stringify(spots), String(quality.width), String(quality.samples)],
  { stdio: "inherit", env: process.env },
);
if (r.status !== 0) {
  console.error(`Blender 렌더 실패 (종료 코드 ${r.status})`);
  process.exit(1);
}

const dest = path.join(root, "public/pano");
fs.mkdirSync(dest, { recursive: true });
// 일부만 다시 렌더해도 기존 사진 목록은 지키고, 순서는 이동 지점 순서로 맞춘다
type Entry = (typeof spots)[number] & { file: string; half: string };
const manifestPath = path.join(dest, "manifest.json");
const old: Entry[] = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : [];
const fresh: Entry[] = [];
for (const s of spots) {
  const src = path.join(root, "bake/pano", `${s.id}.png`);
  await sharp(src).resize(4096).webp({ quality: 85 }).toFile(path.join(dest, `${s.id}.webp`));
  await sharp(src).resize(2048).webp({ quality: 85 }).toFile(path.join(dest, `${s.id}-half.webp`));
  fresh.push({ ...s, file: `pano/${s.id}.webp`, half: `pano/${s.id}-half.webp` });
}
const order = new Map(layout.nodes.map((n, i) => [n.id, i]));
const manifest = [...old.filter((e) => !fresh.some((f) => f.id === e.id)), ...fresh].sort(
  (a, b) => (order.get(a.node) ?? 1e9) - (order.get(b.node) ?? 1e9),
);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
for (const f of fs.readdirSync(dest)) console.log(`  ${f}  ${(fs.statSync(path.join(dest, f)).size / 1024).toFixed(0)} KB`);
console.log(`✅ 360° 렌더 완료 (${((Date.now() - started) / 1000).toFixed(0)}초${draft ? ", 초안" : ""})`);
