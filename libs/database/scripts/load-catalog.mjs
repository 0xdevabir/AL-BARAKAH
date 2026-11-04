/**
 * Load the files written by crawl-catalog.mjs into Medicine / Category / Batch. Safe to re-run.
 *
 *   node --env-file=.env packages/database/scripts/load-catalog.mjs [--dry-run]
 *
 * - A source row is rejected unless its name matches its own URL slug. MediWhole has rows whose
 *   name, strength and price belong to a different product than their generic and form, and
 *   importing those would show customers the wrong drug.
 * - The same product is listed once, whatever its spelling: see productKey().
 * - On re-runs, price, stock and name stay as they are, and so does a category an admin chose,
 *   unless the source marks the product herbal.
 *
 * Opening stock is the source quantity when above zero, otherwise 24, in a batch named CATALOG
 * with a placeholder expiry, so the catalog can be browsed before real inventory is counted.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { CATEGORIES, categorize } from './catalog-categories.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../data');
const IMAGE_BASE = 'https://api.mediwholebd.com/api/v1/';
const OPENING_QTY = 24;
const DRY = process.argv.includes('--dry-run');
const DEMO_MAKER = 'Demo Pharma';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n).trim();
const compact = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '');
const categorySlug = (name) => slugify(name);
const normMaker = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(ltd|limited|plc|inc|co|company|pharmaceuticals?|pharma|laboratories|laboratory|labs?|industries|bangladesh)\b/g, '').replace(/\s+/g, '');

/** Brand + strength + form + company, ignoring case, spacing, punctuation and legal suffixes. */
export const productKey = (p) => [compact(p.name), compact(p.strength), compact(p.form), normMaker(p.manufacturer)].join('|');

/** MediWhole slugs are built from the real product's brand name and form. */
export const isConsistent = (raw) => {
  const slug = compact(raw.slug);
  const name = compact(raw.name);
  return Boolean(name) && slug.startsWith(name) && slug.includes(compact(raw.dosageForm?.name));
};

function packSize(raw) {
  const given = clip(raw.packageSize, 80);
  if (given) return given;
  if (raw.stripInBox > 1 && raw.unitInStripe > 1) return `${raw.stripInBox} x ${raw.unitInStripe}`;
  if (raw.unitInStripe > 1) return `${raw.unitInStripe}'s`;
  return '';
}

