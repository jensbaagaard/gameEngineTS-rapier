import { defineConfig } from 'vite';
export default defineConfig({ build: { outDir: 'demo-dist', target: 'es2022', chunkSizeWarningLimit: 6000 } });
