import { defineConfig, type Plugin } from 'vite'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const commitHash = execSync('git rev-parse --short HEAD').toString().trim()
const buildTime = new Date().toISOString()

/**
 * Vite plugin: 빌드 후 index-bridgespots.html 자동 생성
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

      fs.writeFileSync(path.join(distDir, 'index-bridgespots.html'), html)
      console.log('✅ Generated index-bridgespots.html')
    }
  }
}

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    generateBrandedIndex(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __FE_COMMIT_HASH__: JSON.stringify(commitHash),
    __FE_BUILD_TIME__: JSON.stringify(buildTime),
  },
})
