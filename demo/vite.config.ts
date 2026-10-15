import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], build: { target: 'chrome74', cssTarget: 'chrome74' }, test: { environment: 'jsdom' } });
