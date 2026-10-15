import type { Booth, ExpoData, FigureManifest, Layout, Zone } from "./types";

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!res.ok) throw new Error(`${file} 불러오기 실패 (${res.status})`);
  return (await res.json()) as T;
}

export async function loadExpoData(): Promise<ExpoData> {
  const [zones, booths, layout, figures] = await Promise.all([
    getJson<Zone[]>("zones.json"),
    getJson<Booth[]>("booths.json"),
    getJson<Layout>("layout.json"),
    // 생성물이라 없을 수 있다. 없으면 모든 자리에 실루엣이 선다.
    getJson<FigureManifest>("figures.json").catch((): FigureManifest => ({ staff: {}, entrance: null, clergy: {} })),
  ]);
  zones.sort((a, b) => a.order - b.order);
  return { zones, booths, layout, figures };
}

export class ExpoIndex {
  readonly zoneById = new Map<string, Zone>();
  readonly boothById = new Map<string, Booth>();
  readonly boothNode = new Map<string, string>();

  constructor(readonly data: ExpoData) {
    for (const z of data.zones) this.zoneById.set(z.id, z);
    for (const b of data.booths) this.boothById.set(b.id, b);
    for (const n of data.layout.nodes) if (n.booth) this.boothNode.set(n.booth, n.id);
  }

  zoneOf(booth: Booth): Zone {
    const zone = this.zoneById.get(booth.zone);
    if (!zone) throw new Error(`알 수 없는 존: ${booth.zone}`);
    return zone;
  }

  childrenOf(boothId: string): Booth[] {
    return this.data.booths.filter((b) => b.parent === boothId);
  }

  boothsInZone(zoneId: string): Booth[] {
    return this.data.booths.filter((b) => b.zone === zoneId);
  }
}
