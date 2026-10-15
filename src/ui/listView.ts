import type { ExpoIndex } from "../data/load";
import type { Booth } from "../data/types";
import { navigate } from "../router";
import { h } from "./dom";

/** 3D 없이 존별 부스를 보여 준다. 어르신·저사양·WebGL 미지원용 (PRD 4.4) */
export class ListView {
  readonly el = h("section", { class: "list-view", "aria-label": "전체 부서 목록" });

  constructor(root: HTMLElement, private index: ExpoIndex, private has3D: boolean) {
    root.append(this.el);
    this.el.append(this.render());
  }

  open(): void {
    this.el.classList.add("is-open");
    this.el.scrollTop = 0;
  }

  close(): void {
    this.el.classList.remove("is-open");
  }

  private render(): HTMLElement {
    const { zones } = this.index.data;
    return h(
      "div",
      { class: "list-inner" },
      h(
        "div",
        { class: "list-head" },
        h("h1", {}, "전체 부서 보기"),
        this.has3D ? h("button", { class: "btn", onclick: () => navigate({ type: "home" }) }, "3D로 둘러보기") : null,
      ),
      h("p", { class: "list-intro" }, "궁금한 부서를 누르면 소개를 볼 수 있어요."),
      ...zones.map((z) =>
        h(
          "div",
          { class: "list-zone", style: `--zone:${z.color}` },
          h("h2", {}, h("i"), z.name),
          h("div", { class: "list-grid" }, ...this.ordered(z.id).map((b) => this.item(b))),
        ),
      ),
    );
  }

  /** 상위 부서 바로 뒤에 소속 부서를 붙여서 보여 준다 */
  private ordered(zoneId: string): Booth[] {
    const booths = this.index.boothsInZone(zoneId);
    const out: Booth[] = [];
    for (const b of booths.filter((b) => !b.parent)) {
      out.push(b, ...booths.filter((c) => c.parent === b.id));
    }
    return out;
  }

  private item(b: Booth): HTMLElement {
    return h(
      "button",
      { class: `list-booth${b.parent ? " is-child" : ""}`, onclick: () => navigate({ type: "booth", id: b.id }) },
      b.name,
      b.audience ? h("small", {}, b.audience) : null,
    );
  }
}
