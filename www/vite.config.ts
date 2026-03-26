import { existsSync, realpathSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pdsPlugin } from 'pnpm-dep-source/vite'

const allowedHosts = [
  'host.docker.internal',
  ...process.env.VITE_ALLOWED_HOSTS?.split(',') ?? [],
]

// Resolve plotly.js fork's min bundle. pltly imports 'plotly.js-dist-min'
// (separate npm pkg); alias to fork's pre-built bundle until plotly.js
// ESM conversion is complete and pltly imports 'plotly.js' directly.
function findPlotlyMin(): string {
  const symlink = resolve('node_modules/plotly.js')
  if (!existsSync(symlink)) throw new Error('plotly.js not found in node_modules')
  return resolve(realpathSync(symlink), 'dist/plotly.min.js')
}

export default defineConfig({
  plugins: [react(), pdsPlugin()],

  resolve: {
    alias: {
      'plotly.js-dist-min': findPlotlyMin(),
    },
  },

  server: {
    port: 3847,
    host: true,
    allowedHosts,
  },
})
