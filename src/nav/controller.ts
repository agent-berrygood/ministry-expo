import * as THREE from "three";
import { ARROW, COLORS, EYE_HEIGHT, LOOK, MOVE } from "../config";
import { events } from "../events";
import type { NavNode } from "../data/types";
import type { World } from "../scene/world";
import { NavGraph, angleDiff, yawBetween } from "./graph";

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

interface Tween {
  from: THREE.Vector3;
  to: THREE.Vector3;
  yawFrom: number;
  yawTo: number;
  pitchFrom: number;
  pitchTo: number;
  t: number;
  duration: number;
  target: string;
}

export class NavController {
  private current: string;
  private yaw = 0;
  private pitch = LOOK.basePitch;
  private tween: Tween | null = null;
  private arrows = new THREE.Group();
  private arrowPickables: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private drag: { id: number; x: number; y: number; moved: number } | null = null;
  private lastPose = { x: NaN, z: NaN, yaw: NaN };
  private arrowGeo: THREE.ShapeGeometry;
  private arrowMat: THREE.MeshBasicMaterial;
  private arrowHoverMat: THREE.MeshBasicMaterial;
  private hitGeo = new THREE.CircleGeometry(0.85, 16);
  // 밝은 바닥에서도 화살표가 보이도록 어두운 반투명 원판을 깐다 (클릭 영역 겸용)
  private hitMat = new THREE.MeshBasicMaterial({ color: 0x1f1a14, transparent: true, opacity: 0.32, depthWrite: false });

