import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { target: 'chrome105', cssTarget: 'chrome105', outDir: 'dist', rollupOptions: { output: { manualChunks: { 'media': ['hls.js'], 'math': ['rehype-katex','katex'], 'markdown': ['react-markdown','remark-gfm','remark-math'] } } } }
});
