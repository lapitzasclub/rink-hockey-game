import { defineConfig } from 'vite'
import { dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const IGNORED_DIRS = ['.claude', '.openclaw']

export default defineConfig({
  // Rutas relativas: el mismo build sirve en la raíz y bajo /jugar/ de la web del Loyola
  base: './',
  server: {
    watch: {
      // Relativo a la raíz de este config: el servidor de main no vigila los worktrees de .claude/
      // (un build allí bloquea archivos de dist/ y tumba el watcher con EBUSY), pero un servidor
      // arrancado dentro de un worktree sí vigila sus propios archivos.
      ignored: (file: string) => IGNORED_DIRS.includes(relative(root, file).split(sep)[0]),
    },
  },
})
