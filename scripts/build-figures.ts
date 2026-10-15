// 인물 사진 처리 (PRD 4.8): photos/ 폴더의 사진을 웹용으로 바꾸고 figures.json 목록을 만든다.
// - 부스 담당자: photos/{boothId}_{부서명}/staff.png
// - 입구 환영:   photos/_entrance/ 의 첫 번째 사진
// - 교역자:     photos/_clergy/{자리ID}_{이름 직분}.png (자리는 layout.json의 figures.clergy)
// 개발 서버와 빌드에서 자동으로 실행된다 (vite.config.ts). 직접 실행: npm run figures
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import type { FigureImage, FigureManifest } from "../src/data/types";

const IMAGE = /\.(png|webp|jpe?g)$/i;
const HEIGHT = 768;

/** "01-오대식 목사.png" → "오대식 목사", "young-adult-2_강세원 목사.png" → "강세원 목사" */
function captionOf(file: string): string {
  return path
    .parse(file)
    .name.replace(/^\d+[-_.\s]*/, "")
    .replace(/^[a-z0-9-]+_/, "")
    .trim();
}

function images(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => IMAGE.test(f) && !f.startsWith("_") && !f.startsWith("."))
    .sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
}

export async function buildFigures(root: string, log: (msg: string) => void = console.log): Promise<FigureManifest> {
  const photos = path.join(root, "photos");
  const outDir = path.join(root, "public", "figures");
  const manifestPath = path.join(root, "public", "data", "figures.json");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const manifest: FigureManifest = { staff: {}, entrance: null, clergy: {} };

  const convert = async (file: string, outName: string): Promise<FigureImage | null> => {
    try {
      const meta = await sharp(file).metadata();
      if (!meta.hasAlpha) log(`⚠️  배경이 지워지지 않은 사진: ${path.relative(root, file)} (투명 배경 PNG를 권장)`);
      // 회전 보정 → 투명한 가장자리 잘라내기 → 높이 맞춤 → WebP. 메타데이터(위치 정보 등)는 기본으로 지워진다.
      const out = path.join(outDir, outName);
      const info = await sharp(file)
        .rotate()
        .trim({ threshold: 1 })
        .resize({ height: HEIGHT, withoutEnlargement: true })
        .webp({ quality: 82, alphaQuality: 90 })
        .toFile(out);
      return { src: `figures/${outName}`, aspect: +(info.width / info.height).toFixed(4), caption: captionOf(file) };
    } catch (err) {
      log(`❌ 사진 처리 실패: ${path.relative(root, file)} — ${(err as Error).message}`);
      return null;
    }
  };

  if (fs.existsSync(photos)) {
    for (const dir of fs.readdirSync(photos)) {
      const id = /^([a-z0-9-]+)_/.exec(dir)?.[1];
      if (!id) continue;
      const staff = images(path.join(photos, dir)).find((f) => /^staff\./i.test(f));
      if (!staff) continue;
      const img = await convert(path.join(photos, dir, staff), `staff-${id}.webp`);
      if (img) manifest.staff[id] = img;
    }
    const entrance = images(path.join(photos, "_entrance"))[0];
    if (entrance) manifest.entrance = await convert(path.join(photos, "_entrance", entrance), "entrance.webp");
    for (const f of images(path.join(photos, "_clergy"))) {
      const spot = /^([a-z0-9-]+)_/.exec(f)?.[1];
      if (!spot) {
        log(`⚠️  자리 ID가 없는 교역자 사진: _clergy/${f} (예: plaza-1_홍길동 목사.png)`);
        continue;
      }
      const img = await convert(path.join(photos, "_clergy", f), `clergy-${spot}.webp`);
      if (img) manifest.clergy[spot] = img;
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  log(`🧍 인물 사진: 담당자 ${Object.keys(manifest.staff).length}, 입구 ${manifest.entrance ? 1 : 0}, 교역자 ${Object.keys(manifest.clergy).length}`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildFigures(process.cwd()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
