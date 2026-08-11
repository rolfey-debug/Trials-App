import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages-friendly relative base; PWA assets copied from /public.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', sourcemap: false },
})
