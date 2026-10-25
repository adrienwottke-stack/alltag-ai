import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5182, proxy: { '/api': 'http://127.0.0.1:3182' } },
  build: { sourcemap: false, target: 'es2022' }
});
