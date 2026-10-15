import { BOOTH } from "../config";
import type { ExpoIndex } from "../data/load";
import { events } from "../events";
import { navigate } from "../router";
import { h } from "./dom";

/** 평면도(북쪽이 위). 현재 위치와 바라보는 방향을 그린다. 3D 객체는 쓰지 않는다. */
export class Minimap {
  readonly el = h("div", { class: "minimap", role: "button", "aria-label": "미니맵: 누른 곳 근처로 이동" });
  private canvas = h("canvas");
  private ctx: CanvasRenderingContext2D;
  private pose = { x: 0, z: 0, yaw: 0 };
  private bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  private scale = 1;
  private ox = 0;
  private oz = 0;

  constructor(root: HTMLElement, private index: ExpoIndex) {
    this.el.append(this.canvas);
    root.append(this.el);
    this.ctx = this.canvas.getContext("2d")!;
    const xs: number[] = [];
    const zs: number[] = [];
    for (const n of index.data.layout.nodes) {
      xs.push(n.x);
      zs.push(n.z);
    }
    for (const p of Object.values(index.data.layout.booths)) {
      xs.push(p.x);
      zs.push(p.z);
    }
    this.bounds = { minX: Math.min(...xs) - 6, maxX: Math.max(...xs) + 6, minZ: Math.min(...zs) - 5, maxZ: Math.max(...zs) + 3 };

    events.on("nav:pose", (p) => {
      this.pose = p;
      this.draw();
    });
    this.el.addEventListener("click", (e) => this.onClick(e));
    new ResizeObserver(() => this.resize()).observe(this.el);
  }

  private resize(): void {
    const r = this.el.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    const b = this.bounds;
    const pad = 8 * dpr;
    this.scale = Math.min((this.canvas.width - pad * 2) / (b.maxX - b.minX), (this.canvas.height - pad * 2) / (b.maxZ - b.minZ));
    this.ox = (this.canvas.width - (b.maxX - b.minX) * this.scale) / 2 - b.minX * this.scale;
    this.oz = (this.canvas.height - (b.maxZ - b.minZ) * this.scale) / 2 - b.minZ * this.scale;
    this.draw();
  }

  private toPx(x: number, z: number): [number, number] {
    return [this.ox + x * this.scale, this.oz + z * this.scale];
  }

  private draw(): void {
    const { ctx } = this;
    const { layout } = this.index.data;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 통로
    ctx.strokeStyle = "rgba(120,105,85,0.35)";
    ctx.lineWidth = Math.max(2, this.scale * 2.5);
    ctx.lineCap = "round";
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    ctx.beginPath();
    for (const n of layout.nodes) {
      if (n.booth) continue;
      for (const l of n.links) {
        const m = byId.get(l);
        if (!m || m.booth || l < n.id) continue;
        ctx.moveTo(...this.toPx(n.x, n.z));
        ctx.lineTo(...this.toPx(m.x, m.z));
      }
    }
    ctx.stroke();

    // 부스
    for (const b of this.index.data.booths) {
      const p = layout.booths[b.id];
      if (!p) continue;
      const size = BOOTH[b.size];
      const [x, y] = this.toPx(p.x - size.w / 2, p.z - size.d / 2);
      ctx.fillStyle = this.index.zoneOf(b).color;
      ctx.fillRect(x, y, size.w * this.scale - 1, size.d * this.scale);
    }

    // 현재 위치 + 시야
    const [cx, cy] = this.toPx(this.pose.x, this.pose.z);
    const r = 12 * Math.min(devicePixelRatio, 2);
    const dir = Math.atan2(-Math.cos(this.pose.yaw), -Math.sin(this.pose.yaw));
    ctx.fillStyle = "rgba(124,58,237,0.25)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r * 1.8, dir - 0.55, dir + 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7c3aed";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private onClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const k = this.canvas.width / rect.width;
    const x = ((e.clientX - rect.left) * k - this.ox) / this.scale;
    const z = ((e.clientY - rect.top) * k - this.oz) / this.scale;

    // 부스 가까이를 누르면 그 부스로, 아니면 가장 가까운 통로 지점으로
    let bestBooth: string | null = null;
    let bestD = 5;
    for (const [id, p] of Object.entries(this.index.data.layout.booths)) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        bestBooth = id;
      }
    }
    if (bestBooth) return navigate({ type: "booth", id: bestBooth });

    let bestNode: string | null = null;
    bestD = Infinity;
    for (const n of this.index.data.layout.nodes) {
      if (n.booth) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bestD) {
        bestD = d;
        bestNode = n.id;
      }
    }
    if (bestNode) {
      navigate({ type: "home" });
      events.emit("nav:goto", { nodeId: bestNode });
    }
  }
}
