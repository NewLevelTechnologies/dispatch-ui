import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The build date shown in the sidebar footer.
 *
 * A date rather than a version or a commit hash. There is no versioning scheme
 * to read from — no tags, and both package.json versions are untouched
 * defaults, which is what a hand-maintained number degrades to. A commit SHA is
 * accurate but unreadable: nobody can tell whether `6ab14aa` is today's build.
 *
 * A date needs no discipline to stay true and answers the question people
 * actually ask, which is how old this is.
 */
const BUILD_DATE = new Date().toISOString().slice(0, 10)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
  server: {
    port: 3000,
  },
})
