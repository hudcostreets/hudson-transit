import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pdsPlugin } from 'pnpm-dep-source/vite'

const allowedHosts = [
  'host.docker.internal',
  ...process.env.VITE_ALLOWED_HOSTS?.split(',') ?? [],
]

export default defineConfig({
  plugins: [react(), pdsPlugin()],

  server: {
    port: 3847,
    host: true,
    allowedHosts,
  },
})
