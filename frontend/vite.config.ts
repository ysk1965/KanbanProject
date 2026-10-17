import { defineConfig, type Plugin } from "vite";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const commitHash = execSync("git rev-parse --short HEAD").toString().trim();
const buildTime = new Date().toISOString();

// 소스맵 업로드는 CI(SENTRY_AUTH_TOKEN 존재)에서만 활성화한다.
// 로컬 빌드는 소스맵을 생성하지 않아 기존 동작 그대로 유지된다.
const uploadSourceMaps = !!process.env.SENTRY_AUTH_TOKEN;

/**
 * Vite plugin: 빌드 후 index-bridgespots.html + manifest-bridgespots.webmanifest 자동 생성
 * - index.html (Milkyway 기본) 을 복사하여 BRIDGE SPOTS 버전 생성
 * - CloudFront Function이 Host 헤더 기반으로 올바른 파일 서빙
 */
function generateBrandedIndex(): Plugin {
  return {
    name: "generate-branded-index",
    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      const indexPath = path.join(distDir, "index.html");
      if (!fs.existsSync(indexPath)) return;

      let html = fs.readFileSync(indexPath, "utf-8");

      // Title & meta tags → BRIDGE SPOTS
      html = html
        // JSON-LD sameAs의 상대 도메인은 아래 도메인 전역 치환에서 제외 (bridgespots 버전은 milkyway를 가리켜야 함)
        .replace(/https:\/\/bridgespots\.com/g, "__ALTERNATE_DOMAIN__")
        .replace(
          /<title>Milkyway - Smart Project Management<\/title>/g,
          "<title>BRIDGE SPOTS - The Intelligent PM Orchestration</title>",
        )
        .replace(
          /content="Milkyway - Smart Project Management"/g,
          'content="BRIDGE SPOTS - The Intelligent PM Orchestration"',
        )
        .replace(
          /content="팀 프로젝트를 효율적으로 관리하는 스마트 협업 플랫폼"/g,
          'content="칸반 보드, 간트 차트, 데일리 스케줄링을 하나로. 팀 협업의 흐름을 정밀하게 조율하는 프로젝트 관리 플랫폼."',
        )
        .replace(
          /content="프로젝트 관리, 칸반, 간트차트, 팀 협업, PM 도구, Kanban, Gantt, 일정 관리, Milkyway"/g,
          'content="프로젝트 관리, 칸반, 간트차트, 팀 협업, PM 도구, Kanban, Gantt, 일정 관리, BRIDGE SPOTS"',
        )
        .replace(/content="Milkyway"/g, 'content="BRIDGE SPOTS"')
        .replace(
          /href="https:\/\/milkyway\.pe\.kr/g,
          'href="https://bridgespots.com',
        )
        .replace(
          /content="https:\/\/milkyway\.pe\.kr/g,
          'content="https://bridgespots.com',
        )
        // OG image
        .replace(/og-image-milkyway\.png/g, "og-image-bridgespots.png")
        // Favicon (축소본 — 원본 PNG 2.4MB 를 아이콘으로 내려받지 않게 한다)
        .replace(/href="\/favicon-32\.png"/g, 'href="/favicon-32-bridgespots.png"')
        .replace(/href="\/apple-touch-icon\.png"/g, 'href="/apple-touch-icon-bridgespots.png"')
        .replace(/href="\/MilkyWay\.png"/g, 'href="/BridgeSpotsIcon.png"')
        // PWA manifest → BRIDGE SPOTS 버전
        .replace(/manifest\.webmanifest/g, "manifest-bridgespots.webmanifest")
        // JSON-LD + noscript 전역 치환 (위의 개별 규칙이 처리한 뒤 남은 브랜드 문자열)
        .replace(/https:\/\/milkyway\.pe\.kr/g, "https://bridgespots.com")
        .replace(/__ALTERNATE_DOMAIN__/g, "https://milkyway.pe.kr")
        .replace(/\/MilkyWay\.png/g, "/BridgeSpotsIcon.png")
        .replace(/Milkyway/g, "BRIDGE SPOTS")
        .replace(
          /팀 프로젝트를 효율적으로 관리하는 스마트 협업 플랫폼/g,
          "칸반 보드, 간트 차트, 데일리 스케줄링을 하나로. 팀 협업의 흐름을 정밀하게 조율하는 프로젝트 관리 플랫폼.",
        );

      fs.writeFileSync(path.join(distDir, "index-bridgespots.html"), html);
      console.log("✅ Generated index-bridgespots.html");

      // BRIDGE SPOTS 전용 manifest 생성
      const manifestPath = path.join(distDir, "manifest.webmanifest");
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        manifest.name = "BRIDGE SPOTS";
        manifest.short_name = "BRIDGE";
        manifest.description =
          "칸반 보드, 간트 차트, 데일리 스케줄링을 하나로. 팀 협업의 흐름을 정밀하게 조율하는 프로젝트 관리 플랫폼.";
        manifest.icons = manifest.icons.map(
          (icon: { src: string; sizes: string; type: string }) => ({
            ...icon,
            src: icon.src
              .replace("pwa-192x192.png", "pwa-192x192-bridge.png")
              .replace("pwa-512x512.png", "pwa-512x512-bridge.png"),
          }),
        );
        fs.writeFileSync(
          path.join(distDir, "manifest-bridgespots.webmanifest"),
          JSON.stringify(manifest, null, 2),
        );
        console.log("✅ Generated manifest-bridgespots.webmanifest");
      }
    },
  };
}


