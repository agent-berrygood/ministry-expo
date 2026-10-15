import { events } from "../events";
import { h } from "./dom";

// 숨은 목회자 찾기 (PRD 4.10). 찾은 기록은 이 기기의 localStorage에만 남는다(실패해도 게임은 동작).

const STORAGE_KEY = "expo.hunt.v1";

export interface HuntTarget {
  id: string;
  /** 사진 파일명에서 온 이름. 없으면 빈 문자열 */
  caption: string;
}

export class Hunt {
  private found = new Set<string>();
  private chip = h("button", { class: "hunt-chip", "aria-live": "polite" });
  private toast = h("div", { class: "toast", role: "status" });
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(root: HTMLElement, private targets: HuntTarget[], onFound: (id: string) => void) {
    if (targets.length === 0) return;
    const valid = new Set(targets.map((t) => t.id));
    for (const id of this.load()) if (valid.has(id)) this.found.add(id);
    this.chip.addEventListener("click", () => this.say(this.found.size === targets.length ? "모두 찾았어요! 함께해 주셔서 고마워요 🎉" : "정장 차림의 목사님·전도사님이 박람회장 곳곳에 숨어 계세요. 찾아서 눌러 보세요!"));
    root.append(this.chip, this.toast);
    this.render();

    events.on("figure:click", ({ id }) => {
      const target = this.targets.find((t) => t.id === id);
      if (!target) return;
      onFound(id);
      const who = target.caption ? `${target.caption}님` : "숨은 목회자";
      const whoObj = target.caption ? `${who}을` : `${who}를`;
      if (this.found.has(id)) {
        this.say(`이미 찾은 분이에요 (${this.found.size}/${this.targets.length})`);
        return;
      }
      this.found.add(id);
      this.save();
      this.render();
      const done = this.found.size === this.targets.length;
      this.say(done ? `${who}까지 모두 찾았어요! 🎉` : `${whoObj} 찾았어요! (${this.found.size}/${this.targets.length})`);
    });
  }

  private render(): void {
    const done = this.found.size === this.targets.length;
    this.chip.textContent = done ? `🎉 숨은 목회자 모두 찾음` : `🔍 숨은 목회자 ${this.found.size}/${this.targets.length}`;
    this.chip.classList.toggle("is-done", done);
  }

  private say(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add("is-shown");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove("is-shown"), 3200);
  }

  private load(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.found]));
    } catch {
      // 저장이 막힌 환경(시크릿 창 등)에서는 이번 방문 동안만 기억한다
    }
  }
}
