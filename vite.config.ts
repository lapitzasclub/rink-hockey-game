import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    watch: {
      // Los worktrees de .claude/ viven dentro del repo; si el servidor de main los vigila,
      // un build en un worktree bloquea archivos de dist/ y tumba el watcher (EBUSY).
      ignored: ['**/.claude/**', '**/.openclaw/**'],
    },
  },
})