// ---------------------------------------------------------------------------
// vendor 청크 배정
// ---------------------------------------------------------------------------
type ModuleInfoLike = { importers: readonly string[] } | null;
type GetModuleInfo = (id: string) => ModuleInfoLike;

/** 첫 화면에서 항상 로드되는 그룹 — 공용 모듈이 이들 중 하나라도 쓰이면 eager 공용 청크로 간다. */
const EAGER_GROUPS = new Set([
  "app",
  "vendor-react",
  "vendor-radix",
  "vendor-motion",
  "vendor-dnd",
  "vendor-i18n",
  "vendor-lucide",
  "vendor-datefns",
]);

/** 패키지 이름 → 그룹. 서브 의존성은 여기 없어도 importer 를 따라 같은 그룹으로 들어간다. */
function namedGroup(id: string): string | undefined {
  const pkg = (...names: string[]) =>
    names.some((n) => id.includes(`/node_modules/${n}/`));
  const scope = (s: string) => id.includes(`/node_modules/${s}/`);
  if (pkg("react", "react-dom", "react-router", "react-router-dom", "scheduler")) return "vendor-react";
  if (scope("@radix-ui")) return "vendor-radix";
  if (pkg("framer-motion", "motion")) return "vendor-motion";
  if (scope("@dnd-kit")) return "vendor-dnd";
  if (pkg("i18next", "react-i18next", "i18next-browser-languagedetector")) return "vendor-i18n";
  if (pkg("lucide-react")) return "vendor-lucide";
  if (pkg("date-fns")) return "vendor-datefns";
  if (pkg("recharts")) return "vendor-recharts";
  if (
    scope("@blocknote") ||
    scope("@tiptap") ||
    id.includes("/node_modules/prosemirror-") ||
    pkg("yjs", "y-prosemirror", "y-protocols", "lib0")
  ) return "vendor-editor";
  if (pkg("three") || scope("@react-three")) return "vendor-three";
  if (scope("@excalidraw")) return "vendor-excalidraw";
  if (scope("@xyflow")) return "vendor-xyflow";
  if (pkg("xlsx")) return "vendor-xlsx";
  return undefined;
}

/** node_modules 모듈과 Rollup/Vite 가상 모듈(\0commonjsHelpers, \0vite/preload-helper …) */
const isVendorish = (id: string) => id.includes("node_modules") || id.startsWith("\0");

/**
 * 이 모듈을 (정적으로, 전이적으로) import 하는 루트 그룹 집합.
 * 루트 = 이름 있는 vendor 그룹 또는 "app"(프로젝트 소스). 동적 import 만 받는 모듈은 빈 집합.
 * 패키지 내부 순환(d3-transition 등)에서도 결과가 완전하도록 재귀 대신 BFS 로 조상을 모두 훑는다.
 */
function rootGroups(
  id: string,
  getModuleInfo: GetModuleInfo,
  memo: Map<string, Set<string>>,
): Set<string> {
  const cached = memo.get(id);
  if (cached) return cached;
  const result = new Set<string>();
  const seen = new Set<string>([id]);
  const queue = [id];
  for (let i = 0; i < queue.length; i++) {
    for (const importer of getModuleInfo(queue[i])?.importers ?? []) {
      if (seen.has(importer)) continue;
      seen.add(importer);
      if (!isVendorish(importer)) {
        result.add("app");
        continue;
      }
      const g = namedGroup(importer);
      if (g) result.add(g);
      else queue.push(importer); // 이름 없는 서브 의존성 — 그 위의 importer 를 계속 따라간다
    }
  }
  memo.set(id, result);
  return result;
}

