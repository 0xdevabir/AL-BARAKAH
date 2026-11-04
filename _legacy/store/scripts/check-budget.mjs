// Fails the build when the JS and CSS a first visit loads exceed the budget, measured
// from the real server-rendered pages and with the same brotli level as adapter-node's output.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brotliCompressSync } from 'node:zlib';

const BUDGET = { js: 70 * 1024, css: 20 * 1024 };
const origin = process.env.BUDGET_ORIGIN ?? 'http://localhost:3000';
const client = resolve(import.meta.dirname, '../build/client');
const ROUTES = ['/', '/search', '/doctors', '/login', '/cart'];

const size = (path) => brotliCompressSync(readFileSync(path)).length;
const local = (url) => resolve(client, `.${new URL(url, origin).pathname}`);

/** Follows static imports only: dynamic ones load later, and aren't part of the first visit. */
function jsClosure(file, seen = new Set()) {
  if (seen.has(file) || !existsSync(file)) return seen;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?:^|[;}\s])(?:import|export)\s*(?:[\w$*{},\s]*?from\s*)?["'](\.{1,2}\/[^"']+\.js)["']/g)) {
    jsClosure(resolve(file, '..', m[1]), seen);
  }
  return seen;
}

let failed = false;
for (const route of ROUTES) {
  const html = await (await fetch(origin + route)).text();
  const links = [...html.matchAll(/<link[^>]+>/g)].map((m) => m[0]);
  const href = (tag) => /href="([^"]+)"/.exec(tag)?.[1];
  const css = links.filter((l) => /rel="stylesheet"/.test(l)).map(href);
  const entries = [
    ...links.filter((l) => /rel="modulepreload"/.test(l)).map(href),
    ...[...html.matchAll(/import\(["']([^"']+\.js)["']\)/g)].map((m) => m[1]),
  ];
  const js = new Set();
  for (const e of entries) jsClosure(local(new URL(e, origin + route).href), js);
  const cssFiles = css.map((c) => local(new URL(c, origin + route).href)).filter(existsSync);
  const jsBytes = [...js].reduce((n, f) => n + size(f), 0);
  const cssBytes = cssFiles.reduce((n, f) => n + size(f), 0);
  if (js.size === 0) { console.error(`${route}: found no scripts, so the measurement is invalid`); failed = true; }
  const ok = jsBytes <= BUDGET.js && cssBytes <= BUDGET.css;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${route.padEnd(10)} JS ${(jsBytes / 1024).toFixed(1)} KB (${js.size} files)  CSS ${(cssBytes / 1024).toFixed(1)} KB`);
}
process.exit(failed ? 1 : 0);
