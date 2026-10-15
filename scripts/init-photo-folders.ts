// 사진 폴더 만들기 (PRD 4.6, 4.8): 부스별 폴더와 입구·숨은 목회자 폴더를 만든다. 이미 있으면 건너뛴다.
import fs from "node:fs";
import path from "node:path";
import type { Booth } from "../src/data/types";

const root = path.resolve(import.meta.dirname, "..");
const photos = path.join(root, "photos");
const booths = JSON.parse(fs.readFileSync(path.join(root, "public/data/booths.json"), "utf8")) as Booth[];

const existing = fs.existsSync(photos) ? fs.readdirSync(photos) : [];
const dirs = [...booths.map((b) => `${b.id}_${b.name}`), "_entrance", "_hidden"];
let made = 0;
for (const dir of dirs) {
  const id = dir.split("_")[0];
  // 부스 폴더는 영문 ID로 찾으므로 뒤의 한글 이름이 달라도 이미 있는 것으로 본다
  if (id && existing.some((e) => e.startsWith(`${id}_`))) continue;
  if (!id && existing.includes(dir)) continue;
  fs.mkdirSync(path.join(photos, dir), { recursive: true });
  fs.writeFileSync(path.join(photos, dir, ".gitkeep"), "");
  made++;
}
console.log(`📁 사진 폴더 ${made}개 만듦 (전체 ${dirs.length}개)`);
