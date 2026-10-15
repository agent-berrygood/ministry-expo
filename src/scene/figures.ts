import * as THREE from "three";
import { BOOTH, FIGURE } from "../config";
import type { ExpoIndex } from "../data/load";
import type { FigureImage } from "../data/types";
import type { BoothObject } from "./boothFactory";
import type { ShadowBlobs } from "./decor";
import { bubbleTexture, staffPlaceholderTexture, suitFigureTexture } from "./textures";

// 사진 인물 (PRD 4.8~4.10): 부스 담당자 · 입구 환영 · 숨은 목회자.
// 사진 한 장을 세운 판이 항상 방문자 쪽으로 돈다(세로축 빌보드). 부스는 정면·비스듬한 앞에서만 보므로 평면인 티가 거의 나지 않는다.

interface Billboard {
  mesh: THREE.Mesh;
  baseY: number;
  hop: number;
}

const loader = new THREE.TextureLoader();
const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

export class FigureLayer {
  readonly pickables: THREE.Object3D[] = [];
  private boards: Billboard[] = [];
  private hiddenById = new Map<string, Billboard>();
  private captions = new Map<string, string>();
  /** 실루엣 텍스처는 같은 종류끼리 한 장을 같이 쓴다 */
  private placeholders = new Map<string, THREE.Texture>();

  constructor(
    private scene: THREE.Scene,
    index: ExpoIndex,
    booths: Map<string, BoothObject>,
    blobs: ShadowBlobs,
  ) {
    const { figures: manifest, layout } = index.data;

    // 부스 담당자: 데스크 뒤
    for (const booth of index.data.booths) {
      const obj = booths.get(booth.id);
      if (!obj) continue;
      obj.group.updateMatrixWorld(true);
      const spot = booth.template === "stall" ? FIGURE.staffStall : FIGURE.staffStandard;
      const d = BOOTH[booth.size].d;
      const world = obj.group.localToWorld(new THREE.Vector3(spot.x, 0, d / 2 + spot.zFromFront));
      const photo = manifest.staff[booth.id];
      const height = FIGURE.staffTop - FIGURE.staffBottom;
      const board = this.place(world.x, FIGURE.staffBottom, world.z, height, photo, {
        key: `staff-${booth.zone}`,
        make: () => staffPlaceholderTexture(index.zoneOf(booth).color),
        aspect: FIGURE.staffAspect,
      });
      board.mesh.userData.boothId = booth.id;
      obj.pickables.push(board.mesh);
    }

    // 입구 환영
    const e = layout.figures.entrance;
    this.place(e.x, 0, e.z, FIGURE.fullHeight, manifest.entrance ?? undefined, {
      key: "suit-wave",
      make: () => suitFigureTexture(true),
      aspect: FIGURE.suitAspect,
    });
    blobs.add(e.x, e.z, 0.9, 0.9);
    const bubble = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.59).translate(0, 0.3, 0),
      new THREE.MeshBasicMaterial({ map: bubbleTexture("환영합니다!"), transparent: true, depthWrite: false }),
    );
    bubble.position.set(e.x + 0.55, FIGURE.fullHeight + 0.15, e.z);
    this.scene.add(bubble);
    this.boards.push({ mesh: bubble, baseY: bubble.position.y, hop: 0 });

    // 숨은 목회자: 사진이 있으면 사진 수만큼, 없으면 모든 자리에 실루엣
    const spots = layout.figures.hidden;
    const count = manifest.hidden.length > 0 ? Math.min(manifest.hidden.length, spots.length) : spots.length;
    for (let i = 0; i < count; i++) {
      const spot = spots[i];
      const photo = manifest.hidden[i];
      const board = this.place(spot.x, 0, spot.z, FIGURE.fullHeight, photo, {
        key: "suit",
        make: () => suitFigureTexture(false),
        aspect: FIGURE.suitAspect,
      });
      board.mesh.userData.figureId = spot.id;
      this.pickables.push(board.mesh);
      this.hiddenById.set(spot.id, board);
      this.captions.set(spot.id, photo?.caption ?? "");
      blobs.add(spot.x, spot.z, 0.9, 0.9);
    }
  }

  get hiddenIds(): string[] {
    return [...this.hiddenById.keys()];
  }

  /** 찾았을 때 보여 줄 이름 (사진 파일명에서). 없으면 빈 문자열 */
  captionOf(id: string): string {
    return this.captions.get(id) ?? "";
  }

  /** 찾은 사람이 살짝 뛰어오른다 */
  celebrate(id: string): void {
    const b = this.hiddenById.get(id);
    if (b) b.hop = 1;
  }

  update(dt: number, camera: THREE.Vector3): void {
    for (const b of this.boards) {
      const m = b.mesh;
      m.rotation.y = Math.atan2(camera.x - m.position.x, camera.z - m.position.z);
      if (b.hop > 0) {
        b.hop = Math.max(0, b.hop - dt * 1.6);
        const t = 1 - b.hop;
        m.position.y = b.baseY + Math.abs(Math.sin(t * Math.PI * 2)) * 0.35 * b.hop;
      }
    }
  }

  private place(
    x: number,
    y: number,
    z: number,
    height: number,
    photo: FigureImage | undefined,
    placeholder: { key: string; make: () => THREE.Texture; aspect: number },
  ): Billboard {
    const mat = new THREE.MeshBasicMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
    mat.color.setScalar(FIGURE.brightness);
    const mesh = new THREE.Mesh(quad, mat);
    mesh.position.set(x, y, z);
    const setTexture = (tex: THREE.Texture, aspect: number) => {
      mat.map = tex;
      mat.needsUpdate = true;
      mesh.scale.set(height * aspect, height, 1);
    };
    if (photo) {
      mesh.scale.set(height * photo.aspect, height, 1);
      loader.load(`${import.meta.env.BASE_URL}${photo.src}`, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        setTexture(tex, photo.aspect);
      });
    } else {
      let tex = this.placeholders.get(placeholder.key);
      if (!tex) {
        tex = placeholder.make();
        this.placeholders.set(placeholder.key, tex);
      }
      setTexture(tex, placeholder.aspect);
    }
    this.scene.add(mesh);
    const board = { mesh, baseY: y, hop: 0 };
    this.boards.push(board);
    return board;
  }
}

