import * as THREE from "three";
import { BOOTH, COLORS, FIGURE } from "../config";
import type { ExpoIndex } from "../data/load";
import type { FigureImage } from "../data/types";
import type { BoothObject } from "./boothFactory";
import { MeshBuilder, markBake, texturedPlane, vertexColorMaterial } from "./geometry";
import { signTexture, staffPlaceholderTexture, suitFigureTexture } from "./textures";

// 사진 인물 (PRD 4.8~4.10): 부스 담당자 · 입구 환영 · 교역자.
// 사진 한 장을 세운 판이 항상 방문자 쪽으로 돈다(세로축 빌보드).
// 교역자 사진은 허벅지에서 잘려 있으므로 모두 데스크·조리대·안내석 뒤에 세워 허리 아래를 가린다.

interface Billboard {
  mesh: THREE.Mesh;
}

const loader = new THREE.TextureLoader();
const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

export class FigureLayer {
  readonly pickables: THREE.Object3D[] = [];
  /** 굽기(lightmap)에 포함할 정적 소품 (입구 데스크, 광장 안내석) */
  readonly props: THREE.Object3D[] = [];
  private boards: Billboard[] = [];
  private captions = new Map<string, string>();
  private placeholders = new Map<string, THREE.Texture>();

  constructor(
    private scene: THREE.Scene,
    index: ExpoIndex,
    booths: Map<string, BoothObject>,
  ) {
    const { figures: manifest, layout } = index.data;

    // 부스 담당자(부장): 데스크 뒤 오른쪽
    for (const booth of index.data.booths) {
      const obj = booths.get(booth.id);
      if (!obj) continue;
      const spot = booth.template === "stall" ? FIGURE.staffStall : FIGURE.staffStandard;
      const world = this.behindDesk(obj, booth.size, spot.x, spot.zFromFront);
      const board = this.place(world.x, FIGURE.staffBottom, world.z, FIGURE.staffTop - FIGURE.staffBottom, manifest.staff[booth.id], {
        key: `staff-${booth.zone}`,
        make: () => staffPlaceholderTexture(index.zoneOf(booth).color),
        aspect: FIGURE.staffAspect,
      });
      board.mesh.userData.boothId = booth.id;
      obj.pickables.push(board.mesh);
    }

    // 입구: 담임목사님이 환영 데스크 뒤에서 맞이한다
    const e = layout.figures.entrance;
    this.addWelcomeDesk(e.x, e.z);
    const host = this.place(e.x, FIGURE.clergyBottom, e.z - 0.35, FIGURE.clergyTop - FIGURE.clergyBottom, manifest.entrance ?? undefined, {
      key: "suit-wave",
      make: () => suitFigureTexture(true),
      aspect: FIGURE.suitAspect,
    });
    this.tag(host, "entrance", manifest.entrance?.caption ?? "");

    // 교역자: 자리마다 사진이 있을 때만 선다
    let hasPlazaDesk = false;
    for (const spot of layout.figures.clergy) {
      const photo = manifest.clergy[spot.id];
      if (!photo) continue;
      let x: number;
      let z: number;
      if (spot.booth) {
        const obj = booths.get(spot.booth);
        const booth = index.boothById.get(spot.booth);
        if (!obj || !booth) continue;
        const zFromFront = booth.template === "stall" ? FIGURE.staffStall.zFromFront : FIGURE.staffStandard.zFromFront;
        const world = this.behindDesk(obj, booth.size, spot.offset ?? 0, zFromFront);
        x = world.x;
        z = world.z;
      } else {
        x = spot.x ?? 0;
        z = spot.z ?? 0;
        hasPlazaDesk = true;
      }
      const board = this.place(x, FIGURE.clergyBottom, z, FIGURE.clergyTop - FIGURE.clergyBottom, photo, {
        key: "suit",
        make: () => suitFigureTexture(false),
        aspect: FIGURE.suitAspect,
      });
      this.tag(board, spot.id, photo.caption);
    }
    if (hasPlazaDesk) this.addPlazaDesk(FIGURE.plazaDesk.x, FIGURE.plazaDesk.z);
  }

