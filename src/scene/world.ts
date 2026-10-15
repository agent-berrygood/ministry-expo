import * as THREE from "three";
import { BOOTH, CAMERA, COLORS } from "../config";
import type { ExpoIndex } from "../data/load";
import { createBooth, type BoothObject } from "./boothFactory";
import { MeshBuilder, deg, texturedPlane, vertexColorMaterial } from "./geometry";
import { signTexture, tint } from "./textures";

export type TickFn = (dt: number) => void;

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly booths = new Map<string, BoothObject>();
  readonly boothPickables: THREE.Object3D[] = [];
  readonly ground: THREE.Mesh;
  private ticks: TickFn[] = [];
  private clock = new THREE.Clock();
  private hovered: string | null = null;
  readonly lowPower: boolean;

  constructor(private container: HTMLElement, private index: ExpoIndex) {
    this.lowPower = matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.lowPower || devicePixelRatio < 2 });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.lowPower ? 1.75 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !this.lowPower;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fovLandscape, 1, CAMERA.near, CAMERA.far);
    this.camera.rotation.order = "YXZ";

    this.scene.background = new THREE.Color(COLORS.sky);
    this.scene.fog = new THREE.Fog(COLORS.sky, 45, 130);

    this.addLights();
    this.ground = this.addGround();
    this.addStreets();
    this.addZoneFloorsAndBanners();
    this.addMadang();
    this.addEntranceGate();
    this.addPlaza();
    this.addBooths();

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  onTick(fn: TickFn): void {
    this.ticks.push(fn);
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.frame(Math.min(this.clock.getDelta(), 0.1)));
  }

  /** 한 프레임 진행 + 렌더. 애니메이션 루프가 부르고, 개발 중 수동 검증에도 쓴다. */
  frame(dt: number): void {
    for (const fn of this.ticks) fn(dt);
    for (const b of this.booths.values()) b.update?.(dt, this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  setHover(id: string | null): void {
    if (id === this.hovered) return;
    if (this.hovered) this.booths.get(this.hovered)?.setHover(false);
    this.hovered = id;
    if (id) this.booths.get(id)?.setHover(true);
  }

  /** 오른쪽이 UI로 가려질 때(데스크톱 패널) 그만큼 화면 중심을 왼쪽으로 옮긴다 */
  setRightInset(px: number): void {
    this.rightInset = px;
    this.resize();
  }

  private rightInset = 0;

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? CAMERA.fovPortrait : CAMERA.fovLandscape;
    if (this.rightInset > 0) this.camera.setViewOffset(w, h, this.rightInset / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xfff8ee, 0xcbbfa8, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-30, 50, 20);
    sun.target.position.set(0, 0, -40);
    if (this.renderer.shadowMap.enabled) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const s = sun.shadow.camera;
      s.left = -60;
      s.right = 60;
      s.top = 60;
      s.bottom = -60;
      s.far = 160;
      sun.shadow.bias = -0.0005;
    }
    this.scene.add(sun, sun.target);
  }

  private addGround(): THREE.Mesh {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -40;
    ground.receiveShadow = true;
    ground.userData.ground = true;
    this.scene.add(ground);
    return ground;
  }

  /** 노드 좌표로 통로를 깐다: 같은 z에 늘어선 지점은 동서 통로, x=0은 남북 대로 */
  private addStreets(): void {
    const nodes = this.index.data.layout.nodes.filter((n) => !n.booth);
    const rows = new Map<number, number[]>();
    for (const n of nodes) {
      if (n.x === 0) continue;
      rows.set(n.z, [...(rows.get(n.z) ?? []), n.x]);
    }
    const b = new MeshBuilder();
    for (const [z, xs] of rows) {
      const min = Math.min(...xs, 0) - 3.5;
      const max = Math.max(...xs, 0) + 3.5;
      b.box(max - min, 0.02, 4.2, (min + max) / 2, 0.01, z, COLORS.street);
    }
    const zs = nodes.filter((n) => n.x === 0).map((n) => n.z);
    const zMin = Math.min(...zs) - 3;
    b.box(4.2, 0.02, 3 - zMin, 0, 0.012, (3 + zMin) / 2, COLORS.street);
    // 대로변 화분 나무
    for (let z = -10; z > zMin + 4; z -= 9) {
      if ([-20, -48, -72].some((rz) => Math.abs(rz - z) < 4)) continue;
      for (const x of [-2.8, 2.8]) {
        b.cylinder(0.45, 0.35, 0.5, x, 0.25, z, 0xc9b79c);
        b.cylinder(0.08, 0.1, 1.2, x, 1.0, z, 0x7a5232, 6);
        b.sphere(0.75, x, 2.0, z, 0x7fb069);
      }
    }
    const mesh = b.build(vertexColorMaterial());
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);
  }

  private addZoneFloorsAndBanners(): void {
    const { layout } = this.index.data;
    const floors = new MeshBuilder();
    for (const zone of this.index.data.zones) {
      const booths = this.index.boothsInZone(zone.id).filter((bt) => bt.template === "standard");
      if (booths.length === 0) continue;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const bt of booths) {
        const p = layout.booths[bt.id];
        const { w, d } = BOOTH.standard;
        minX = Math.min(minX, p.x - w / 2 - 0.8);
        maxX = Math.max(maxX, p.x + w / 2 + 0.8);
        minZ = Math.min(minZ, p.z - d / 2 - 0.8);
        maxZ = Math.max(maxZ, p.z + d / 2 + 0.8);
      }
      floors.box(maxX - minX, 0.015, maxZ - minZ, (minX + maxX) / 2, 0.006, (minZ + maxZ) / 2, tint(zone.color, 0xffffff, 0.72));

      // 대로 쪽 끝에 존 배너 (통로 위를 가로지름)
      const entry = layout.nodes.find((n) => n.id === zone.entryNode);
      if (!entry) continue;
      const east = entry.x > 0;
      const bx = east ? minX - 0.6 : maxX + 0.6;
      this.addBanner(zone.name, zone.color, bx, entry.z, east ? deg(-90) : deg(90));
    }
    const mesh = floors.build(vertexColorMaterial());
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  /** 기둥 두 개 + 양면 현수막. rotY는 현수막 앞면이 보는 방향 */
  private addBanner(text: string, color: string, x: number, z: number, rotY: number, sub?: string): void {
    const g = new THREE.Group();
    const b = new MeshBuilder();
    for (const s of [-1, 1]) b.cylinder(0.08, 0.08, 4.4, s * 2.7, 2.2, 0, 0x4b4038, 8);
    b.box(5.6, 0.08, 0.08, 0, 4.36, 0, 0x4b4038);
    g.add(b.build(vertexColorMaterial()));
    const tex = signTexture(text, color, { aspect: 5.2 / 0.95, sub });
    for (const side of [0, Math.PI]) {
      const p = texturedPlane(tex, 5.2, 0.95);
      p.position.set(0, 3.8, side === 0 ? 0.03 : -0.03);
      p.rotation.y = side;
      g.add(p);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.scene.add(g);
  }

  private addMadang(): void {
    const node = this.index.data.layout.nodes.find((n) => n.id === "n-plaza-madang");
    if (!node) return;
    const b = new MeshBuilder();
    b.box(20, 0.016, 13, node.x, 0.008, node.z - 5.2, 0xf6dcb8);
    const mesh = b.build(vertexColorMaterial());
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    // 대로(동쪽)에서 들어올 때 보이도록 마당 동쪽 끝에 세운다
    this.addBanner("나눔마당", "#c2410c", node.x + 9.5, node.z, deg(90), "기쁨나눔부 · 따뜻한한끼봉사부");
  }

  private addEntranceGate(): void {
    const g = new THREE.Group();
    const b = new MeshBuilder();
    for (const s of [-1, 1]) {
      b.box(0.9, 4, 0.9, s * 3.6, 2, 0, 0xfffaf2);
      b.box(1.0, 0.3, 1.0, s * 3.6, 0.15, 0, 0x7c3aed);
    }
    b.box(8.4, 1.3, 0.7, 0, 4.4, 0, 0xfffaf2);
    const body = b.build(vertexColorMaterial());
    body.castShadow = true;
    g.add(body);
    const front = texturedPlane(signTexture("사역박람회", "#7c3aed", { aspect: 7.8 / 1.1, sub: "여기서 시작해요" }), 7.8, 1.1);
    front.position.set(0, 4.4, 0.36);
    const back = texturedPlane(signTexture("사역박람회", "#7c3aed", { aspect: 7.8 / 1.1, sub: "함께해 주셔서 고마워요" }), 7.8, 1.1);
    back.position.set(0, 4.4, -0.36);
    back.rotation.y = Math.PI;
    g.add(front, back);
    g.position.set(0, 0, -10);
    this.scene.add(g);
  }

  private addPlaza(): void {
    const node = this.index.data.layout.nodes.find((n) => n.id === "n-plaza-center");
    if (!node) return;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(6.5, 48), new THREE.MeshStandardMaterial({ color: 0xf3ede2, roughness: 1 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(node.x, 0.02, node.z);
    disc.receiveShadow = true;
    disc.userData.ground = true;
    this.scene.add(disc);

    // 가운데 안내탑: 바로 앞에 서면 시야를 가리므로 광장 북동쪽에 둔다
    const b = new MeshBuilder();
    b.cylinder(0.9, 1.1, 0.4, 4.5, 0.2, node.z - 4.5, 0xd8cdb8, 16);
    b.box(1.1, 3.4, 1.1, 4.5, 2.1, node.z - 4.5, 0xfffaf2);
    const tower = b.build(vertexColorMaterial());
    tower.castShadow = true;
    this.scene.add(tower);
    const tex = signTexture("중앙 광장", "#334155", { aspect: 1.05 / 0.6 });
    for (let i = 0; i < 4; i++) {
      const p = texturedPlane(tex, 1.05, 0.6);
      const a = (i * Math.PI) / 2;
      p.position.set(4.5 + Math.sin(a) * 0.56, 3.2, node.z - 4.5 + Math.cos(a) * 0.56);
      p.rotation.y = a;
      this.scene.add(p);
    }
  }

  private addBooths(): void {
    for (const booth of this.index.data.booths) {
      const place = this.index.data.layout.booths[booth.id];
      if (!place) continue;
      const obj = createBooth(booth, this.index.zoneOf(booth), place);
      this.booths.set(booth.id, obj);
      this.boothPickables.push(...obj.pickables);
      this.scene.add(obj.group);
    }
  }
}