  constructor(private world: World, private graph: NavGraph, start: string) {
    this.current = start;
    const n = graph.get(start);
    this.yaw = THREE.MathUtils.degToRad(n.yaw);
    world.camera.position.set(n.x, EYE_HEIGHT, n.z);
    world.scene.add(this.arrows);

    this.arrowGeo = makeChevron(ARROW.size);
    this.arrowMat = new THREE.MeshBasicMaterial({ color: COLORS.arrow, transparent: true, opacity: 0.92, depthWrite: false });
    this.arrowHoverMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 1, depthWrite: false });

    this.buildArrows();
    this.bindInput(world.renderer.domElement);
    world.onTick((dt) => this.tick(dt));
    events.on("nav:goto", ({ nodeId }) => this.goTo(nodeId));
  }

  get node(): string {
    return this.current;
  }

  /** 애니메이션 없이 바로 옮긴다 (딥링크 첫 진입용) */
  jumpTo(id: string): void {
    const n = this.graph.get(id);
    this.tween = null;
    this.current = id;
    this.yaw = THREE.MathUtils.degToRad(n.yaw);
    // 부스 앞에서는 부스를 정면으로, 통로에서는 바닥 화살표가 보이게 살짝 내려다본다
    this.pitch = n.booth ? 0 : LOOK.basePitch;
    this.world.camera.position.set(n.x, EYE_HEIGHT, n.z);
    this.buildArrows();
    events.emit("nav:arrive", { nodeId: id });
  }

  goTo(id: string): void {
    if (this.tween || !this.graph.has(id)) return;
    if (id === this.current) {
      const n = this.graph.get(id);
      if (n.booth) this.startTween(id, THREE.MathUtils.degToRad(n.yaw), MOVE.duration * 0.6);
      events.emit("nav:arrive", { nodeId: id });
      return;
    }
    const from = this.graph.get(this.current);
    const to = this.graph.get(id);
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    // 부스 앞에서는 부스를 보고, 통로에서는 가던 방향을 유지한다
    const yawTo = to.booth ? THREE.MathUtils.degToRad(to.yaw) : dist > 0.01 ? yawBetween(from, to) : this.yaw;
    const isNeighbor = from.links.includes(id);
    const duration = !isNeighbor && dist > MOVE.longDistance ? MOVE.longDuration : MOVE.duration;
    this.startTween(id, yawTo, duration);
  }

  private startTween(id: string, yawTo: number, duration: number): void {
    const to = this.graph.get(id);
    this.arrows.visible = false;
    this.tween = {
      from: this.world.camera.position.clone(),
      to: new THREE.Vector3(to.x, EYE_HEIGHT, to.z),
      yawFrom: this.yaw,
      yawTo: this.yaw + angleDiff(this.yaw, yawTo),
      pitchFrom: this.pitch,
      pitchTo: to.booth ? 0 : LOOK.basePitch,
      t: 0,
      duration,
      target: id,
    };
  }

  private tick(dt: number): void {
    const cam = this.world.camera;
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      const k = easeInOut(tw.t);
      cam.position.lerpVectors(tw.from, tw.to, k);
      this.yaw = tw.yawFrom + (tw.yawTo - tw.yawFrom) * k;
      this.pitch = tw.pitchFrom + (tw.pitchTo - tw.pitchFrom) * k;
      if (tw.t >= 1) {
        this.tween = null;
        this.current = tw.target;
        this.buildArrows();
        events.emit("nav:arrive", { nodeId: tw.target });
      }
    }
    cam.rotation.set(this.pitch, this.yaw, 0);

    const pose = { x: cam.position.x, z: cam.position.z, yaw: this.yaw };
    if (pose.x !== this.lastPose.x || pose.z !== this.lastPose.z || pose.yaw !== this.lastPose.yaw) {
      this.lastPose = pose;
      events.emit("nav:pose", pose);
    }
  }

  private buildArrows(): void {
    // 화살표 도형과 재질은 모두 공유하므로 그룹만 비운다
    this.arrows.clear();
    this.arrowPickables = [];
    const here = this.graph.get(this.current);
    for (const next of this.targets()) {
      const yaw = this.directionTo(here, next);
      const holder = new THREE.Group();
      holder.position.set(here.x - Math.sin(yaw) * ARROW.distance, ARROW.y, here.z - Math.cos(yaw) * ARROW.distance);
      holder.rotation.y = yaw;
      const arrow = new THREE.Mesh(this.arrowGeo, this.arrowMat);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.z = 0.08;
      arrow.renderOrder = 10;
      const hit = new THREE.Mesh(this.hitGeo, this.hitMat);
      hit.rotation.x = -Math.PI / 2;
      hit.position.y = -0.005;
      hit.renderOrder = 9;
      hit.userData.toNode = next.id;
      hit.userData.arrow = arrow;
      holder.add(arrow, hit);
      this.arrows.add(holder);
      this.arrowPickables.push(hit);
    }
    this.arrows.visible = true;
  }

  // ---------- 입력 ----------

  private bindInput(el: HTMLCanvasElement): void {
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (e) => {
      if (this.drag) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (this.drag && this.drag.id === e.pointerId) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        if (this.drag.moved > LOOK.clickSlop && !this.tween) {
          this.yaw += dx * LOOK.dragSpeed;
          this.pitch = THREE.MathUtils.clamp(this.pitch + dy * LOOK.dragSpeed, LOOK.pitchMin, LOOK.pitchMax);
          el.style.cursor = "grabbing";
        }
        return;
      }
      if (e.pointerType === "mouse") this.hover(e, el);
    });
    const end = (e: PointerEvent) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const wasClick = this.drag.moved <= LOOK.clickSlop;
      this.drag = null;
      el.style.cursor = "";
      if (wasClick && e.type === "pointerup") this.click(e, el);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("pointerleave", () => {
      if (!this.drag) this.world.setHover(null);
    });

    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [role=dialog]")) return;
      if (this.tween) return;
      if (e.key === "ArrowLeft") this.yaw += LOOK.keyTurn;
      else if (e.key === "ArrowRight") this.yaw -= LOOK.keyTurn;
      else if (e.key === "ArrowUp") this.moveToward(this.yaw, Math.PI / 2);
      else if (e.key === "ArrowDown") this.moveToward(this.yaw + Math.PI, Math.PI / 2);
      else return;
      e.preventDefault();
    });
  }

  private setPointer(e: PointerEvent, el: HTMLElement): void {
    const r = el.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.world.camera);
  }

  private hover(e: PointerEvent, el: HTMLElement): void {
    if (this.tween) return;
    this.setPointer(e, el);
    const arrowHit = this.arrows.visible ? this.raycaster.intersectObjects(this.arrowPickables, false)[0] : undefined;
    for (const h of this.arrowPickables) ((h.userData.arrow as THREE.Mesh).material = this.arrowMat);
    if (arrowHit) {
      (arrowHit.object.userData.arrow as THREE.Mesh).material = this.arrowHoverMat;
      this.world.setHover(null);
      el.style.cursor = "pointer";
      return;
    }
    const hit = this.raycaster.intersectObjects([...this.world.boothPickables, ...this.world.figures.pickables], false)[0];
    const id = (hit?.object.userData.boothId as string | undefined) ?? null;
    this.world.setHover(id);
    events.emit("booth:hover", { id });
    el.style.cursor = id || hit?.object.userData.figureId ? "pointer" : "";
  }

  private click(e: PointerEvent, el: HTMLElement): void {
    if (this.tween) return;
    this.setPointer(e, el);
    if (this.arrows.visible) {
      const a = this.raycaster.intersectObjects(this.arrowPickables, false)[0];
      if (a) return this.goTo(a.object.userData.toNode as string);
    }
    const hits = this.raycaster.intersectObjects([...this.world.boothPickables, ...this.world.figures.pickables, this.world.ground], false);
    const first = hits[0];
    if (!first) return;
    const figureId = first.object.userData.figureId as string | undefined;
    if (figureId) {
      events.emit("figure:click", { id: figureId });
      return;
    }
    const boothId = first.object.userData.boothId as string | undefined;
    if (boothId) {
      events.emit("booth:select", { id: boothId });
      return;
    }
    // 바닥 클릭: 그 방향에서 가장 가까운 연결 지점으로
    const here = this.graph.get(this.current);
    this.moveToward(yawBetween(here, { x: first.point.x, z: first.point.z }), MOVE.groundClickMaxAngle);
  }

  /**
   * 화살표를 띄울 이동 대상.
   * 부스 앞에 서 있을 때 바로 뒤의 통로 지점은 화살표가 헷갈리므로 건너뛰고, 그 통로 지점의 이웃을 직접 가리킨다.
   * 방향이 거의 같은 대상은 먼저 나온 것만 남긴다 (부스 이웃 → 통로 이웃 → 건너뛴 지점의 이웃 순).
   */
  private targets(): NavNode[] {
    const here = this.graph.get(this.current);
    const out: NavNode[] = [];
    const seen = new Set([here.id]);
    const push = (n: NavNode) => {
      if (seen.has(n.id)) return;
      seen.add(n.id);
      const yaw = this.directionTo(here, n);
      if (out.some((o) => Math.abs(angleDiff(this.directionTo(here, o), yaw)) < MOVE.arrowMergeAngle)) return;
      out.push(n);
    };
    const near: NavNode[] = [];
    // 부스 쪽 이웃을 먼저 넣어서, 방향이 겹치면 부스 화살표가 남게 한다
    const neighbors = [...this.graph.neighbors(here.id)].sort((a, b) => Number(!!b.booth) - Number(!!a.booth));
    for (const n of neighbors) {
      const close = Math.hypot(n.x - here.x, n.z - here.z) < MOVE.passThroughDistance;
      if (here.booth && !n.booth && close) near.push(n);
      else push(n);
    }
    for (const n of near) {
      seen.add(n.id);
      for (const m of this.graph.neighbors(n.id)) push(m);
    }
    return out;
  }

  /**
   * 화살표 방향. 맞은편 부스처럼 대상 시점이 아주 가까우면(시점끼리 엇갈려 있음)
   * 시점 위치 대신 부스 건물 쪽을 가리켜야 헷갈리지 않는다.
   */
  private directionTo(here: NavNode, n: NavNode): number {
    const close = Math.hypot(n.x - here.x, n.z - here.z) < MOVE.boothAimDistance;
    const booth = n.booth && close ? this.world.booths.get(n.booth)?.group.position : undefined;
    return yawBetween(here, booth ?? n);
  }

  private moveToward(yaw: number, maxAngle: number): void {
    const here = this.graph.get(this.current);
    let best: string | null = null;
    let bestDiff = maxAngle;
    for (const n of this.targets()) {
      const diff = Math.abs(angleDiff(yaw, this.directionTo(here, n)));
      if (diff < bestDiff) {
        bestDiff = diff;
        best = n.id;
      }
    }
    if (best) this.goTo(best);
  }
}

/** 바닥에 눕힐 화살표(갈매기 모양). 로컬 +y가 진행 방향이고 눕히면 −z가 된다. */
function makeChevron(size: number): THREE.ShapeGeometry {
  const s = size;
  const shape = new THREE.Shape();
  shape.moveTo(0, s);
  shape.lineTo(s * 0.95, -s * 0.15);
  shape.lineTo(s * 0.62, -s * 0.48);
  shape.lineTo(0, s * 0.22);
  shape.lineTo(-s * 0.62, -s * 0.48);
  shape.lineTo(-s * 0.95, -s * 0.15);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
