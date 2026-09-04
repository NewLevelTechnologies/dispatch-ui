import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The build identifier shown in the sidebar footer.
 *
 * This is the number support asks for, so it has to identify the actual build
 * rather than something a human remembers to bump — package.json's version has
 * sat at 0.0.0 since the repo was created, which is exactly the failure mode.
 *
 * GITHUB_SHA is set by default in GitHub Actions, so CI needs no change. Local
 * builds fall back to the working tree's HEAD, and anything without git (a
 * container, a tarball) degrades to 'dev' rather than failing the build.
 */
function buildSha(): string {
  const fromCi = process.env.GITHUB_SHA
  if (fromCi) return fromCi.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha()),
  },
  server: {
    port: 3000,
  },
})
