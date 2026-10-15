import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BOOTH, CAMERA, COLORS, LIGHT, POST } from "../config";
import type { ExpoIndex } from "../data/load";
import { createBooth, type BoothObject } from "./boothFactory";
import { FigureLayer } from "./figures";
import { ShadowBlobs, addBalloons, addOverhead, addPeople, addPlazaFurniture, streetsOf } from "./decor";
import { MeshBuilder, deg, texturedPlane, vertexColorMaterial } from "./geometry";
import { floorTileTexture, signTexture, skyTexture, tint } from "./textures";

export type TickFn = (dt: number) => void;

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly booths = new Map<string, BoothObject>();
  readonly boothPickables: THREE.Object3D[] = [];
  readonly ground: THREE.Mesh;
  readonly figures: FigureLayer;
  private ticks: TickFn[] = [];
  private clock = new THREE.Clock();
  private hovered: string | null = null;
  private blobs = new ShadowBlobs();
  /** 데스크톱에서만 쓰는 후처리 (주변광 차폐 + 블룸) */
  private composer: EffectComposer | null = null;
  private aoPass: GTAOPass | null = null;
  readonly lowPower: boolean;

  constructor(private container: HTMLElement, private index: ExpoIndex) {
    this.lowPower = matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.lowPower || devicePixelRatio < 2 });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.lowPower ? 1.75 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LIGHT.exposure;
    this.renderer.shadowMap.enabled = !this.lowPower;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fovLandscape, 1, CAMERA.near, CAMERA.far);
    this.camera.rotation.order = "YXZ";
    if (!this.lowPower) this.setupPost();

    this.scene.background = skyTexture(COLORS.skyTop, COLORS.skyHorizon);
    this.scene.fog = new THREE.Fog(COLORS.sky, 50, 140);
    // 은은한 환경 반사: 단색 면이 플라스틱처럼 보이지 않게 한다
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = LIGHT.environment;
    pmrem.dispose();

    const { nodes } = index.data.layout;
    this.addLights();
    this.ground = this.addGround();
    this.addStreets();
    this.addZoneFloorsAndBanners();
    this.addMadang();
    this.addEntranceGate();
    this.addPlaza();
    this.addBooths();
    this.figures = new FigureLayer(this.scene, index, this.booths, this.blobs);
    addOverhead(this.scene, nodes);
    addPeople(this.scene, index, this.blobs);
    this.blobs.build(this.scene);

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
    this.figures.update(dt, this.camera.position);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  private setupPost(): void {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const ao = new GTAOPass(this.scene, this.camera, 1, 1);
    ao.blendIntensity = POST.aoIntensity;
    ao.updateGtaoMaterial({ radius: POST.aoRadius, distanceFallOff: 1, thickness: 1 });
    composer.addPass(ao);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), POST.bloomStrength, POST.bloomRadius, POST.bloomThreshold));
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.aoPass = ao;
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
    this.composer?.setSize(w, h);
    this.aoPass?.setSize(w * Math.min(devicePixelRatio, 2), h * Math.min(devicePixelRatio, 2));
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? CAMERA.fovPortrait : CAMERA.fovLandscape;
    if (this.rightInset > 0) this.camera.setViewOffset(w, h, this.rightInset / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xfff4e2, 0xc9b291, LIGHT.hemisphere));
    // 늦은 오후의 따뜻한 햇빛
    const sun = new THREE.DirectionalLight(0xffe7c4, LIGHT.sun);
    sun.position.set(-35, 45, 25);
    sun.target.position.set(0, 0, -40);
    if (this.renderer.shadowMap.enabled) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(4096, 4096);
      const s = sun.shadow.camera;
      s.left = -62;
      s.right = 62;
      s.top = 62;
      s.bottom = -62;
      s.far = 170;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.03;
      sun.shadow.radius = 3;
    }
    this.scene.add(sun, sun.target);
  }

  private addGround(): THREE.Mesh {
    // 2 m 각 콘크리트 타일, 살짝 광택이 있어 환경광이 은은하게 비친다
    const tex = floorTileTexture(COLORS.ground, COLORS.groundLine, 4);
    tex.repeat.set(260 / 8, 260 / 8);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -40;
    ground.receiveShadow = true;
    ground.userData.ground = true;
    this.scene.add(ground);
    return ground;
  }

  /** 통로는 테두리가 있는 카펫, 대로변에는 화분 나무 */
  private addStreets(): void {
    const { nodes } = this.index.data.layout;
    const b = new MeshBuilder();
    const carpet = (cx: number, cz: number, w: number, d: number, alongX: boolean) => {
      b.use("fabric").box(w, 0.02, d, cx, 0.01, cz, COLORS.street);
      // 양쪽 테두리 띠
      for (const s of [-1, 1]) {
        if (alongX) b.box(w, 0.024, 0.18, cx, 0.012, cz + s * (d / 2 - 0.25), COLORS.streetEdge);
        else b.box(0.18, 0.024, d, cx + s * (w / 2 - 0.25), 0.012, cz, COLORS.streetEdge);
      }
    };
    for (const st of streetsOf(nodes)) carpet((st.minX + st.maxX) / 2, st.z, st.maxX - st.minX, 4.2, true);
    const zs = nodes.filter((n) => n.x === 0 && !n.booth).map((n) => n.z);
    const zMin = Math.min(...zs) - 3;
    carpet(0, (3 + zMin) / 2, 4.2, 3 - zMin, false);

    for (let z = -14; z > zMin + 4; z -= 9) {
      if ([-20, -48, -72].some((rz) => Math.abs(rz - z) < 5)) continue;
      for (const x of [-2.9, 2.9]) {
        b.use("stone").rbox(0.9, 0.55, 0.9, x, 0.28, z, 0xd9c7a8, 0.08);
        b.use("paint");
        b.cylinder(0.07, 0.1, 1.3, x, 1.1, z, 0x7a5232, 6);
        b.sphere(0.7, x, 2.1, z, 0x7fb069);
        b.sphere(0.5, x + 0.3, 1.85, z + 0.15, 0x8cbf74);
        this.blobs.add(x, z, 1.8, 1.8);
      }
    }
    const mesh = b.build(vertexColorMaterial());
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);
  }

  private addZoneFloorsAndBanners(): void {
    const { layout } = this.index.data;
    const floors = new MeshBuilder().use("fabric");
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
      floors.box(maxX - minX, 0.015, maxZ - minZ, (minX + maxX) / 2, 0.006, (minZ + maxZ) / 2, tint(zone.color, 0xffffff, 0.74));

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
    for (const s of [-1, 1]) {
      b.cylinder(0.08, 0.08, 4.4, s * 2.7, 2.2, 0, 0x4b4038, 8);
      b.sphere(0.13, s * 2.7, 4.45, 0, color);
    }
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
    const b = new MeshBuilder().use("stone");
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
      b.rbox(0.9, 4, 0.9, s * 3.6, 2, 0, 0xfffaf2, 0.12);
      b.rbox(1.1, 0.35, 1.1, s * 3.6, 0.17, 0, 0x7c3aed, 0.08);
      b.rbox(1.0, 0.18, 1.0, s * 3.6, 3.95, 0, 0x7c3aed, 0.06);
      addBalloons(b, s * 4.5, 3.6, 0.2);
      b.box(0.015, 1.6, 0.015, s * 4.3, 2.6, 0.1, 0x9a8f80);
    }
    b.rbox(8.6, 1.4, 0.8, 0, 4.4, 0, 0xfffaf2, 0.18);
    // 환영 카펫
    b.use("fabric").box(3.4, 0.03, 9, 0, 0.03, 4.6, 0xb4472e);
    b.box(3.0, 0.035, 8.6, 0, 0.032, 4.6, 0xd2603f);
    const body = b.build(vertexColorMaterial());
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const front = texturedPlane(signTexture("사역박람회", "#7c3aed", { aspect: 7.8 / 1.1, sub: "여기서 시작해요" }), 7.8, 1.1);
    front.position.set(0, 4.4, 0.41);
    const back = texturedPlane(signTexture("사역박람회", "#7c3aed", { aspect: 7.8 / 1.1, sub: "함께해 주셔서 고마워요" }), 7.8, 1.1);
    back.position.set(0, 4.4, -0.41);
    back.rotation.y = Math.PI;
    g.add(front, back);
    g.position.set(0, 0, -10);
    this.scene.add(g);
    for (const s of [-1, 1]) this.blobs.add(s * 3.6, -10, 1.8, 1.8);
  }

  private addPlaza(): void {
    const node = this.index.data.layout.nodes.find((n) => n.id === "n-plaza-center");
    if (!node) return;
    const b = new MeshBuilder().use("stone");
    b.cylinder(7.2, 7.2, 0.03, node.x, 0.02, node.z, 0xe9d9bd, 48);
    b.cylinder(6.6, 6.6, 0.035, node.x, 0.025, node.z, 0xf6eddc, 48);
    // 방사형 무늬
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.box(0.12, 0.04, 6.2, node.x + Math.sin(a) * 3.3, 0.028, node.z + Math.cos(a) * 3.3, 0xe3cfae, a);
    }
    const disc = b.build(vertexColorMaterial());
    disc.receiveShadow = true;
    disc.userData.ground = true;
    this.scene.add(disc);
    addPlazaFurniture(this.scene, node.x, node.z, this.blobs);
  }

  private addBooths(): void {
    for (const booth of this.index.data.booths) {
      const place = this.index.data.layout.booths[booth.id];
      if (!place) continue;
      const obj = createBooth(booth, this.index.zoneOf(booth), place);
      this.booths.set(booth.id, obj);
      this.boothPickables.push(...obj.pickables);
      this.scene.add(obj.group);
      const size = BOOTH[booth.size];
      this.blobs.add(place.x, place.z, size.w + 1.6, size.d + 1.6, deg(place.rotY), "rect");
    }
  }
}
