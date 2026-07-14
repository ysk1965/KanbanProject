import { build } from "esbuild";

// 단일 파일 번들. 모든 의존성 인라인 → 런타임 deps 0.
// shebang 을 배너로 넣어 `npx @bridgespots/mcp` 실행이 되도록 한다
// (plugin 은 `node <path>` 로 실행 — node 는 shebang 을 무시하므로 양쪽 다 동작).
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "dist/bridge-mcp.mjs",
  banner: { js: "#!/usr/bin/env node" },
});

console.log("✓ bundled → dist/bridge-mcp.mjs");
