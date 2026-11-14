import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: '../../build/dist', emptyOutDir: true },
  // 本地开发直接连线上 API
  server: { proxy: { '/api': { target: 'https://clip.liuhetian.life', changeOrigin: true } } },
});
