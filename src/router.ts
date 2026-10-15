import { events, type Route } from "./events";

// 해시 형식: #/booth/{id}, #/zone/{id}, #/list (PRD 4.5)

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "booth" && parts[1]) return { type: "booth", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "zone" && parts[1]) return { type: "zone", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "list") return { type: "list" };
  return { type: "home" };
}

export function routeToHash(route: Route): string {
  switch (route.type) {
    case "booth":
      return `#/booth/${encodeURIComponent(route.id)}`;
    case "zone":
      return `#/zone/${encodeURIComponent(route.id)}`;
    case "list":
      return "#/list";
    case "home":
      return "#/";
  }
}

export function navigate(route: Route): void {
  const hash = routeToHash(route);
  if (location.hash === hash) events.emit("route:change", route);
  else location.hash = hash;
}

export function currentRoute(): Route {
  return parseHash(location.hash);
}

export function startRouter(): void {
  window.addEventListener("hashchange", () => events.emit("route:change", currentRoute()));
}
