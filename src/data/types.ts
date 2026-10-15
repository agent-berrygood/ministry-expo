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

/**
 * 교역자가 서는 자리 (PRD 4.10). booth가 있으면 그 부스 데스크(조리대) 뒤,
 * desk가 있으면 x·z에 그 존의 안내석을 두고 그 뒤, 둘 다 없으면 x·z 좌표(허리를 가릴 물건 뒤여야 한다).
 * photos/_clergy/{id}_{이름 직분}.png 사진이 이 자리에 선다.
 */
export interface FigureSpot {
  id: string;
  booth?: string;
  /** booth 기준 데스크 뒤 가로 위치(부스 로컬 x, m) */
  offset?: number;
  /** 이 존의 안내석(카테고리 담당 교역자) */
  desk?: string;
  x?: number;
  z?: number;
}

export interface Layout {
  booths: Record<string, BoothPlacement>;
  nodes: NavNode[];
  figures: {
    entrance: { x: number; z: number };
    clergy: FigureSpot[];
  };
}

/** photos/에서 자동 생성되는 인물 사진 목록 (public/data/figures.json) */
export interface FigureImage {
  src: string;
  /** 가로 ÷ 세로 */
  aspect: number;
  caption: string;
}

export interface FigureManifest {
  staff: Record<string, FigureImage>;
  entrance: FigureImage | null;
  /** 자리 ID → 사진 */
  clergy: Record<string, FigureImage>;
}

export interface ExpoData {
  zones: Zone[];
  booths: Booth[];
  layout: Layout;
  figures: FigureManifest;
}
