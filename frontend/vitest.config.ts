import path from 'path';
import { defineConfig } from 'vitest/config';

// 날짜 유틸 테스트가 로컬 타임존에 의존하지 않도록 고정한다.
process.env.TZ = 'Asia/Seoul';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