  /** 누르면 보여 줄 이름 ("오대식 목사"). 없으면 빈 문자열 */
  captionOf(id: string): string {
    return this.captions.get(id) ?? "";
  }

  update(camera: THREE.Vector3): void {
    for (const { mesh: m } of this.boards) m.rotation.y = Math.atan2(camera.x - m.position.x, camera.z - m.position.z);
  }

  private tag(board: Billboard, id: string, caption: string): void {
    board.mesh.userData.figureId = id;
    this.captions.set(id, caption);
    this.pickables.push(board.mesh);
  }

  /** 부스 로컬 좌표(데스크 뒤)를 월드 좌표로 */
  private behindDesk(obj: BoothObject, size: "standard" | "wide", x: number, zFromFront: number): THREE.Vector3 {
    obj.group.updateMatrixWorld(true);
    return obj.group.localToWorld(new THREE.Vector3(x, 0, BOOTH[size].d / 2 + zFromFront));
  }

  /** 입구 환영 데스크: 나무 상판 + 보라색 앞판 + "환영합니다" 간판 */
  private addWelcomeDesk(x: number, z: number): void {
    const b = new MeshBuilder();
    b.use("paint").rbox(1.5, 1.0, 0.55, x, 0.5, z, 0x7c3aed, 0.06);
    b.use("wood").rbox(1.62, 0.06, 0.66, x, 1.03, z, COLORS.wood, 0.02);
    b.use("paint").rbox(0.28, 0.3, 0.28, x + 0.55, 1.21, z - 0.05, 0xfffaf2, 0.04);
    b.sphere(0.2, x + 0.55, 1.5, z - 0.05, 0xf4a3b8);
    b.sphere(0.16, x + 0.42, 1.44, z + 0.02, 0xfff1c9);
    const desk = markBake(b.build(vertexColorMaterial()), "atlas", "welcome-desk");
    this.scene.add(desk);
    this.props.push(desk);
    const sign = texturedPlane(signTexture("환영합니다", "#7c3aed", { aspect: 1.3 / 0.34 }), 1.3, 0.34);
    sign.position.set(x, 0.62, z + 0.281);
    this.scene.add(sign);
  }

  /** 광장 원형 안내석: 어느 쪽에서 봐도 안쪽에 선 사람의 허리 아래를 가린다 */
  private addPlazaDesk(x: number, z: number): void {
    const b = new MeshBuilder();
    const ring = new THREE.LatheGeometry(
      [new THREE.Vector2(0.95, 0), new THREE.Vector2(1.25, 0), new THREE.Vector2(1.25, 1.0), new THREE.Vector2(0.95, 1.0)],
      40,
    );
    b.use("paint").add(ring, 0xf6f0e6, new THREE.Matrix4().makeTranslation(x, 0, z));
    b.use("wood").add(new THREE.RingGeometry(0.9, 1.32, 40).rotateX(-Math.PI / 2), COLORS.wood, new THREE.Matrix4().makeTranslation(x, 1.02, z));
    b.use("paint").add(new THREE.CylinderGeometry(1.27, 1.27, 0.08, 40, 1, true), 0x334155, new THREE.Matrix4().makeTranslation(x, 0.86, z));
    const desk = markBake(b.build(vertexColorMaterial({ side: THREE.DoubleSide })), "atlas", "plaza-desk");
    this.scene.add(desk);
    this.props.push(desk);
    const tex = signTexture("안내", "#334155", { aspect: 0.7 / 0.3 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const s = texturedPlane(tex, 0.7, 0.3);
      s.position.set(x + Math.sin(a) * 1.262, 0.55, z + Math.cos(a) * 1.262);
      s.rotation.y = a;
      this.scene.add(s);
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
        this.onLoad?.();
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
    const board = { mesh };
    this.boards.push(board);
    return board;
  }

  /** 사진 텍스처가 늦게 도착했을 때 다시 그리도록 알린다 */
  onLoad?: () => void;
}
