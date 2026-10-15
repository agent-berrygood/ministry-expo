import { h } from "./dom";

/** 화면 위쪽에 잠깐 떴다 사라지는 알림 */
export class Toast {
  private el = h("div", { class: "toast", role: "status" });
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(root: HTMLElement) {
    root.append(this.el);
  }

  say(text: string, ms = 2600): void {
    this.el.textContent = text;
    this.el.classList.add("is-shown");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.el.classList.remove("is-shown"), ms);
  }
}
