import { defineConfig, type Plugin } from 'vite'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const commitHash = execSync('git rev-parse --short HEAD').toString().trim()
const buildTime = new Date().toISOString()

/**
 * Vite plugin: 빌드 후 index-bridgespots.html + manifest-bridgespots.webmanifest 자동 생성
 * - index.html (Milkyway 기본) 을 복사하여 BRIDGE SPOTS 버전 생성
 * - CloudFront Function이 Host 헤더 기반으로 올바른 파일 서빙
 */
function generateBrandedIndex(): Plugin {
  return {
    name: 'generate-branded-index',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist')
      const indexPath = path.join(distDir, 'index.html')
      if (!fs.existsSync(indexPath)) return

      let html = fs.readFileSync(indexPath, 'utf-8')

      // Title & meta tags → BRIDGE SPOTS
      html = html
        .replace(/<title>Milkyway - Smart Project Management<\/title>/g,
          '<title>BRIDGE SPOTS - The Intelligent PM Orchestration</title>')
        .replace(/content="Milkyway - Smart Project Management"/g,
          'content="BRIDGE SPOTS - The Intelligent PM Orchestration"')
        .replace(/content="팀 프로젝트를 효율적으로 관리하는 스마트 협업 플랫폼"/g,
          'content="칸반 보드, 간트 차트, 데일리 스케줄링을 하나로. 팀 협업의 흐름을 정밀하게 조율하는 프로젝트 관리 플랫폼."')
        .replace(/content="프로젝트 관리, 칸반, 간트차트, 팀 협업, PM 도구, Kanban, Gantt, 일정 관리, Milkyway"/g,
          'content="프로젝트 관리, 칸반, 간트차트, 팀 협업, PM 도구, Kanban, Gantt, 일정 관리, BRIDGE SPOTS"')
        .replace(/content="Milkyway"/g, 'content="BRIDGE SPOTS"')
        .replace(/href="https:\/\/milkyway\.pe\.kr/g, 'href="https://bridgespots.com')
        .replace(/content="https:\/\/milkyway\.pe\.kr/g, 'content="https://bridgespots.com')
        // OG image
        .replace(/og-image-milkyway\.png/g, 'og-image-bridgespots.png')
        // Favicon
        .replace(/href="\/MilkyWay\.png"/g, 'href="/BridgeSpotsIcon.png"')
        // PWA manifest → BRIDGE SPOTS 버전
        .replace(/manifest\.webmanifest/g, 'manifest-bridgespots.webmanifest')

      fs.writeFileSync(path.join(distDir, 'index-bridgespots.html'), html)
      console.log('✅ Generated index-bridgespots.html')

      // BRIDGE SPOTS 전용 manifest 생성
      const manifestPath = path.join(distDir, 'manifest.webmanifest')
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        manifest.name = 'BRIDGE SPOTS'
        manifest.short_name = 'BRIDGE'
        manifest.description = '칸반 보드, 간트 차트, 데일리 스케줄링을 하나로. 팀 협업의 흐름을 정밀하게 조율하는 프로젝트 관리 플랫폼.'
        manifest.icons = manifest.icons.map((icon: { src: string; sizes: string; type: string }) => ({
          ...icon,
          src: icon.src.replace('pwa-192x192.png', 'pwa-192x192-bridge.png')
                       .replace('pwa-512x512.png', 'pwa-512x512-bridge.png'),
        }))
        fs.writeFileSync(
          path.join(distDir, 'manifest-bridgespots.webmanifest'),
          JSON.stringify(manifest, null, 2)
        )
        console.log('✅ Generated manifest-bridgespots.webmanifest')
      }
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['MilkyWay.png', 'BridgeSpotsIcon.png', 'banner.png'],
      manifest: {
        name: 'Milkyway - Smart Project Management',
        short_name: 'Milkyway',
        description: '팀 프로젝트를 효율적으로 관리하는 스마트 협업 플랫폼',
        theme_color: '#0A0E17',
        background_color: '#0A0E17',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8 MiB
        navigateFallback: null,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:woff2?|ttf|otf|eot)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    generateBrandedIndex(),
  ],
  build: {
    rollupOptions: {
      external: ['@ebarooni/capacitor-calendar'],
    },
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __FE_COMMIT_HASH__: JSON.stringify(commitHash),
    __FE_BUILD_TIME__: JSON.stringify(buildTime),
  },
})
