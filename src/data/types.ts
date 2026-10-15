// PRD 5장 데이터 스키마와 1:1로 맞춘다. 스키마를 바꾸면 PRD를 먼저 고친다.

export type ZoneId =
  | "worship"
  | "mission"
  | "edu1"
  | "edu2"
  | "youth"
  | "care"
  | "sharing"
  | "support";

export interface Zone {
  id: ZoneId;
  name: string;
  color: string;
  order: number;
  entryNode: string;
}

export type BoothTemplate = "standard" | "stall";
export type BoothSize = "standard" | "wide";
export type BoothProp =
  | "none"
  | "music"
  | "globe"
  | "book"
  | "heart"
  | "cross"
  | "meal"
  | "car"
  | "pray"
  | "gift";

export interface Booth {
  id: string;
  zone: ZoneId;
  name: string;
  parent: string | null;
  tagline: string;
  description: string;
  audience: string;
  schedule: string;
  video: string;
  joinUrl: string;
  template: BoothTemplate;
  size: BoothSize;
  prop: BoothProp;
}

export interface BoothPlacement {
  x: number;
  z: number;
  /** 도 단위. 0이면 부스 정면이 +z(남쪽)를 본다. */
  rotY: number;
}

export interface NavNode {
  id: string;
  x: number;
  z: number;
  /** 도 단위. 0이면 −z(북쪽)를 보고, 값이 커지면 반시계 방향(위에서 볼 때)으로 돈다. */
  yaw: number;
  links: string[];
  booth?: string;
}

export interface Layout {
  booths: Record<string, BoothPlacement>;
  nodes: NavNode[];
}

export interface ExpoData {
  zones: Zone[];
  booths: Booth[];
  layout: Layout;
}
