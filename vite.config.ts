import { defineConfig } from "vite";

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(process.env.BUILD_HASH || 'local-dev'),
  },
  base: "/carbon-shade-web/",
  server: { host: "0.0.0.0", port: 5173 },
  preview: { host: "0.0.0.0", port: 4173 },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  // 2026-05-27 Q7: Phase 2 Day 1 Web Worker 骨架 — combat tick 跑 worker，
  // 主线程只处理 input + RAF + UI 渲染。`format: "es"` 保留 ES module
  // import，让 worker 内部能复用 simulation kernel 代码（不需要重新打包
  // commonjs）。Workers 通过 `new Worker(new URL(...), { type: "module" })`
  // 实例化（src/engine/workers/host.ts 是 launcher）。
  worker: {
    format: "es",
    plugins: () => [],  // no extra worker-only plugins; share root plugin chain
  },
});
