import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { buildFigures } from "./scripts/build-figures";

/** photos/의 인물 사진을 빌드 시작 때 처리하고, 개발 중에는 바뀔 때마다 다시 처리해 새로 고친다 (PRD 4.8) */
function figuresPlugin(): Plugin {
  const root = process.cwd();
  const photos = path.join(root, "photos");
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    name: "expo-figures",
    async buildStart() {
      await buildFigures(root);
    },
    configureServer(server) {
      server.watcher.add(photos);
      const rerun = (file: string) => {
        if (!path.resolve(file).startsWith(photos)) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
          await buildFigures(root, (m) => server.config.logger.info(m));
          server.ws.send({ type: "full-reload" });
        }, 400);
      };
      server.watcher.on("add", rerun).on("change", rerun).on("unlink", rerun);
    },
  };
}

export default defineConfig({
  // 상대 경로로 빌드해서 GitHub Pages 하위 경로에서도 동작하게 한다.
  base: "./",
  plugins: [figuresPlugin()],
  server: { host: true },
  // Three.js가 대부분인 단일 번들(약 540 KB, gzip 140 KB)이라 경고 기준만 올린다. PRD 8장 초기 로딩 3 MB 기준 안쪽.
  build: { chunkSizeWarningLimit: 800 },
});
