import * as THREE from "three";

export const FONT_STACK = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

/** 글자 텍스처를 그리기 전에 웹폰트가 준비될 때까지 기다린다. */
export async function ensureFonts(): Promise<void> {
  try {
    await Promise.race([
      document.fonts.load(`800 64px ${FONT_STACK}`, "사역박람회"),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    // 폰트를 못 불러와도 기본 글꼴로 계속 진행한다.
  }
}

export function isLight(hex: string): boolean {
  const c = new THREE.Color(hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return lum > 0.55;
}

export function inkFor(hex: string): string {
  return isLight(hex) ? "#1f1a14" : "#ffffff";
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, maxPx: number, maxWidth: number): number {
  let px = maxPx;
  ctx.font = `${weight} ${px}px ${FONT_STACK}`;
  while (ctx.measureText(text).width > maxWidth && px > 12) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${FONT_STACK}`;
  }
  return px;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 가로로 긴 간판: 배경색 + 가운데 글자 */
export function signTexture(text: string, bg: string, opts: { sub?: string; aspect?: number } = {}): THREE.CanvasTexture {
  const aspect = opts.aspect ?? 5;
  const h = 128;
  const w = Math.round(h * aspect);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = inkFor(bg);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (opts.sub) {
    fitFont(ctx, text, 800, 60, w * 0.9);
    ctx.fillText(text, w / 2, h * 0.42);
    ctx.globalAlpha = 0.8;
    fitFont(ctx, opts.sub, 600, 28, w * 0.9);
    ctx.fillText(opts.sub, w / 2, h * 0.8);
  } else {
    fitFont(ctx, text, 800, 68, w * 0.9);
    ctx.fillText(text, w / 2, h * 0.54);
  }
  return finish(canvas);
}

/** 부스 뒷벽 포스터: 존 색 배경, 큰 아이콘, 부서명, 대상 */
export function posterTexture(name: string, icon: string, color: string, caption: string): THREE.CanvasTexture {
  const w = 512;
  const h = 384;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color);
  grad.addColorStop(1, shade(color, -0.18));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  roundRect(ctx, 28, 28, w - 56, h - 56, 28);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `120px ${FONT_STACK}`;
  ctx.fillText(icon, w / 2, h * 0.38);

  ctx.fillStyle = "#1f1a14";
  fitFont(ctx, name, 800, 54, w - 100);
  ctx.fillText(name, w / 2, h * 0.7);
  if (caption) {
    ctx.fillStyle = "#6b6257";
    fitFont(ctx, caption, 600, 28, w - 100);
    ctx.fillText(caption, w / 2, h * 0.83);
  }
  return finish(canvas);
}

/** 장터 천막용 줄무늬 */
export function stripeTexture(a: string, b: string, stripes = 8): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const sw = canvas.width / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? a : b;
    ctx.fillRect(i * sw, 0, sw + 1, canvas.height);
  }
  // 천막 끝 물결 모양
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(0, canvas.height - 6, canvas.width, 6);
  return finish(canvas);
}

/** 나무 간판: 손글씨 느낌 */
export function woodSignTexture(text: string, sub: string): THREE.CanvasTexture {
  const w = 640;
  const h = 200;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#9a6a3e";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(60,35,15,0.25)";
  ctx.lineWidth = 3;
  for (let y = 18; y < h; y += 26) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y - 6, w * 0.6, y + 6, w, y - 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "#5e3c20";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.fillStyle = "#fff8ea";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitFont(ctx, text, 900, 76, w - 60);
  ctx.fillText(text, w / 2, h * 0.42);
  ctx.fillStyle = "#ffe2a8";
  fitFont(ctx, sub, 700, 32, w - 60);
  ctx.fillText(sub, w / 2, h * 0.78);
  return finish(canvas);
}

/** 김 파티클용 부드러운 원 */
export function softDotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.5, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return finish(canvas);
}

/** 하늘: 위는 살구빛, 지평선은 크림색 */
export function skyTexture(top: string, horizon: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.62, horizon);
  g.addColorStop(1, horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  return finish(canvas);
}

/** 바닥 타일: 은은한 줄눈과 타일마다 아주 약한 색 차이 */
export function floorTileTexture(base: string, line: string, tiles = 4): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const step = size / tiles;
  const c = new THREE.Color(base);
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < tiles; j++) {
      const v = ((i * 7 + j * 13) % 5) / 5 - 0.4;
      const t = c.clone().offsetHSL(0, 0, v * 0.02);
      ctx.fillStyle = `#${t.getHexString()}`;
      ctx.fillRect(i * step, j * step, step, step);
    }
  }
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  const tex = finish(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** 바닥에 까는 부드러운 그림자. 흰색=불투명, 알파맵으로 쓴다. */
export function blobShadowTexture(shape: "circle" | "rect"): THREE.CanvasTexture {
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, s, s);
  if (shape === "circle") {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.45, "#bbb");
    g.addColorStop(1, "#000");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  } else {
    ctx.filter = "blur(12px)";
    ctx.fillStyle = "#fff";
    ctx.fillRect(s * 0.16, s * 0.16, s * 0.68, s * 0.68);
    ctx.filter = "none";
  }
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
  return `#${c.getHexString()}`;
}

/** 존 색을 밝게 풀어 바닥색으로 쓴다 */
export function tint(hex: string, toward = 0xffffff, t = 0.78): THREE.Color {
  return new THREE.Color(hex).lerp(new THREE.Color(toward), t);
}
