import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  // Relative base so the built site works from a subpath (GitHub Pages) or a root domain.
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 2048,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
