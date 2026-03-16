import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pdsPlugin } from 'pnpm-dep-source/vite'

const allowedHosts = [
  'host.docker.internal',
  ...process.env.VITE_ALLOWED_HOSTS?.split(',') ?? [],
]

export default defineConfig({
  plugins: [react(), pdsPlugin({ extra: ['plotly.js-dist-min'] })],

  resolve: {
    alias: {
      // Use local plotly.js fork with touch click fix (prevents double plotly_click per tap)
      'plotly.js-dist-min': '/Users/ryan/c/plotly.js/dist/plotly.min.js',
    },
  },

  server: {
    port: 3847,
    host: true,
    allowedHosts,
    fs: {
      allow: ['..', '/Users/ryan/c/plotly.js/dist'],
    },
  },
})
