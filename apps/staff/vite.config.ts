import staticAdapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit({ adapter: staticAdapter({ fallback: 'index.html', precompress: true }) })],
  server: {
    proxy: { '/api': { target: 'http://localhost:4000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
