// 크기·시간·각도 같은 숫자는 모두 여기에 모은다 (PRD 9.1).

export const EYE_HEIGHT = 1.6;

export const CAMERA = {
  fovPortrait: 75,
  fovLandscape: 60,
  near: 0.1,
  far: 400,
};

export const LOOK = {
  /** 드래그 1px당 회전량(라디안) */
  dragSpeed: 0.0045,
  pitchMin: (-30 * Math.PI) / 180,
  pitchMax: (20 * Math.PI) / 180,
  keyTurn: (15 * Math.PI) / 180,
  /** 기본 시선: 바닥 화살표가 보이도록 살짝 내려다본다 */
  basePitch: (-8 * Math.PI) / 180,
  /** 이 거리(px)보다 적게 움직이면 클릭으로 본다 */
  clickSlop: 6,
};

export const MOVE = {
  duration: 0.8,
  /** 먼 거리 순간 이동(미니맵·목록·딥링크)일 때 */
  longDuration: 1.4,
  longDistance: 20,
  /** 바닥 클릭 시 이 각도 안에 있는 연결 지점으로만 이동 */
  groundClickMaxAngle: (60 * Math.PI) / 180,
  /** 이보다 가까운 이웃은 화살표 없이 건너뛰고 그 다음 지점을 가리킨다 */
  passThroughDistance: 2,
  /** 방향 차이가 이보다 작은 화살표는 하나로 합친다 */
  arrowMergeAngle: (25 * Math.PI) / 180,
  /** 이보다 가까운 부스 시점으로 가는 화살표는 부스 건물 쪽을 가리킨다 */
  boothAimDistance: 3,
};

export const ARROW = {
  distance: 3.0,
  size: 0.55,
  /** 바닥 깔개(입구 카펫 최고 0.05m)보다 위에 둔다 */
  y: 0.08,
};

export const BOOTH = {
  standard: { w: 4, d: 3, h: 3 },
  wide: { w: 8, d: 5, h: 3.2 },
  wallThickness: 0.12,
};

export const STEAM = {
  particles: 24,
  rise: 1.1,
  activeDistance: 25,
};

/** 질감 아틀라스: 칸 위치(UV)와 무늬 한 칸의 실제 크기(m) */
export const SURFACE = {
  tiles: {
    paint: [0, 0],
    wood: [0.5, 0],
    fabric: [0, 0.5],
    stone: [0.5, 0.5],
  } as Record<"paint" | "wood" | "fabric" | "stone", [number, number]>,
  scale: { paint: 1.5, wood: 1.2, fabric: 0.6, stone: 2 },
};

export const LIGHT = {
  exposure: 1.0,
  environment: 0.45,
  hemisphere: 1.15,
  sun: 2.5,
};

/** 데스크톱 후처리 */
export const POST = {
  aoIntensity: 0.85,
  aoRadius: 0.6,
  bloomStrength: 0.4,
  bloomRadius: 0.5,
  /** 햇빛 받은 흰 면(HDR 1 안팎)은 넘지 않고 전구(2.4배)만 넘도록 */
  bloomThreshold: 1.6,
  /** 전구처럼 빛나는 재질의 밝기 배수 (1보다 크면 블룸이 걸린다) */
  emissiveBoost: 2.4,
};

/** 사진 인물 (PRD 4.8~4.10). 부스 기준 위치는 부스 로컬 좌표(정면 +z) */
export const FIGURE = {
  fullHeight: 1.76,
  /** 담당자 사진(머리~허리)의 위·아래 끝 높이. 아래 끝은 데스크 상판(1.11 m)에 가려진다 */
  staffTop: 1.74,
  staffBottom: 0.82,
  staffStandard: { x: 0.95, zFromFront: -1.5 },
  staffStall: { x: 0.2, zFromFront: -1.85 },
  /** 실루엣 텍스처 비율 (가로 ÷ 세로) */
  suitAspect: 256 / 640,
  staffAspect: 256 / 300,
  /** 사진 밝기 (1 = 원본). 톤 매핑으로 살짝 어두워지는 것을 보정 */
  brightness: 1.05,
};

export const DECOR = {
  trussY: 5.6,
  /** 통로 중심에서 트러스 레일까지 */
  trussHalfWidth: 2.3,
  crossEvery: 5,
  flagSpacing: 0.55,
  blobY: 0.035,
  /** 이동 지점에서 이 거리 안에는 사람을 세우지 않는다 */
  personKeepOut: 1.2,
  /** 부스 앞 손님 수 확률: 0명 / 1명 (나머지는 2명) */
  visitorNone: 0.6,
  visitorOne: 0.32,
  /** 통로를 오가는 사람 간격(m): gap + 0~gap */
  walkerGap: 8,
  flagColors: [0xf97316, 0xfacc15, 0x22c55e, 0x0ea5e9, 0xa855f7, 0xec4899, 0xfffaf0],
  shirtColors: [0xe76f51, 0xf4a261, 0x2a9d8f, 0x457b9d, 0xe9c46a, 0x8ecae6, 0xb5838d, 0x6d6875, 0xffffff, 0x90be6d],
  skinColors: [0xf1c27d, 0xe0ac69, 0xf6d5b8, 0xd8a47f],
};

export const COLORS = {
  sky: 0xf1ece4,
  skyTop: "#a9c8e2",
  skyHorizon: "#f1ece4",
  ground: "#e4e0da",
  groundLine: "#c9c3ba",
  street: 0xd8b48f,
  streetEdge: 0xb98a63,
  wall: 0xfbfaf7,
  wood: 0xb07a4a,
  woodDark: 0x7a5232,
  arrow: 0xffffff,
  lantern: 0xffd27a,
};
