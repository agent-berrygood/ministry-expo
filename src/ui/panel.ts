import type { ExpoIndex } from "../data/load";
import type { Booth } from "../data/types";
import { events } from "../events";
import { navigate } from "../router";
import { h } from "./dom";

export class BoothPanel {
  readonly el = h("aside", { class: "panel", role: "dialog", "aria-hidden": "true", "aria-labelledby": "panel-title" });
  private openId: string | null = null;
  /** 열리거나 닫힐 때 호출된다 */
  onToggle?: () => void;

  constructor(root: HTMLElement, private index: ExpoIndex) {
    root.append(this.el);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.openId) events.emit("panel:close", {});
    });
  }

  get current(): string | null {
    return this.openId;
  }

  open(id: string): void {
    const booth = this.index.boothById.get(id);
    if (!booth) return;
    this.openId = id;
    this.el.replaceChildren(...this.render(booth));
    this.el.classList.add("is-open");
    this.el.setAttribute("aria-hidden", "false");
    document.body.classList.add("panel-open");
    this.onToggle?.();
  }

  close(): void {
    if (!this.openId) return;
    this.openId = null;
    this.el.classList.remove("is-open");
    this.el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("panel-open");
    this.onToggle?.();
  }

  private render(b: Booth): Node[] {
    const zone = this.index.zoneOf(b);
    const parent = b.parent ? this.index.boothById.get(b.parent) : undefined;
    const children = this.index.childrenOf(b.id);
    const hasIntro = b.tagline || b.description;

    const facts: [string, string][] = [];
    if (b.schedule) facts.push(["모임", b.schedule]);

    return [
      h("div", { class: "panel-handle" }),
      h(
        "div",
        { class: "panel-head" },
        h(
          "div",
          {},
          h("span", { class: "zone-badge", style: `--zone:${zone.color}` }, h("i"), zone.name),
          h("h2", { id: "panel-title" }, b.name),
          b.audience ? h("p", { class: "panel-audience" }, b.audience) : null,
        ),
        h("button", { class: "icon-btn", "aria-label": "닫기", onclick: () => events.emit("panel:close", {}) }, "×"),
      ),
      h(
        "div",
        { class: "panel-body" },
        b.tagline ? h("p", { class: "panel-tagline" }, b.tagline) : null,
        b.description ? h("p", {}, b.description) : null,
        hasIntro ? null : h("p", { class: "panel-placeholder" }, "부서 소개를 준비하고 있어요. 곧 사진과 함께 채워질 예정이에요."),
        facts.length ? h("dl", {}, ...facts.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])) : null,
        parent ? h("p", { class: "panel-section-title" }, "함께하는 부서") : null,
        parent ? h("div", { class: "chips" }, this.chip(parent, `${parent.name} 소속`)) : null,
        children.length ? h("p", { class: "panel-section-title" }, "소속 부서") : null,
        children.length ? h("div", { class: "chips" }, ...children.map((c) => this.chip(c, c.audience ? `${c.name} · ${c.audience}` : c.name))) : null,
        h(
          "div",
          { class: "panel-actions" },
          b.joinUrl ? h("a", { class: "btn btn-primary", href: b.joinUrl, target: "_blank", rel: "noopener" }, "함께하고 싶어요") : null,
          b.video ? h("a", { class: "btn", href: b.video, target: "_blank", rel: "noopener" }, "영상 보기") : null,
        ),
      ),
    ];
  }

  private chip(b: Booth, label: string): HTMLElement {
    return h("button", { class: "chip", onclick: () => navigate({ type: "booth", id: b.id }) }, label);
  }
}
