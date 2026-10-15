// scene/ ↔ ui/ 사이의 유일한 통신 통로 (PRD 6.3).

export type Route =
  | { type: "home" }
  | { type: "booth"; id: string }
  | { type: "zone"; id: string }
  | { type: "list" };

export interface EventMap {
  "booth:select": { id: string };
  "booth:hover": { id: string | null };
  /** 교역자 사진을 눌렀다 (PRD 4.10) */
  "figure:click": { id: string };
  "nav:goto": { nodeId: string };
  "nav:arrive": { nodeId: string };
  /** 카메라 위치와 방향. 미니맵이 쓴다. */
  "nav:pose": { x: number; z: number; yaw: number };
  "panel:close": Record<string, never>;
  "route:change": Route;
}

type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => void;

class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<never>>>();

  on<K extends keyof EventMap>(type: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof EventMap>(type: K, payload: EventMap[K]): void {
    this.handlers.get(type)?.forEach((h) => (h as Handler<K>)(payload));
  }
}

export const events = new EventBus();
