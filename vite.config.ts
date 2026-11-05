import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

const rev = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
})()

// GitHub Pages-friendly relative base; PWA assets copied from /public.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', sourcemap: false },
  define: {
    // shown on the Account screen so "which version is this phone on"
    // is a glance, not a debugging session
    __BUILD__: JSON.stringify(`${rev} · ${new Date().toISOString().slice(0, 10)}`),
  },
})
