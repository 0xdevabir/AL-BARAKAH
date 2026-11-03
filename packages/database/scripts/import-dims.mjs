/**
 * Fill gaps from https://dimsbd.com/generics. Does not copy monographs.
 *
 * A brand we already have (same name, strength, company, and a compatible form)
 * is not inserted again. Empty generic, strength, form, pack, or price is filled.
 * DIMS publishes a unit price; pack price is unit × the "'s" count (120's × ৳6 = ৳720).
 *
 * New brands are added once. One request at a time. A block stops the run.
 *
 *   node --env-file=.env packages/database/scripts/import-dims.mjs
 */
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { categorize } from './catalog-categories.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../data');
const STATE_PATH = join(DATA, 'dims-state.json');
const BRANDS_PATH = join(DATA, 'dims-brands.jsonl');
const UA = 'BarakaBari-catalog-import/1.0';
const DELAY_MS = Number(process.env.CATALOG_DELAY_MS || 700);
const OPENING_QTY = 24;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n).trim();
const decode = (s) => String(s ?? '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const compact = (s) => decode(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '');
const normMaker = (s) => decode(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(ltd|limited|plc|inc|co|company|pharmaceuticals?|pharma|laboratories|laboratory|labs?|industries|bangladesh|works)\b/g, '')
  .replace(/\s+/g, '');
const productKey = (p) => [compact(p.name), compact(p.strength), compact(p.form), normMaker(p.manufacturer)].join('|');
const looseKey = (p) => [compact(p.name), compact(p.strength), normMaker(p.manufacturer)].join('|');

function formsCompatible(a, b) {
  const x = compact(a);
  const y = compact(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** DIMS "Price" is per unit. 120's pack at ৳6 is ৳720. */
export function packPricePoisha(unitTaka, pack) {
  const count = Number((String(pack).match(/(\d+)\s*'s/i) || [])[1] || 0);
  const taka = count > 0 ? unitTaka * count : unitTaka;
  if (!Number.isFinite(taka) || taka <= 0 || taka >= 1_000_000) return 0;
  return Math.round(taka * 100);
}

export function parseGenericPage(html) {
  const re = /href="(https:\/\/dimsbd\.com\/brand\/[^"]+)"[\s\S]*?<div class="text-sm">([^<]*)<\/div>\s*<\/div>\s*<div class="md:flex-grow"\s*>\s*<div>\s*<span class="brand_name[^"]*">([^<]*)<\/span>\s*<sup class="strength">([^<]*)<\/sup>[\s\S]*?<i>\s*([\s\S]*?)<\/i>[\s\S]*?<div class="text-sm">\s*([\s\S]*?)<\/div>/g;
  const out = [];
  for (const m of html.matchAll(re)) {
    const name = clip(decode(m[3]), 160);
    if (!name) continue;
    out.push({
      url: m[1],
      form: clip(decode(m[2]), 60) || 'Unit',
      name,
      strength: clip(decode(m[4]), 80),
      genericName: clip(decode(m[5].replace(/<[^>]+>/g, ' ')), 200),
      manufacturer: clip(decode(m[6].replace(/<[^>]+>/g, ' ')), 160),
    });
  }
  return out;
}

export function parseBrandFacts(html) {
  const pack = decode((html.match(/<th>\s*Pack size\s*<\/th>\s*<td[^>]*>\s*([^<]+)/i) || [])[1] || '');
  const price = Number((html.match(/<th>\s*Price\s*<\/th>\s*<td[^>]*>\s*([\d,.]+)/i) || [])[1]?.replace(/,/g, '') || '');
  return { packSize: clip(pack, 80), pricePoisha: Number.isFinite(price) ? packPricePoisha(price, pack) : 0 };
}

export function genericLinks(html) {
  return [...new Set([...html.matchAll(/https:\/\/dimsbd\.com\/generic\/[a-z0-9-]+/g)].map((m) => m[0]))];
}

async function getText(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(30000), redirect: 'follow' });
    } catch {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.status === 403 || res.status === 429) throw new Error(`Blocked ${res.status} ${url}`);
    if (res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
    if (!res.ok) return '';
    const text = await res.text();
    if (/captcha|security check/i.test(text) && !/brand_name|Pack size/i.test(text)) throw new Error(`Blocked challenge ${url}`);
    return text;
  }
  return '';
}

async function readState() {
  try { return JSON.parse(await readFile(STATE_PATH, 'utf8')); } catch { return { genericsDone: {}, brandsDone: {} }; }
}

async function writeState(state) {
  await mkdir(DATA, { recursive: true });
  const tmp = `${STATE_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify({ genericsDone: state.genericsDone, brandsDone: state.brandsDone }));
  const { rename } = await import('node:fs/promises');
  await rename(tmp, STATE_PATH);
}

async function selfTest() {
  const { readFileSync } = await import('node:fs');
  const brands = parseGenericPage(readFileSync('/tmp/dims-one.html', 'utf8'));
  const facts = parseBrandFacts(readFileSync('/tmp/dims-seclo20.html', 'utf8'));
  const links = genericLinks(readFileSync('/tmp/dims-generics.html', 'utf8'));
  const ace = brands.find((b) => b.name === 'Aceclofar');
  console.log(JSON.stringify({ brands: brands.length, ace, seclo: facts, links: links.length }));
  if (brands.length < 100 || !ace || compact(ace.strength) !== '100mg' || facts.pricePoisha !== 72000 || links.length < 40) {
    throw new Error('DIMS parser self-test failed');
  }
}

function indexRows(rows) {
  const byKey = new Map();
  const byLoose = new Map();
  for (const row of rows) {
    byKey.set(productKey(row), row);
    const loose = looseKey(row);
    const list = byLoose.get(loose) || [];
    list.push(row);
    byLoose.set(loose, list);
  }
  return { byKey, byLoose };
}

function findExisting(indexes, brand) {
  const exact = indexes.byKey.get(productKey(brand));
  if (exact) return exact;
  const list = indexes.byLoose.get(looseKey(brand)) || [];
  return list.find((row) => formsCompatible(row.form, brand.form)) || null;
}

async function applyFill(client, row, brand) {
  const genericMissing = !row.genericName || row.genericName === 'Unspecified';
  const strengthMissing = !row.strength;
  const makerMissing = !row.manufacturer;
  const formMissing = !row.form || row.form === 'Unit';
  const packMissing = !row.packSize && brand.packSize;
  const priceMissing = row.pricePoisha === 0 && brand.pricePoisha > 0;
  if (!genericMissing && !strengthMissing && !makerMissing && !formMissing && !packMissing && !priceMissing) return false;
  let categoryId = null;
  let isRx = null;
  if (genericMissing && brand.genericName) {
    const judged = categorize({ genericName: brand.genericName, form: brand.form || row.form });
    const cat = await client.query(`SELECT id FROM "Category" WHERE slug = $1`, [slugify(judged.category.name)]);
    categoryId = cat.rows[0]?.id ?? null;
    isRx = judged.isRx;
  }
  await client.query(
    `UPDATE "Medicine" SET
       "genericName" = CASE WHEN "genericName" IN ('', 'Unspecified') AND $2 <> '' THEN $2 ELSE "genericName" END,
       strength = CASE WHEN strength = '' AND $3 <> '' THEN $3 ELSE strength END,
       manufacturer = CASE WHEN manufacturer = '' AND $4 <> '' THEN $4 ELSE manufacturer END,
       form = CASE WHEN form IN ('', 'Unit') AND $5 <> '' THEN $5 ELSE form END,
       "packSize" = CASE WHEN "packSize" = '' AND $6 <> '' THEN $6 ELSE "packSize" END,
       "pricePoisha" = CASE WHEN "pricePoisha" = 0 AND $7 > 0 THEN $7 ELSE "pricePoisha" END,
       "isActive" = CASE WHEN "pricePoisha" = 0 AND $7 > 0 THEN true ELSE "isActive" END,
       "categoryId" = COALESCE($8, "categoryId"),
       "isRx" = CASE WHEN $9::boolean IS NULL THEN "isRx" ELSE "isRx" OR $9 END,
       "updatedAt" = NOW()
     WHERE id = $1`,
    [row.id, brand.genericName || '', brand.strength || '', brand.manufacturer || '', brand.form || '', brand.packSize || '', brand.pricePoisha || 0, categoryId, isRx],
  );
  if (priceMissing) {
    await client.query(
      `INSERT INTO "Batch" (id, "medicineId", "batchNo", "expiresAt", "qtyRemaining")
       VALUES ($1,$2,'CATALOG',DATE '2028-12-31',$3) ON CONFLICT ("medicineId","batchNo") DO NOTHING`,
      [randomUUID(), row.id, OPENING_QTY],
    );
  }
  row.genericName = genericMissing ? brand.genericName : row.genericName;
  row.strength = strengthMissing ? brand.strength : row.strength;
  row.manufacturer = makerMissing ? brand.manufacturer : row.manufacturer;
  row.form = formMissing ? brand.form : row.form;
  row.packSize = packMissing ? brand.packSize : row.packSize;
  row.pricePoisha = priceMissing ? brand.pricePoisha : row.pricePoisha;
  return true;
}

async function insertBrand(client, indexes, slugs, brand) {
  const { category, isRx } = categorize({ genericName: brand.genericName || 'Unspecified', form: brand.form });
  const cat = await client.query(`SELECT id FROM "Category" WHERE slug = $1`, [slugify(category.name)]);
  if (!cat.rows[0]) return false;
  const key = productKey(brand);
  let slug = slugify(`${brand.name} ${brand.strength} ${brand.form} ${normMaker(brand.manufacturer)}`) || slugify(brand.name);
  if (slugs.has(slug)) slug = `${slug.slice(0, 92)}-${createHash('sha1').update(key).digest('hex').slice(0, 7)}`;
  slugs.add(slug);
  const id = randomUUID();
  const active = brand.pricePoisha > 0;
  await client.query(
    `INSERT INTO "Medicine" (id, slug, name, "genericName", manufacturer, form, strength, "packSize", "pricePoisha", "isRx", "isActive", "imageUrl", "categoryId", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'',$12,NOW())`,
    [id, slug, brand.name, brand.genericName || 'Unspecified', brand.manufacturer, brand.form, brand.strength, brand.packSize || '', brand.pricePoisha || 0, isRx, active, cat.rows[0].id],
  );
  if (active) {
    await client.query(
      `INSERT INTO "Batch" (id, "medicineId", "batchNo", "expiresAt", "qtyRemaining")
       VALUES ($1,$2,'CATALOG',DATE '2028-12-31',$3)`,
      [randomUUID(), id, OPENING_QTY],
    );
  }
  const row = { id, ...brand, genericName: brand.genericName, pricePoisha: brand.pricePoisha || 0, packSize: brand.packSize || '' };
  indexes.byKey.set(key, row);
  const loose = looseKey(brand);
  indexes.byLoose.set(loose, [...(indexes.byLoose.get(loose) || []), row]);
  return true;
}

async function readBrandFile() {
  const brands = [];
  try {
    const lines = createInterface({ input: createReadStream(BRANDS_PATH) });
    for await (const line of lines) if (line) brands.push(JSON.parse(line));
  } catch { /* first run */ }
  return brands;
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await selfTest();
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await mkdir(DATA, { recursive: true });
  const state = await readState();
  state.genericsDone ||= {};
  state.brandsDone ||= {};

  // The site's ?page= links always return the first 50 names, so each letter's first page is the list it actually serves.
  const letterPages = ['https://dimsbd.com/generics/numeric', ...[...'abcdefghijklmnopqrstuvwxyz'].map((letter) => `https://dimsbd.com/generics/${letter}`)];
  const genericUrls = new Set();
  for (const indexUrl of letterPages) {
    await sleep(DELAY_MS);
    const html = await getText(indexUrl);
    const before = genericUrls.size;
    for (const url of genericLinks(html)) genericUrls.add(url);
    console.log(`${indexUrl.split('/').pop()} +${genericUrls.size - before} total ${genericUrls.size}`);
  }
  console.log(`generic pages ${genericUrls.size}`);

  let parsed = 0;
  for (const url of genericUrls) {
    if (state.genericsDone[url]) continue;
    await sleep(DELAY_MS);
    const html = await getText(url);
    const brands = html ? parseGenericPage(html) : [];
    if (brands.length) await appendFile(BRANDS_PATH, brands.map((b) => JSON.stringify(b)).join('\n') + '\n');
    state.genericsDone[url] = brands.length;
    parsed++;
    if (parsed % 25 === 0) {
      await writeState(state);
      console.log(`parsed ${parsed} new generic pages, last ${brands.length} brands`);
    }
  }
  await writeState(state);

  const seen = new Set();
  const brands = [];
  for (const brand of await readBrandFile()) {
    const key = `${brand.url}|${productKey(brand)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    brands.push(brand);
  }
  console.log(`unique brand rows ${brands.length}`);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const existing = await client.query(`SELECT id, name, strength, form, manufacturer, "genericName", "packSize", "pricePoisha" FROM "Medicine"`);
  const indexes = indexRows(existing.rows);
  const slugs = new Set((await client.query(`SELECT slug FROM "Medicine"`)).rows.map((r) => r.slug));

  let filled = 0;
  let skipped = 0;
  const needPage = [];
  for (const brand of brands) {
    const found = findExisting(indexes, brand);
    if (found) {
      if (await applyFill(client, found, brand)) filled++;
      else skipped++;
      const packMissing = !found.packSize;
      if (packMissing && !state.brandsDone[brand.url]) needPage.push({ ...brand, existingId: found.id });
      continue;
    }
    if (!state.brandsDone[brand.url]) needPage.push(brand);
  }
  console.log(`filled from listings ${filled}, already complete ${skipped}, brand pages for gaps ${needPage.length}`);

  let inserted = 0;
  let priced = 0;
  for (const brand of needPage) {
    await sleep(DELAY_MS);
    const html = await getText(brand.url);
    const facts = html ? parseBrandFacts(html) : { packSize: '', pricePoisha: 0 };
    const full = { ...brand, packSize: facts.packSize || brand.packSize || '', pricePoisha: facts.pricePoisha || 0 };
    state.brandsDone[brand.url] = 1;
    const found = brand.existingId ? indexes.byKey.get(productKey(brand)) || findExisting(indexes, brand) : findExisting(indexes, full);
    if (found) {
      if (await applyFill(client, found, full)) filled++;
    } else if (await insertBrand(client, indexes, slugs, full)) {
      inserted++;
      if (full.pricePoisha > 0) priced++;
    }
    if ((inserted + filled) % 50 === 0) {
      await writeState(state);
      console.log(`inserted ${inserted} (${priced} priced), filled ${filled}`);
    }
  }
  await writeState(state);
  const totals = await client.query(`SELECT count(*) FILTER (WHERE "isActive")::int AS active, count(*)::int AS rows FROM "Medicine"`);
  console.log(JSON.stringify({ filled, skipped, inserted, priced, brandPages: needPage.length, ...totals.rows[0] }));
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