/** 모듈이 (정적·전이적으로) 이름 있는 그룹의 모듈을 import 하는지 — 순수 유틸리티 판별용 */
function importsAnyGroup(
  id: string,
  getModuleInfo: (id: string) => { importedIds: readonly string[] } | null,
  memo: Map<string, boolean>,
): boolean {
  const cached = memo.get(id);
  if (cached !== undefined) return cached;
  let found = false;
  const seen = new Set<string>([id]);
  const queue = [id];
  for (let i = 0; i < queue.length && !found; i++) {
    for (const dep of getModuleInfo(queue[i])?.importedIds ?? []) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      if (namedGroup(dep)) {
        found = true;
        break;
      }
      queue.push(dep);
    }
  }
  memo.set(id, found);
  return found;
}

const rootMemo = new Map<string, Set<string>>();
const importsMemo = new Map<string, boolean>();

function vendorChunk(
  id: string,
  { getModuleInfo }: { getModuleInfo: (id: string) => any },
): string | undefined {
  if (!isVendorish(id)) return undefined;
  const named = namedGroup(id);
  if (named) return named;

  const roots = rootGroups(id, getModuleInfo, rootMemo);
  if (roots.size === 0) return undefined; // 동적 import 전용(mermaid 등) — Rollup 기본 분할
  if (roots.size === 1) {
    const [only] = roots;
    return only === "app" ? undefined : only; // 한 라이브러리 전용 서브 의존성은 그 라이브러리와 함께
  }
  // 여러 그룹이 함께 쓰는 공용 모듈. 그룹 모듈을 import 하는 것(floating-ui 등)과
  // 순수 유틸(commonjs 헬퍼, lodash 등)을 나눠 청크 간 순환을 막는다.
  const eager = [...roots].some((r) => EAGER_GROUPS.has(r));
  const usesGroup = importsAnyGroup(id, getModuleInfo, importsMemo);
  if (usesGroup) return eager ? "vendor-shared" : "vendor-shared-lazy";
  return eager ? "vendor-utils" : "vendor-utils-lazy";
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon-32.png",
        "apple-touch-icon.png",
        "favicon-32-bridgespots.png",
        "apple-touch-icon-bridgespots.png",
        "BridgeSpotsIcon.png",
        "banner.png",
      ],
      manifest: {
        name: "Milkyway - Smart Project Management",
        short_name: "Milkyway",
        description: "팀 프로젝트를 효율적으로 관리하는 스마트 협업 플랫폼",
        theme_color: "#0A0E17",
        background_color: "#0A0E17",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Precache only the entry HTML and core CSS — lazy chunks load on demand
        globPatterns: ["**/*.html", "**/*.css"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: null,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // JS chunks — cache after first load, serve from cache next time
            urlPattern: /\.js$/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "js-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/.*\/api\/v1\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:woff2?|ttf|otf|eot)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "font-cache",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    generateBrandedIndex(),
    // Sentry: 빌드 시 소스맵을 릴리스(commitHash)에 업로드해 minify 스택을 복원.
    // 업로드 후 dist의 .map을 삭제하여 S3(공개 버킷)로 소스맵이 새어나가지 않게 한다.
    ...(uploadSourceMaps
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: commitHash },
            sourcemaps: {
              filesToDeleteAfterUpload: ["./dist/**/*.map"],
            },
            telemetry: false,
          }),
        ]
      : []),
  ],
  build: {
    // 소스맵 업로드 시에만 hidden 소스맵 생성 (번들에 sourceMappingURL 미참조 → 사용자 노출 X)
    sourcemap: uploadSourceMaps ? "hidden" : false,
    rollupOptions: {
      external: ["@ebarooni/capacitor-calendar"],
      output: {
        // 큰 서드파티를 이름 있는 vendor 청크로 분리한다 — 앱 코드만 바뀐 배포에서
        // 라이브러리 청크 해시가 유지돼 브라우저/CDN 캐시가 살아남는다.
        //
        // 기본 동작(onlyExplicitManualChunks=false)은 manual 청크 모듈의 정적 의존성을
        // "먼저 처리된 청크"에 통째로 흡수해, commonjs 헬퍼·floating-ui 같은 공용 모듈이
        // vendor-excalidraw(4MB) 에 들어가고 첫 화면이 그 청크를 preload 하는 사고가 난다.
        // 그래서 명시한 모듈만 넣고, 서브 의존성은 아래 vendorChunk() 가 importer 그래프를 따라
        // "어느 그룹이 쓰는지"를 계산해 직접 배정한다.
        onlyExplicitManualChunks: true,
        manualChunks: vendorChunk,
      },
    },
  },
  esbuild: {
    drop: process.env.NODE_ENV === "production" ? ["console", "debugger"] : [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __FE_COMMIT_HASH__: JSON.stringify(commitHash),
    __FE_BUILD_TIME__: JSON.stringify(buildTime),
  },
});
