import type { NavNode } from "../data/types";

export class NavGraph {
  private byId = new Map<string, NavNode>();

  constructor(nodes: NavNode[]) {
    for (const n of nodes) this.byId.set(n.id, n);
  }

  get(id: string): NavNode {
    const n = this.byId.get(id);
    if (!n) throw new Error(`알 수 없는 이동 지점: ${id}`);
    return n;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  neighbors(id: string): NavNode[] {
    return this.get(id).links.map((l) => this.get(l));
  }
}

/** a에서 b를 바라보는 yaw(라디안). 0 = −z, 반시계 방향이 + */
export function yawBetween(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
}

export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
