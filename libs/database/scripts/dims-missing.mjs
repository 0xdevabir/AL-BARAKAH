/**
 * Add only the products we do not have yet, using the facts dimsbd.com lists. No clinical text.
 *
 *   node packages/database/scripts/dims-missing.mjs crawl                 walk the listings, resumable
 *   node --env-file=.env packages/database/scripts/dims-missing.mjs load [--dry-run]
 *
 * The site's ?page= links return page one, so listings are reached through company and generic
 * pages, which show every brand at once. One request at a time; a block stops the run.
 *
 * A product counts as already listed when brand, strength and form family match, whatever the
 * company is called, so a spelling difference cannot create a second copy. Hidden rows count too.
 * Pack and price are fetched only for genuinely new products, and a product with no price is
 * skipped. New rows carry the batch CATALOG-DIMS so they can be found and removed as a set.
 */
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { categorize } from './catalog-categories.mjs';

const SITE = 'https://dimsbd.com';
const DATA = join(dirname(fileURLToPath(import.meta.url)), '../data');
const ROWS = join(DATA, 'dims-listings.jsonl');
const DETAILS = join(DATA, 'dims-details.jsonl');
const STATE = join(DATA, 'dims-walk.json');
const BATCH = 'CATALOG-DIMS';
const OPENING_QTY = 24;
const DELAY_MS = 1000;
const LETTERS = ['numeric', ...'abcdefghijklmnopqrstuvwxyz'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const decode = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const clip = (s, n) => decode(s).replace(/\s+/g, ' ').trim().slice(0, n).trim();
const compact = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dbSlug = (s) => slugify(s).slice(0, 100).replace(/-$/, '');

const FORM_FAMILIES = [
  ['ophthalmic', /eye|ophthalm/], ['ear', /\bear\b|otic/], ['nasal', /nasal/],
  ['inhaled', /inhal|respirator|nebul|rotacap/], ['injection', /inject|infusion|\biv\b|\bim\b|\bsc\b|vial|ampoule|\bamp\b/],
  ['suppository', /supposit|pessary/], ['tablet', /tablet|\btab\b|caplet/], ['capsule', /capsule|\bcap\b/],
  ['drops', /drop/], ['liquid', /syrup|suspension|solution|elixir|liquid|emulsion|linctus/],
  ['cream', /cream/], ['ointment', /ointment/], ['gel', /gel\b/], ['lotion', /lotion/], ['powder', /powder|sachet|granule/],
];
export const formFamily = (form) => {
  const text = String(form ?? '').toLowerCase();
  return (FORM_FAMILIES.find(([, re]) => re.test(text)) ?? [compact(form)])[0];
};
const strengthKey = (s) => compact(s).replace(/micrograms?|mcgs?/g, 'mcg').replace(/gms?(?![a-z])/g, 'g').replace(/milligrams?/g, 'mg');
export const looseKey = (p) => `${compact(p.name)}|${formFamily(p.form)}`;
const exactKey = (p) => [compact(p.name), strengthKey(p.strength), compact(p.form), compact(p.manufacturer)].join('|');

export function parseListing(html) {
  const out = [];
  for (const block of html.split('<a href="https://dimsbd.com/brand/').slice(1)) {
    const url = block.slice(0, block.indexOf('"'));
    const name = clip(block.match(/class="brand_name[^"]*">([\s\S]*?)<\/span>/)?.[1], 160);
    if (!url || !name) continue;
    out.push({
      url,
      name,
      form: clip(block.match(/class="[^"]*\bform\b[^"]*">\s*<div class="text-sm">([\s\S]*?)<\/div>/)?.[1], 60) || 'Unit',
      strength: clip(block.match(/class="strength">([\s\S]*?)<\/sup>/)?.[1], 80),
      genericName: clip(block.match(/<i>([\s\S]*?)<\/i>/)?.[1], 200),
      manufacturer: clip(block.match(/<\/i>\s*<\/div>\s*<div class="text-sm">([\s\S]*?)<\/div>/)?.[1], 160),
    });
  }
  return out;
}

/** "3 x 10's" is 30 units, "120's pack" is 120, a bottle is one. DIMS prices one unit. */
export function packPricePoisha(unitTaka, pack) {
  const text = String(pack);
  const grid = text.match(/(\d+)\s*[x×*]\s*(\d+)\s*'?s?\b/i);
  const count = grid ? Number(grid[1]) * Number(grid[2]) : Number(text.match(/(\d+)\s*'s/i)?.[1] ?? 1);
  const taka = unitTaka * (count || 1);
  return Number.isFinite(taka) && taka > 0 && taka < 1_000_000 ? Math.round(taka * 100) : 0;
}

export function parseDetail(html) {
  const packSize = clip(html.match(/<th[^>]*>\s*Pack size\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i)?.[1], 80);
  const unit = Number(html.match(/<th[^>]*>\s*Price\s*<\/th>\s*<td[^>]*>\s*([\d,.]+)/i)?.[1]?.replace(/,/g, ''));
  return { packSize, pricePoisha: Number.isFinite(unit) ? packPricePoisha(unit, packSize) : 0 };
}

async function fetchPage(path) {
  await sleep(DELAY_MS);
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await fetch(`${SITE}/${path}`, { headers: { 'user-agent': 'BarakaBari-catalog-import/1.0' }, signal: AbortSignal.timeout(30000) });
    } catch {
      await sleep(3000 * attempt);
      continue;
    }
    if (res.status === 403 || res.status === 429) throw new Error(`Stopped: ${res.status} on ${path}`);
    if (res.status === 404) return '';
    if (res.status >= 500) { await sleep(3000 * attempt); continue; }
    const text = await res.text();
    if (/captcha|cf-chl|just a moment/i.test(text.slice(0, 3000))) throw new Error(`Stopped: challenge on ${path}`);
    return text;
  }
  return '';
}

const links = (html, kind) => [...html.matchAll(new RegExp(`href="https://dimsbd\\.com/${kind}/([^"#?]+)"`, 'g'))].map((m) => m[1]);

async function crawl() {
  const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { seeded: false, queue: [], done: [] };
  const done = new Set(state.done);
  const queue = new Set(state.queue);
  const save = () => {
    writeFileSync(`${STATE}.tmp`, JSON.stringify({ seeded: state.seeded, queue: [...queue], done: [...done] }));
    renameSync(`${STATE}.tmp`, STATE);
  };
  const enqueue = (path) => { if (path && !done.has(path)) queue.add(path); };

  if (!state.seeded) {
    for (const letter of LETTERS) {
      for (const slug of links(await fetchPage(`companies/${letter}`), 'company')) enqueue(`company/${slug}`);
      for (const slug of links(await fetchPage(`generics/${letter}`), 'generic')) enqueue(`generic/${slug}`);
    }
    state.seeded = true;
    save();
    console.log(`seeded ${queue.size} pages`);
  }

  // Companies first: fewer requests for far more rows. Names seen on a row lead to more pages.
  let pages = 0;
  let rows = 0;
  for (;;) {
    const list = [...queue];
    const next = list.find((p) => p.startsWith('company/')) ?? list[0];
    if (!next) break;
    const found = parseListing(await fetchPage(next));
    if (found.length) appendFileSync(ROWS, found.map((r) => JSON.stringify(r)).join('\n') + '\n');
    queue.delete(next);
    done.add(next);
    for (const r of found) {
      if (r.manufacturer) enqueue(`company/${slugify(r.manufacturer)}`);
      if (r.genericName) enqueue(`generic/${slugify(r.genericName)}`);
    }
    rows += found.length;
    if (++pages % 25 === 0) {
      save();
      console.log(`pages ${pages}, rows ${rows}, queued ${queue.size}`);
    }
  }
  save();
  console.log(`crawl finished: pages ${pages}, rows ${rows}, total pages ${done.size}`);
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

async function load(dry) {
  const unique = new Map();
  for (const row of readJsonl(ROWS)) if (!unique.has(exactKey(row))) unique.set(exactKey(row), row);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const existing = (await client.query(`SELECT name, strength, form FROM "Medicine"`)).rows;
  const strengthsByProduct = new Map();
  for (const row of existing) {
    const key = looseKey(row);
    strengthsByProduct.set(key, (strengthsByProduct.get(key) ?? new Set()).add(strengthKey(row.strength)));
  }
  const isListed = (row) => {
    const strengths = strengthsByProduct.get(looseKey(row));
    return Boolean(strengths) && (strengths.has(strengthKey(row.strength)) || strengths.has('') || !strengthKey(row.strength));
  };
  const missing = [...unique.values()].filter((row) => !isListed(row));
  console.log(JSON.stringify({ listed: unique.size, alreadyHave: unique.size - missing.length, missing: missing.length }));
  if (dry) {
    console.log(missing.slice(0, 40).map((r) => `${r.name} ${r.strength} | ${r.form} | ${r.manufacturer}`).join('\n'));
    await client.end();
    return;
  }

  const details = new Map(readJsonl(DETAILS).map((d) => [d.url, d]));
  let fetched = 0;
  for (const row of missing) {
    if (details.has(row.url)) continue;
    const detail = { url: row.url, ...parseDetail(await fetchPage(`brand/${row.url}`)) };
    appendFileSync(DETAILS, JSON.stringify(detail) + '\n');
    details.set(row.url, detail);
    if (++fetched % 100 === 0) console.log(`details ${fetched}/${missing.length}`);
  }

  const categoryIds = new Map((await client.query(`SELECT id, name FROM "Category"`)).rows.map((c) => [c.name, c.id]));
  const slugs = new Set((await client.query(`SELECT slug FROM "Medicine"`)).rows.map((r) => r.slug));
  await client.query('BEGIN');
  let inserted = 0;
  let noPrice = 0;
  for (const row of missing) {
    const { packSize = '', pricePoisha = 0 } = details.get(row.url) ?? {};
    if (!pricePoisha) { noPrice++; continue; }
    const { category, isRx } = categorize({ genericName: row.genericName || 'Unspecified', form: row.form });
    let slug = dbSlug(`${row.name} ${row.strength} ${row.form} ${row.manufacturer}`);
    if (slugs.has(slug)) slug = `${slug.slice(0, 92)}-${createHash('sha1').update(exactKey(row)).digest('hex').slice(0, 7)}`;
    slugs.add(slug);
    const id = randomUUID();
    await client.query(
      `INSERT INTO "Medicine" (id, slug, name, "genericName", manufacturer, form, strength, "packSize", "pricePoisha", "isRx", "categoryId", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [id, slug, row.name, row.genericName || 'Unspecified', row.manufacturer, row.form, row.strength, packSize, pricePoisha, isRx, categoryIds.get(category.name)],
    );
    await client.query(
      `INSERT INTO "Batch" (id, "medicineId", "batchNo", "expiresAt", "qtyRemaining") VALUES ($1,$2,$3,DATE '2028-12-31',$4)`,
      [randomUUID(), id, BATCH, OPENING_QTY],
    );
    inserted++;
  }
  await client.query('COMMIT');
  await client.end();
  console.log(JSON.stringify({ inserted, noPrice, detailsFetched: fetched }));
}

const [mode] = process.argv.slice(2);
if (mode === 'crawl') await crawl();
else if (mode === 'load') await load(process.argv.includes('--dry-run'));
else throw new Error('Usage: dims-missing.mjs crawl | load [--dry-run]');
