import type { ExpoIndex } from "../data/load";
import { events } from "../events";
import { navigate } from "../router";
import { h } from "./dom";

const PLACE_NAMES: Record<string, string> = {
  entrance: "입구",
  "n-plaza-center": "중앙 광장",
  "n-plaza-madang": "나눔마당",
  "n-plaza-welcome": "입구 환영",
};

export class Hud {
  private where = h("span", { class: "hud-where" }, h("i"), "입구");
  private hint = h("div", { class: "hint", role: "status" }, "바닥의 화살표를 눌러 이동하고, 화면을 끌어서 둘러보세요");

  constructor(root: HTMLElement, private index: ExpoIndex) {
    root.append(
      h(
        "div",
        { class: "hud-top" },
        h("div", { class: "hud-title" }, h("strong", {}, "사역박람회"), this.where),
        h(
          "div",
          { class: "hud-actions" },
          h("a", { class: "btn btn-primary", href: `${import.meta.env.BASE_URL}pano.html` }, "실사 360° 보기"),
          h("button", { class: "btn", onclick: () => navigate({ type: "list" }) }, "목록 보기"),
          h("button", { class: "btn", onclick: () => this.home() }, "입구로"),
        ),
      ),
      this.hint,
    );

    let moves = 0;
    const hideHint = () => this.hint.classList.add("is-hidden");
    setTimeout(hideHint, 9000);
    events.on("nav:arrive", ({ nodeId }) => {
      this.setWhere(nodeId);
      if (++moves > 1) hideHint();
    });
  }

  private home(): void {
    navigate({ type: "home" });
    events.emit("nav:goto", { nodeId: "entrance" });
  }

  private setWhere(nodeId: string): void {
    const node = this.index.data.layout.nodes.find((n) => n.id === nodeId);
    let label = PLACE_NAMES[nodeId] ?? "박람회장";
    let color = "";
    if (node?.booth) {
      const b = this.index.boothById.get(node.booth);
      if (b) {
        const z = this.index.zoneOf(b);
        label = `${z.name} · ${b.name}`;
        color = z.color;
      }
    } else {
      const zoneId = /^n-([a-z0-9]+)-a\d+$/.exec(nodeId)?.[1];
      const z = zoneId ? this.index.zoneById.get(zoneId) : undefined;
      if (z) {
        label = z.name;
        color = z.color;
      }
    }
    this.where.replaceChildren(h("i", { style: color ? `--zone:${color}` : undefined }), label);
  }
}
