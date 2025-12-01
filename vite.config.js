import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ibsen_networks/',   // endre hvis repo-navnet er annet
  build: {
    outDir: 'docs',
    emptyOutDir: true
  }
})
