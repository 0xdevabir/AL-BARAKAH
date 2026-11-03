/**
 * Download public catalog listings into packages/database/data, for load-catalog.mjs.
 *
 * - MediWhole /shop pages: products, prices, photos (robots.txt allows /shop).
 * - Square trade-name pages: pack photos only. Square publishes no prices.
 *
 * Deliberately not crawled:
 * - MedEx: its terms forbid automated extraction and it serves a CAPTCHA to crawlers.
 * - Incepta: robots.txt disallows /products and /images.
 *
 * One request at a time. Any challenge or block stops the run: it must not be worked around.
 * Resumes from data/crawl-state.json.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../data');
const STATE = join(DATA, 'crawl-state.json');
const PRODUCTS = join(DATA, 'mediwhole.jsonl');
const PHOTOS = join(DATA, 'square.json');
const UA = 'BarakaBari-catalog-import/1.0';
const DELAY_MS = Number(process.env.CATALOG_DELAY_MS || 1000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Blocked extends Error {}

async function getText(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60000) });
    } catch {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (res.status === 403 || res.status === 429) throw new Blocked(`${res.status} from ${url}`);
    if (res.status >= 500) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) return '';
    const text = await res.text();
    if (/<title>[^<]*(security check|just a moment|attention required)/i.test(text)) throw new Blocked(`challenge page at ${url}`);
    return text;
  }
  return '';
}

/** Product objects sit in the Next.js flight payload as escaped JSON, each under a "product" key. */
export function parseShopPage(html) {
  const text = html.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const products = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf('"product":{"_id"', from);
    if (at < 0) break;
    const start = at + '"product":'.length;
    let depth = 0;
    let inString = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end < 0) break;
    from = end;
    try {
      products.push(JSON.parse(text.slice(start, end)));
    } catch {
      // A malformed row is skipped; the page's other rows are still good.
    }
  }
  const totalPages = Number(text.match(/"totalPages":(\d+)/)?.[1] ?? 0);
  return { products, totalPages };
}

function strip(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseSquarePage(html) {
  const out = [];
  for (const m of html.matchAll(/<img src="(products\/[^"]+)"[\s\S]*?<h3\s*>([\s\S]*?)<\/h3>\s*<h4\s*>([\s\S]*?)<\/h4>/g)) {
    const name = strip(m[2]);
    if (!name) continue;
    const path = m[1].split('/').map(encodeURIComponent).join('/');
    out.push({ name, genericName: strip(m[3]), imageUrl: `https://www.squarepharma.com.bd/${path}` });
  }
  return out;
}

async function crawlSquare() {
  const base = 'https://www.squarepharma.com.bd/';
  const seen = new Map();
  const queue = ['products-by-tradename.php', 'products-by-tradename-herbal-nutraceuticals.php', 'products-by-tradename-agrovet-pesticides.php', 'products-by-devices.php'];
  const visited = new Set();
  while (queue.length) {
    const path = queue.shift();
    if (visited.has(path)) continue;
    visited.add(path);
    const html = await getText(base + path);
    for (const photo of parseSquarePage(html)) if (!seen.has(photo.name.toLowerCase())) seen.set(photo.name.toLowerCase(), photo);
    for (const m of html.matchAll(/href="(products-by-[a-z-]+\.php\?[^"]*char=[^"]+)"/g)) queue.push(m[1].replace(/&amp;/g, '&'));
    await sleep(DELAY_MS);
  }
  await writeFile(PHOTOS, JSON.stringify([...seen.values()]));
  console.log(`square pages ${visited.size}, photos ${seen.size}`);
}

async function crawlMediWhole(state) {
  let last = state.lastPage || 1;
  let emptyRun = 0;
  for (let page = state.page + 1; page <= last; page++) {
    const html = await getText(`https://mediwholebd.com/shop?page=${page}`);
    const { products, totalPages } = parseShopPage(html);
    if (totalPages) last = state.lastPage = totalPages;
    if (products.length === 0) {
      if (++emptyRun >= 5) throw new Blocked(`5 empty pages in a row, ending at ${page}`);
    } else {
      emptyRun = 0;
      await appendFile(PRODUCTS, products.map((p) => JSON.stringify(p)).join('\n') + '\n');
      state.rows += products.length;
    }
    state.page = page;
    await writeFile(STATE, JSON.stringify(state));
    if (page % 50 === 0 || page === 1) console.log(`mediwhole ${page}/${last} rows ${state.rows}`);
    await sleep(DELAY_MS);
  }
}

async function main() {
  await mkdir(DATA, { recursive: true });
  const state = await readFile(STATE, 'utf8').then(JSON.parse).catch(() => ({ page: 0, lastPage: 0, rows: 0, square: false }));
  if (!state.square) {
    await crawlSquare();
    state.square = true;
    await writeFile(STATE, JSON.stringify(state));
  }
  await crawlMediWhole(state);
  console.log(`done: ${state.rows} rows`);
}

main().catch((err) => {
  console.error(err instanceof Blocked ? `STOPPED, source blocked the crawl: ${err.message}` : err);
  process.exit(err instanceof Blocked ? 2 : 1);
});
