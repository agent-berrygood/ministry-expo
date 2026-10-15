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
  passThroughDistance: 1.5,
  /** 방향 차이가 이보다 작은 화살표는 하나로 합친다 */
  arrowMergeAngle: (25 * Math.PI) / 180,
  /** 이보다 가까운 부스 시점으로 가는 화살표는 부스 건물 쪽을 가리킨다 */
  boothAimDistance: 3,
};

export const ARROW = {
  distance: 3.0,
  size: 0.55,
  /** 통로 바닥(최고 0.022m)보다 위에 둔다 */
  y: 0.05,
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

export const COLORS = {
  sky: 0xf4efe6,
  ground: 0xe9e3d8,
  street: 0xd9d1c3,
  wall: 0xfbfaf7,
  wood: 0xb07a4a,
  woodDark: 0x7a5232,
  arrow: 0xffffff,
  lantern: 0xffd27a,
};
