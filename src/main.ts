import "./styles/tokens.css";
import "./styles/app.css";
import { ExpoIndex, loadExpoData } from "./data/load";
import { events, type Route } from "./events";
import { NavController } from "./nav/controller";
import { NavGraph } from "./nav/graph";
import { currentRoute, navigate, startRouter } from "./router";
import { ensureFonts } from "./scene/textures";
import { World } from "./scene/world";
import { h } from "./ui/dom";
import { Hud } from "./ui/hud";
import { ListView } from "./ui/listView";
import { Minimap } from "./ui/minimap";
import { BoothPanel } from "./ui/panel";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const stage = document.getElementById("stage")!;
  const ui = document.getElementById("ui")!;
  const loading = h("div", { class: "loading" }, "박람회장을 준비하고 있어요…");
  document.body.append(loading);

  const index = new ExpoIndex(await loadExpoData());
  const webgl = hasWebGL();

  const list = new ListView(ui, index, webgl);
  const panel = new BoothPanel(ui, index);

  if (!webgl) {
    // 3D를 못 쓰는 기기는 목록 보기만 쓴다 (PRD 8장)
    list.open();
    events.on("route:change", (r) => (r.type === "booth" ? panel.open(r.id) : panel.close()));
    events.on("panel:close", () => navigate({ type: "list" }));
    startRouter();
    const r = currentRoute();
    if (r.type === "booth") panel.open(r.id);
    loading.classList.add("is-done");
    return;
  }

  await ensureFonts();
  const world = new World(stage, index);
  const graph = new NavGraph(index.data.layout.nodes);
  const nav = new NavController(world, graph, "entrance");
  new Hud(ui, index);
  new Minimap(ui, index);

  const boothNode = (id: string) => index.boothNode.get(id);

  // 데스크톱 사이드 패널일 때만 3D 화면 중심을 비켜 준다 (app.css의 패널 미디어쿼리와 같은 조건)
  const sidePanel = matchMedia("(min-width: 768px) and (min-aspect-ratio: 1/1)");
  const syncInset = () => world.setRightInset(panel.current && sidePanel.matches ? 412 : 0);
  sidePanel.addEventListener("change", syncInset);
  panel.onToggle = syncInset;

  const apply = (r: Route, instant = false) => {
    switch (r.type) {
      case "booth": {
        const node = boothNode(r.id);
        if (!node) return navigate({ type: "home" });
        list.close();
        panel.open(r.id);
        if (instant) nav.jumpTo(node);
        else events.emit("nav:goto", { nodeId: node });
        break;
      }
      case "zone": {
        const zone = index.zoneById.get(r.id);
        list.close();
        panel.close();
        if (zone) instant ? nav.jumpTo(zone.entryNode) : events.emit("nav:goto", { nodeId: zone.entryNode });
        break;
      }
      case "list":
        panel.close();
        list.open();
        break;
      case "home":
        panel.close();
        list.close();
        break;
    }
  };

  events.on("route:change", (r) => apply(r));
  events.on("booth:select", ({ id }) => navigate({ type: "booth", id }));
  events.on("panel:close", () => navigate({ type: "home" }));
  // 부스 앞을 떠나면 패널을 닫는다
  events.on("nav:arrive", ({ nodeId }) => {
    const open = panel.current;
    if (open && boothNode(open) !== nodeId) {
      history.replaceState(null, "", "#/");
      panel.close();
    }
  });

  if (import.meta.env.DEV) {
    // 개발용: 탭이 숨겨져 애니메이션이 멈춘 상태에서도 step(초)로 프레임을 진행해 확인할 수 있다
    const step = (seconds = 1) => {
      for (let t = 0; t < seconds; t += 1 / 30) world.frame(1 / 30);
    };
    Object.assign(window, { __expo: { world, nav, graph, step } });
  }

  startRouter();
  apply(currentRoute(), true);
  world.start();
  setTimeout(() => loading.classList.add("is-done"), 60);
}

main().catch((err) => {
  console.error(err);
  document.body.append(h("div", { class: "loading" }, "박람회장을 불러오지 못했어요. 새로고침해 주세요."));
});
