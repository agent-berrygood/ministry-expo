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

/** 이음매 없이 반복되는 값 노이즈 (0~1). period 칸마다 같은 값으로 돌아온다. */
function tileNoise(period: number, seed: number) {
  const grid = new Float32Array(period * period);
  let s = seed;
  for (let i = 0; i < grid.length; i++) {
    s = (s * 16807) % 2147483647;
    grid[i] = s / 2147483647;
  }
  const at = (x: number, y: number) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  return (u: number, v: number) => {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/**
 * 질감 아틀라스 (2×2): 칠한 벽 · 나무결 · 천 · 돌.
 * 거의 흰색 위의 명암만 담아서, 실제 색은 정점 색이 정한다. 칸마다 이음매 없이 반복된다.
 */
export function surfaceAtlasTexture(): THREE.CanvasTexture {
  const T = 256;
  const canvas = document.createElement("canvas");
  canvas.width = T * 2;
  canvas.height = T * 2;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(T * 2, T * 2);
  const n1 = tileNoise(8, 11);
  const n2 = tileNoise(32, 29);
  const n3 = tileNoise(64, 47);
  const n4 = tileNoise(4, 71);

  // 캔버스 위쪽이 텍스처의 v=1 쪽이다 (flipY)
  const tiles: [number, number, (u: number, v: number) => number][] = [
    // 왼쪽 아래: 칠한 벽 — 아주 옅은 얼룩
    [0, 1, (u, v) => 0.94 + (n1(u, v) - 0.5) * 0.05 + (n3(u, v) - 0.5) * 0.03],
    // 오른쪽 아래: 나무결 — u 방향으로 흐르는 결과 옹이
    [1, 1, (u, v) => {
      const warp = n1(u, v) * 2.5 + n4(u, v) * 1.5;
      const grain = Math.sin((v * 18 + warp) * Math.PI * 2) * 0.5 + 0.5;
      const fine = n3(u * 0.25, v);
      return 0.7 + grain * 0.14 + fine * 0.12 + (n2(u, v) - 0.5) * 0.04;
    }],
    // 왼쪽 위: 천 — 가로세로 실이 엮인 무늬
    [0, 0, (u, v) => {
      const k = 48;
      const wu = Math.sin(u * k * Math.PI * 2);
      const wv = Math.sin(v * k * Math.PI * 2);
      const over = Math.sign(Math.sin(u * k * Math.PI) * Math.sin(v * k * Math.PI));
      return 0.86 + (over > 0 ? wu : wv) * 0.05 + (n3(u, v) - 0.5) * 0.06;
    }],
    // 오른쪽 위: 돌·콘크리트 — 얼룩과 잔점
    [1, 0, (u, v) => {
      const speck = n3(u, v) > 0.82 ? -0.06 : 0;
      return 0.88 + (n1(u, v) - 0.5) * 0.1 + (n2(u, v) - 0.5) * 0.06 + speck;
    }],
  ];
  for (const [tx, ty, f] of tiles) {
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const v = Math.min(1, Math.max(0, f(x / T, y / T)));
        const i = ((ty * T + y) * T * 2 + (tx * T + x)) * 4;
        const c = Math.round(v * 255);
        img.data[i] = c;
        img.data[i + 1] = c;
        img.data[i + 2] = c;
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = finish(canvas);
  tex.anisotropy = 8;
  return tex;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** 머리·목 (얼굴은 비우고 머리카락만 살짝) */
function drawHead(ctx: CanvasRenderingContext2D, cx: number, top: number, r: number) {
  ctx.fillStyle = "#e9c3a0";
  ctx.fillRect(cx - r * 0.38, top + r * 1.6, r * 0.76, r * 0.7);
  ctx.beginPath();
  ctx.ellipse(cx, top + r, r * 0.86, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2b2420";
  ctx.beginPath();
  ctx.ellipse(cx, top + r * 0.62, r * 0.9, r * 0.66, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - r * 0.9, top + r * 0.6, r * 0.18, r * 0.5);
  ctx.fillRect(cx + r * 0.72, top + r * 0.6, r * 0.18, r * 0.5);
}

/**
 * 사진이 오기 전 세워 두는 정장 차림 전신 실루엣 (PRD 4.8).
 * wave면 오른손을 들어 환영하는 자세. 배경은 투명.
 */
export function suitFigureTexture(wave: boolean): THREE.CanvasTexture {
  const W = 256;
  const H = 640;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const cx = W / 2;
  const suit = "#1f2a44";
  const suitLight = "#2c3b5e";
  // 다리와 구두
  rr(ctx, cx - 44, 360, 40, 250, 10, "#18213a");
  rr(ctx, cx + 4, 360, 40, 250, 10, "#18213a");
  rr(ctx, cx - 50, 600, 50, 24, 10, "#111");
  rr(ctx, cx + 2, 600, 50, 24, 10, "#111");
  // 몸통(재킷)
  const g = ctx.createLinearGradient(cx - 70, 0, cx + 70, 0);
  g.addColorStop(0, suit);
  g.addColorStop(0.5, suitLight);
  g.addColorStop(1, suit);
  rr(ctx, cx - 68, 140, 136, 250, 26, "");
  ctx.fillStyle = g;
  ctx.fill();
  // 셔츠와 넥타이 (V자)
  ctx.fillStyle = "#f7f7f5";
  ctx.beginPath();
  ctx.moveTo(cx - 26, 140);
  ctx.lineTo(cx + 26, 140);
  ctx.lineTo(cx, 235);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#7a1f2b";
  ctx.beginPath();
  ctx.moveTo(cx - 8, 148);
  ctx.lineTo(cx + 8, 148);
  ctx.lineTo(cx + 11, 222);
  ctx.lineTo(cx, 236);
  ctx.lineTo(cx - 11, 222);
  ctx.closePath();
  ctx.fill();
  // 단추
  ctx.fillStyle = "#0f1526";
  for (const y of [262, 300]) {
    ctx.beginPath();
    ctx.arc(cx, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 왼팔(내림)
  rr(ctx, cx - 92, 150, 34, 210, 16, suit);
  ctx.fillStyle = "#e9c3a0";
  ctx.beginPath();
  ctx.arc(cx - 75, 368, 15, 0, Math.PI * 2);
  ctx.fill();
  // 오른팔
  if (wave) {
    ctx.save();
    ctx.translate(cx + 66, 168);
    ctx.rotate(-2.55);
    rr(ctx, -17, 0, 34, 150, 16, suit);
    ctx.fillStyle = "#e9c3a0";
    ctx.beginPath();
    ctx.ellipse(0, 166, 16, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    rr(ctx, cx + 58, 150, 34, 210, 16, suit);
    ctx.fillStyle = "#e9c3a0";
    ctx.beginPath();
    ctx.arc(cx + 75, 368, 15, 0, Math.PI * 2);
    ctx.fill();
  }
  drawHead(ctx, cx, 30, 52);
  const tex = finish(canvas);
  tex.anisotropy = 4;
  return tex;
}

/** 부스 담당자 실루엣: 머리부터 허리까지, 존 색 조끼와 이름표 */
export function staffPlaceholderTexture(color: string): THREE.CanvasTexture {
  const W = 256;
  const H = 300;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const cx = W / 2;
  // 셔츠
  rr(ctx, cx - 92, 128, 184, 200, 40, "#f4f1ec");
  // 조끼
  rr(ctx, cx - 92, 128, 64, 200, 30, color);
  rr(ctx, cx + 28, 128, 64, 200, 30, color);
  // 이름표
  rr(ctx, cx + 38, 190, 44, 26, 4, "#ffffff");
  ctx.fillStyle = shade(color, -0.25);
  ctx.fillRect(cx + 42, 196, 36, 4);
  ctx.fillRect(cx + 42, 204, 24, 4);
  drawHead(ctx, cx, 6, 56);
  return finish(canvas);
}

/** 말풍선 (입구 환영 인사) */
export function bubbleTexture(text: string): THREE.CanvasTexture {
  const W = 512;
  const H = 200;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  rr(ctx, 8, 8, W - 16, H - 60, 60, "#ffffff");
  ctx.beginPath();
  ctx.moveTo(W * 0.3, H - 56);
  ctx.lineTo(W * 0.24, H - 8);
  ctx.lineTo(W * 0.42, H - 56);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#3b2a1a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitFont(ctx, text, 800, 62, W - 80);
  ctx.fillText(text, W / 2, (H - 52) / 2 + 4);
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
  // 콘크리트 얼룩 (이음매 없이 반복)
  const img = ctx.getImageData(0, 0, size, size);
  const coarse = tileNoise(8, 5);
  const fine = tileNoise(64, 9);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = (coarse(x / size, y / size) - 0.5) * 14 + (fine(x / size, y / size) - 0.5) * 8;
      const i = (y * size + x) * 4;
      img.data[i] += d;
      img.data[i + 1] += d;
      img.data[i + 2] += d;
    }
  }
  ctx.putImageData(img, 0, 0);
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
