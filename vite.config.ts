import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base = nombre del repo para que GitHub Pages sirva los assets bien
// build a /docs para que GitHub Pages lo sirva sin necesitar workflow scope
export default defineConfig({
  base: '/jose-en-la-vida-adulta/',
  plugins: [react()],
  build: { outDir: 'docs', emptyOutDir: true },
});
