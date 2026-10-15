import { defineConfig } from "vite";

export default defineConfig({
  // 상대 경로로 빌드해서 GitHub Pages 하위 경로에서도 동작하게 한다.
  base: "./",
  server: { host: true },
  // Three.js가 대부분인 단일 번들(약 540 KB, gzip 140 KB)이라 경고 기준만 올린다. PRD 8장 초기 로딩 3 MB 기준 안쪽.
  build: { chunkSizeWarningLimit: 800 },
});
