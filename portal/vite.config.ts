import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Office portal — second Vite app in this repo, sharing node_modules and
// `shared/` with the field PWA. Built to portal/dist and deployed at /office/.
export default defineConfig({
  base: './',
  plugins: [react()],
})
