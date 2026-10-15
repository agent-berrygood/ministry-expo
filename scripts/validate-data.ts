// 데이터 검증 (PRD 5.4). 오류가 하나라도 있으면 종료 코드 1로 빌드를 막는다.
import fs from "node:fs";
import path from "node:path";
import type { Booth, Layout, Zone } from "../src/data/types";

const dir = path.resolve(import.meta.dirname, "../public/data");
const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as T;

const zones = read<Zone[]>("zones.json");
const booths = read<Booth[]>("booths.json");
const layout = read<Layout>("layout.json");

const errors: string[] = [];
const warnings: string[] = [];

const TEMPLATES = ["standard", "stall"];
const SIZES = ["standard", "wide"];
const PROPS = ["none", "music", "globe", "book", "heart", "cross", "meal", "car", "pray", "gift"];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function dupes(ids: string[], what: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${what} ID 중복: ${id}`);
    seen.add(id);
  }
  return seen;
}

const zoneIds = dupes(zones.map((z) => z.id), "존");
const boothIds = dupes(booths.map((b) => b.id), "부스");
const nodeIds = dupes(layout.nodes.map((n) => n.id), "노드");
const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));

for (const z of zones) {
  if (!nodeIds.has(z.entryNode)) errors.push(`존 ${z.id}: entryNode ${z.entryNode} 없음`);
  if (!/^#[0-9a-fA-F]{6}$/.test(z.color)) errors.push(`존 ${z.id}: color 형식 오류 (${z.color})`);
}

for (const b of booths) {
  if (!ID.test(b.id)) errors.push(`부스 ID 형식 오류(kebab-case): ${b.id}`);
  if (!zoneIds.has(b.zone)) errors.push(`부스 ${b.id}: 알 수 없는 존 ${b.zone}`);
  if (b.parent && !boothIds.has(b.parent)) errors.push(`부스 ${b.id}: 알 수 없는 parent ${b.parent}`);
  if (!TEMPLATES.includes(b.template)) errors.push(`부스 ${b.id}: template 값 오류 (${b.template})`);
  if (!SIZES.includes(b.size)) errors.push(`부스 ${b.id}: size 값 오류 (${b.size})`);
  if (!PROPS.includes(b.prop)) errors.push(`부스 ${b.id}: prop 값 오류 (${b.prop})`);
  if (!layout.booths[b.id]) errors.push(`부스 ${b.id}: layout.booths 좌표 없음`);
  const node = nodeById.get(`n-booth-${b.id}`);
  if (!node) errors.push(`부스 ${b.id}: n-booth-${b.id} 노드 없음`);
  else if (node.booth !== b.id) errors.push(`노드 n-booth-${b.id}: booth 값이 ${node.booth}`);
  if (b.joinUrl && !/^https:\/\//.test(b.joinUrl)) warnings.push(`부스 ${b.id}: joinUrl이 https로 시작하지 않음`);
}

for (const id of Object.keys(layout.booths)) {
  if (!boothIds.has(id)) errors.push(`layout.booths에 알 수 없는 부스: ${id}`);
}

for (const n of layout.nodes) {
  if (!/^(entrance|n-[a-z0-9-]+)$/.test(n.id)) errors.push(`노드 ID 형식 오류: ${n.id}`);
  if (n.booth && !boothIds.has(n.booth)) errors.push(`노드 ${n.id}: 알 수 없는 부스 ${n.booth}`);
  for (const l of n.links) {
    const m = nodeById.get(l);
    if (!m) errors.push(`노드 ${n.id}: 없는 노드로 연결 ${l}`);
    else if (!m.links.includes(n.id)) errors.push(`노드 연결이 한쪽만 있음: ${n.id} → ${l}`);
  }
}

// entrance에서 모든 노드 도달 가능
if (nodeById.has("entrance")) {
  const seen = new Set(["entrance"]);
  const queue = ["entrance"];
  while (queue.length) {
    for (const l of nodeById.get(queue.shift()!)?.links ?? []) {
      if (!seen.has(l) && nodeById.has(l)) {
        seen.add(l);
        queue.push(l);
      }
    }
  }
  for (const id of nodeIds) if (!seen.has(id)) errors.push(`입구에서 갈 수 없는 노드: ${id}`);
} else errors.push("entrance 노드 없음");

// 나눔마당 인접 규칙 (PRD 3.1)
const joy = nodeById.get("n-booth-joy-sharing");
if (!joy?.links.includes("n-booth-warm-meal")) errors.push("나눔마당 규칙: joy-sharing과 warm-meal 부스 노드가 직접 연결되어야 함");

// 개인정보 의심 패턴 (경고)
const PHONE = /\d{2,3}-\d{3,4}-\d{4}/;
const TITLE = /[가-힣]{2,4}\s?(집사|권사|장로|목사|전도사|간사)/;
for (const b of booths) {
  for (const [k, v] of Object.entries(b)) {
    if (typeof v !== "string") continue;
    if (PHONE.test(v)) warnings.push(`부스 ${b.id}.${k}: 전화번호로 보이는 값`);
    if (TITLE.test(v)) warnings.push(`부스 ${b.id}.${k}: 이름+직분으로 보이는 값 "${v.match(TITLE)![0]}"`);
  }
}

for (const w of warnings) console.warn(`⚠️  ${w}`);
for (const e of errors) console.error(`❌ ${e}`);
if (errors.length) {
  console.error(`\n데이터 검증 실패: 오류 ${errors.length}개`);
  process.exit(1);
}
console.log(`✅ 데이터 검증 통과: 존 ${zones.length}, 부스 ${booths.length}, 노드 ${layout.nodes.length} (경고 ${warnings.length})`);
