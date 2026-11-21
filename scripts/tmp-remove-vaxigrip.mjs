/**
 * One-shot: remove VAXIGRIP medicines from the DB completely.
 * Run from repo root: node --env-file=.env scripts/tmp-remove-vaxigrip.mjs
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'libs/database/package.json'));
const pg = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
await client.connect();

try {
  await client.query('BEGIN');

  const { rows: meds } = await client.query(
    `SELECT id, slug, name, "isActive"
     FROM "Medicine"
     WHERE name ILIKE '%vaxigrip%' OR slug ILIKE '%vaxigrip%'`,
  );

  if (!meds.length) {
    console.log('No VAXIGRIP medicines found.');
    await client.query('ROLLBACK');
    process.exit(0);
  }

  console.log('Found:');
  for (const m of meds) console.log(`  ${m.id}  ${m.slug}  (${m.name}) active=${m.isActive}`);
  const ids = meds.map((m) => m.id);

  const tables = await client.query(
    `SELECT to_regclass('public."MedicineRequest"') AS medicine_request`,
  );
  if (tables.rows[0]?.medicine_request) {
    const req = await client.query(
      `UPDATE "MedicineRequest" SET "medicineId" = NULL WHERE "medicineId" = ANY($1::text[])`,
      [ids],
    );
    console.log('MedicineRequest cleared:', req.rowCount);
  }

  const { rows: oi } = await client.query(
    `SELECT COUNT(*)::int AS n FROM "OrderItem" WHERE "medicineId" = ANY($1::text[])`,
    [ids],
  );
  const orderItemCount = oi[0]?.n ?? 0;

  if (orderItemCount > 0) {
    console.log(`OrderItem refs: ${orderItemCount} — scrub + deactivate (FK blocks hard delete)`);
    await client.query(
      `DELETE FROM "OrderAllocation" oa
       USING "Batch" b
       WHERE oa."batchId" = b.id AND b."medicineId" = ANY($1::text[])`,
      [ids],
    );
    await client.query(`DELETE FROM "Batch" WHERE "medicineId" = ANY($1::text[])`, [ids]);
    for (const m of meds) {
      const tomb = `removed-${m.id.slice(-8)}`;
      await client.query(
        `UPDATE "Medicine"
         SET slug = $2,
             name = 'Removed product',
             "genericName" = '',
             manufacturer = '',
             description = '',
             "imageUrl" = '',
             "isActive" = false,
             popularity = 0
         WHERE id = $1`,
        [m.id, tomb],
      );
      console.log(`Scrubbed ${m.slug} → ${tomb}`);
    }
  } else {
    await client.query(
      `DELETE FROM "OrderAllocation" oa
       USING "Batch" b
       WHERE oa."batchId" = b.id AND b."medicineId" = ANY($1::text[])`,
      [ids],
    );
    const batches = await client.query(`DELETE FROM "Batch" WHERE "medicineId" = ANY($1::text[])`, [ids]);
    console.log('Batches deleted:', batches.rowCount);
    const del = await client.query(`DELETE FROM "Medicine" WHERE id = ANY($1::text[])`, [ids]);
    console.log('Medicines deleted:', del.rowCount);
  }

  await client.query('COMMIT');

  const { rows: left } = await client.query(
    `SELECT slug, name FROM "Medicine" WHERE name ILIKE '%vaxigrip%' OR slug ILIKE '%vaxigrip%'`,
  );
  console.log('Remaining VAXIGRIP rows:', left.length ? left : 'none');
  console.log('Done.');
} catch (e) {
  await client.query('ROLLBACK');
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
