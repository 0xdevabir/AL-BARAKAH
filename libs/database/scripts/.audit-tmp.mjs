import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
console.log((await c.query(`SELECT count(*) total, max("createdAt") newest_created, max("updatedAt") newest_updated FROM "Medicine"`)).rows);
await c.end();
