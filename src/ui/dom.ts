type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;
type Child = Node | string | null | undefined | false;

/** 작은 DOM 생성 도우미. 글자는 항상 textContent로 넣어 HTML 주입을 막는다. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.replace(/^on/, "").toLowerCase(), v);
    else if (k === "style") el.setAttribute("style", String(v));
    else if (k === "class") el.className = String(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}
