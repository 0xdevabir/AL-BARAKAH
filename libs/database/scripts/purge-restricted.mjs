/**
 * Remove every medicine the store may no longer sell: anything that fails the OTC policy in
 * libs/domain/src/otc.ts, or is still flagged prescription-only. Dry run by default.
 *
 *   pnpm --filter @albarakah/domain build
 *   node --env-file=.env libs/database/scripts/purge-restricted.mjs            # report only
 *   node --env-file=.env libs/database/scripts/purge-restricted.mjs --apply    # change the DB
 *
 * - Never ordered: batches and the medicine row are deleted.
 * - On a past order: the row stays so order history keeps its name and price, but it is hidden,
 *   flagged prescription-only and its stock set to zero, so it can never be sold again.
 * - Kept medicines have isRx cleared, since everything left is over the counter.
 * One transaction: either all of it happens or none of it does.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const { otcCheck } = await import(join(here, '../../domain/dist/otc.js')).catch(() => {
  console.error('Build the domain package first: pnpm --filter @albarakah/domain build');
  process.exit(1);
});

const APPLY = process.argv.includes('--apply');
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL missing (run with --env-file=.env)');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
await client.connect();

try {
  await client.query('BEGIN');
  const { rows } = await client.query(
    `SELECT m.id, m.slug, m.name, m."genericName", m.form, m."isRx", m."isActive", c.name AS category,
            EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."medicineId" = m.id) AS ordered
       FROM "Medicine" m JOIN "Category" c ON c.id = m."categoryId"`,
  );

  const remove = [];
  const keep = [];
  for (const m of rows) {
    const res = otcCheck({
      genericName: m.genericName, form: m.form, name: m.name,
      herbal: m.category === 'Herbal & Natural',
      device: m.category === 'Medical Devices & Care',
    });
    if (res.ok) keep.push(m);
    else remove.push({ ...m, reason: res.reason });
  }
  const del = remove.filter((m) => !m.ordered).map((m) => m.id);
  const hide = remove.filter((m) => m.ordered).map((m) => m.id);
  const unflag = keep.filter((m) => m.isRx).map((m) => m.id);

  const reportFile = join(here, '../data/purge-report.tsv');
  writeFileSync(reportFile, ['action\tslug\tname\tgeneric\tform\treason', ...remove.map((m) => [m.ordered ? 'hide' : 'delete', m.slug, m.name, m.genericName, m.form, m.reason].join('\t'))].join('\n'));
  console.log(JSON.stringify({ total: rows.length, keep: keep.length, delete: del.length, hideOrdered: hide.length, rxFlagCleared: unflag.length, report: reportFile }));

  if (!APPLY) {
    console.log('Dry run: nothing changed. Review the report, then re-run with --apply.');
    await client.query('ROLLBACK');
  } else {
    const all = [...del, ...hide];
    const req = await client.query(`UPDATE "MedicineRequest" SET "medicineId" = NULL WHERE "medicineId" = ANY($1::text[])`, [all]);
    const alloc = await client.query(
      `DELETE FROM "OrderAllocation" oa USING "Batch" b WHERE oa."batchId" = b.id AND b."medicineId" = ANY($1::text[])`,
      [del],
    );
    const batches = await client.query(`DELETE FROM "Batch" WHERE "medicineId" = ANY($1::text[])`, [del]);
    const deleted = await client.query(`DELETE FROM "Medicine" WHERE id = ANY($1::text[])`, [del]);
    const zeroed = await client.query(`UPDATE "Batch" SET "qtyRemaining" = 0 WHERE "medicineId" = ANY($1::text[])`, [hide]);
    const hidden = await client.query(`UPDATE "Medicine" SET "isActive" = false, "isRx" = true, "updatedAt" = NOW() WHERE id = ANY($1::text[])`, [hide]);
    const cleared = await client.query(`UPDATE "Medicine" SET "isRx" = false, "updatedAt" = NOW() WHERE id = ANY($1::text[])`, [unflag]);
    const emptied = await client.query(`DELETE FROM "Category" c WHERE NOT EXISTS (SELECT 1 FROM "Medicine" m WHERE m."categoryId" = c.id)`);
    await client.query('COMMIT');
    console.log(JSON.stringify({
      requestsUnlinked: req.rowCount, allocationsDeleted: alloc.rowCount, batchesDeleted: batches.rowCount,
      medicinesDeleted: deleted.rowCount, batchesZeroed: zeroed.rowCount, medicinesHidden: hidden.rowCount,
      rxFlagCleared: cleared.rowCount, emptyCategoriesRemoved: emptied.rowCount,
    }));
  }
} catch (err) {
  await client.query('ROLLBACK');
  console.error(err);
  process.exitCode = 1;
} finally {
  await client.end();
}