export function toProduct(raw) {
  const genericName = clip(raw.generic?.name || 'Unspecified', 200);
  const form = clip(raw.dosageForm?.name || 'Unit', 60);
  const strength = clip(raw.strength, 80).replace(/^\.+$/, '');
  const taka = Number(raw.salePrice);
  const { category, isRx } = categorize({ genericName, form, type: raw.type });
  return {
    name: clip(raw.name, 160), genericName, form, strength,
    manufacturer: clip(raw.manufacturer?.name, 160),
    packSize: packSize(raw),
    pricePoisha: Number.isFinite(taka) && taka > 0 && taka < 1_000_000 ? Math.round(taka * 100) : 0,
    imageUrl: typeof raw.image === 'string' && raw.image ? new URL(raw.image.replace(/^\//, ''), IMAGE_BASE).href : '',
    popularity: (Number(raw.views) || 0) + 50 * (Number(raw.purchaseCount) || 0),
    stock: Number(raw.stockQuantity) > 0 ? Math.floor(Number(raw.stockQuantity)) : 0,
    category, isRx,
  };
}

async function readProducts() {
  const stats = { rows: 0, rejectedInconsistent: 0, rejectedNoPrice: 0, duplicates: 0 };
  const byKey = new Map();
  const rejectedKeys = new Set();
  const lines = createInterface({ input: createReadStream(join(DATA, 'mediwhole.jsonl')) });
  for await (const line of lines) {
    if (!line) continue;
    stats.rows++;
    const raw = JSON.parse(line);
    const p = toProduct(raw);
    if (!isConsistent(raw)) { stats.rejectedInconsistent++; rejectedKeys.add(productKey(p)); continue; }
    if (!p.pricePoisha) { stats.rejectedNoPrice++; continue; }
    const key = productKey(p);
    const seen = byKey.get(key);
    if (!seen) { byKey.set(key, p); continue; }
    stats.duplicates++;
    seen.popularity = Math.max(seen.popularity, p.popularity);
    if (!seen.imageUrl) seen.imageUrl = p.imageUrl;
  }
  // One image on many different brands is the source's placeholder, not a photo of the product.
  const uses = new Map();
  for (const p of byKey.values()) if (p.imageUrl) uses.set(p.imageUrl, (uses.get(p.imageUrl) ?? new Set()).add(compact(p.name)));
  let placeholders = 0;
  for (const p of byKey.values()) if (p.imageUrl && uses.get(p.imageUrl).size > 3) { p.imageUrl = ''; placeholders++; }
  for (const key of byKey.keys()) rejectedKeys.delete(key);
  return { products: [...byKey.values()], rejectedKeys, stats: { ...stats, placeholders } };
}

function report(products, stats) {
  const count = (by) => [...products.reduce((m, p) => m.set(by(p), (m.get(by(p)) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
  console.log(JSON.stringify({ ...stats, unique: products.length, withPhoto: products.filter((p) => p.imageUrl).length, rx: products.filter((p) => p.isRx).length }));
  console.log(count((p) => p.category.name).map(([k, v]) => `${v}\t${k}`).join('\n'));
  const other = products.filter((p) => p.category.name === 'Other Medicines');
  console.log('\nTop uncategorised generics:\n' + [...other.reduce((m, p) => m.set(p.genericName, (m.get(p.genericName) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([k, v]) => `${v} ${k}`).join(' | '));
}

async function main() {
  const { products, rejectedKeys, stats } = await readProducts();
  report(products, stats);
  if (DRY) return;

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('BEGIN');

  const catIds = new Map();
  for (const cat of CATEGORIES) {
    const { rows } = await client.query(
      `INSERT INTO "Category" (id, name, slug, "sortOrder") VALUES ($1,$2,$3,$4)
       ON CONFLICT (slug) DO UPDATE SET "sortOrder" = EXCLUDED."sortOrder" RETURNING id`,
      [randomUUID(), cat.name, categorySlug(cat.name), cat.sortOrder],
    );
    catIds.set(cat.name, rows[0].id);
  }
  const curated = [...catIds.values()];

  // The source's stand-in picture is not a product photo; showing nothing is more honest.
  const noPhoto = await client.query(`UPDATE "Medicine" SET "imageUrl" = '', "updatedAt" = NOW() WHERE "imageUrl" LIKE '%/products/default.png'`);

  const existing = await client.query(`SELECT id, slug, name, strength, form, manufacturer, "genericName", "categoryId" FROM "Medicine" WHERE manufacturer <> $1`, [DEMO_MAKER]);
  const byKey = new Map(existing.rows.map((r) => [productKey(r), r]));

  // Hidden, not deleted: a product that failed the integrity check may already be on an order.
  const wrongIds = existing.rows.filter((r) => rejectedKeys.has(productKey(r))).map((r) => r.id);
  const hidden = await client.query(`UPDATE "Medicine" SET "isActive" = false, "updatedAt" = NOW() WHERE id = ANY($1) AND "isActive"`, [wrongIds]);
  const slugs = new Set((await client.query(`SELECT slug FROM "Medicine"`)).rows.map((r) => r.slug));

  let inserted = 0;
  let merged = 0;
  for (const p of products) {
    const key = productKey(p);
    const found = byKey.get(key);
    const categoryId = catIds.get(p.category.name);
    if (found) {
      await client.query(
        `UPDATE "Medicine" SET
           "imageUrl" = CASE WHEN "imageUrl" = '' THEN $2 ELSE "imageUrl" END,
           "packSize" = CASE WHEN "packSize" = '' THEN $3 ELSE "packSize" END,
           popularity = GREATEST(popularity, $4),
           "categoryId" = CASE WHEN $5 THEN $6 ELSE "categoryId" END,
           "isRx" = CASE WHEN $5 THEN false ELSE "isRx" END,
           "updatedAt" = NOW()
         WHERE id = $1`,
        [found.id, p.imageUrl, p.packSize, p.popularity, p.category.name === 'Herbal & Natural', categoryId],
      );
      merged++;
      continue;
    }
    let slug = slugify(`${p.name} ${p.strength} ${p.form} ${normMaker(p.manufacturer)}`);
    if (slugs.has(slug)) slug = `${slug.slice(0, 92)}-${createHash('sha1').update(key).digest('hex').slice(0, 7)}`;
    slugs.add(slug);
    const id = randomUUID();
    await client.query(
      `INSERT INTO "Medicine" (id, slug, name, "genericName", manufacturer, form, strength, "packSize", "pricePoisha", "isRx", "imageUrl", popularity, "categoryId", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
      [id, slug, p.name, p.genericName, p.manufacturer, p.form, p.strength, p.packSize, p.pricePoisha, p.isRx, p.imageUrl, p.popularity, categoryId],
    );
    await client.query(
      `INSERT INTO "Batch" (id, "medicineId", "batchNo", "expiresAt", "qtyRemaining")
       VALUES ($1,$2,'CATALOG',DATE '2028-12-31',$3) ON CONFLICT ("medicineId","batchNo") DO NOTHING`,
      [randomUUID(), id, p.stock || OPENING_QTY],
    );
    byKey.set(key, { id });
    inserted++;
  }

  // Rows from before this taxonomy move into it; the remainder is retried as the rules improve.
  const stale = await client.query(
    `SELECT id, "genericName", form FROM "Medicine" WHERE manufacturer <> $1 AND (NOT ("categoryId" = ANY($2)) OR "categoryId" = $3)`,
    [DEMO_MAKER, curated, catIds.get('Other Medicines')],
  );
  for (const row of stale.rows) {
    const { category, isRx } = categorize(row);
    await client.query(`UPDATE "Medicine" SET "categoryId" = $2, "isRx" = "isRx" OR $3, "updatedAt" = NOW() WHERE id = $1`, [row.id, catIds.get(category.name), isRx]);
  }

  // Square publishes no prices, so it only supplies photos, for Square's own products.
  let squarePhotos = 0;
  const squareFile = (url) => decodeURIComponent(url).toLowerCase();
  const formHint = (form) => ['suppository', 'capsule', 'tablet', 'syrup', 'suspension', 'drop', 'injection', 'infusion', 'cream', 'ointment', 'gel', 'inhaler', 'inhal'].find((word) => form.toLowerCase().includes(word));
  for (const photo of JSON.parse(readFileSync(join(DATA, 'square.json'), 'utf8'))) {
    const file = squareFile(photo.imageUrl);
    const { rows } = await client.query(
      `SELECT id, form, strength FROM "Medicine"
       WHERE "imageUrl" = '' AND manufacturer ILIKE '%square%' AND regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = $1`,
      [compact(photo.name)],
    );
    for (const row of rows) {
      const hint = formHint(row.form);
      const strength = (String(row.strength).match(/\d+(?:\.\d+)?/) || [''])[0];
      if (hint && !file.includes(hint)) continue;
      if (strength && !file.includes(strength)) continue;
      await client.query(`UPDATE "Medicine" SET "imageUrl" = $1, "updatedAt" = NOW() WHERE id = $2 AND "imageUrl" = ''`, [photo.imageUrl, row.id]);
      squarePhotos++;
    }
  }

  // Demo rows have invented prices and would list real brands twice.
  const demo = await client.query(`UPDATE "Medicine" SET "isActive" = false, "updatedAt" = NOW() WHERE manufacturer = $1 AND "isActive"`, [DEMO_MAKER]);
  const emptied = await client.query(`DELETE FROM "Category" c WHERE NOT (c.id = ANY($1)) AND NOT EXISTS (SELECT 1 FROM "Medicine" m WHERE m."categoryId" = c.id)`, [curated]);

  await client.query('COMMIT');
  await client.end();
  console.log(JSON.stringify({ inserted, merged, placeholderPhotosCleared: noPhoto.rowCount, wrongRowsHidden: hidden.rowCount, recategorised: stale.rowCount, squarePhotos, demoHidden: demo.rowCount, categoriesRemoved: emptied.rowCount }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
