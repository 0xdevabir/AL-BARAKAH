import { paraglideVitePlugin } from '@inlang/paraglide-js';
import nodeAdapter from '@sveltejs/adapter-node';
import staticAdapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const mobile = process.env.BUILD_TARGET === 'mobile';

export default defineConfig({
  plugins: [
    sveltekit({
      // The website renders on the server for speed and search engines; the app ships as static files.
      adapter: mobile ? staticAdapter({ pages: 'build-mobile', fallback: 'index.html' }) : nodeAdapter({ precompress: true }),
      // Small stylesheets go inside the HTML, so they don't block the first paint on slow networks.
      inlineStyleThreshold: 16384,
    }),
    paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide', strategy: ['cookie', 'baseLocale'] }),
  ],
  define: {
    'import.meta.env.VITE_MOBILE': JSON.stringify(mobile),
    'import.meta.env.VITE_API_BASE': JSON.stringify(mobile ? (process.env.PUBLIC_API_URL ?? 'http://10.0.2.2:4000') : '/api'),
  },
  server: {
    proxy: { '/api': { target: 'http://localhost:4000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
