import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Tout est regroupé dans un seul index.html (JS + CSS inline) pour pouvoir
// ouvrir l'application d'un double-clic, sans serveur ni installation.
export default defineConfig({
  base: './',
  plugins: [vue(), viteSingleFile()],
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  test: { environment: 'jsdom' }
});
