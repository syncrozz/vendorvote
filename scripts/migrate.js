import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('RALAT: DATABASE_URL tidak ditetapkan. Sila tetapkan DATABASE_URL sebelum menjalankan migrasi.');
    process.exit(1);
  }

  console.log('[Migrasi] Menyambung ke pangkalan data PostgreSQL...');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  const client = await pool.connect();
  try {
    console.log('[Migrasi] Menjalankan migrations/001_vendorvote.sql...');
    const migrationSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_vendorvote.sql'), 'utf-8');
    await client.query(migrationSql);
    console.log('[Migrasi] Skema berjaya diselaraskan.');

    console.log('[Migrasi] Menjalankan seed data asas (seed.sql)...');
    const seedSql = fs.readFileSync(path.join(__dirname, '..', 'seed.sql'), 'utf-8');
    await client.query(seedSql);
    console.log('[Migrasi] Data permulaan (seed) berjaya dimuatkan tanpa duplikasi.');

    console.log('[Migrasi] Selesai sepenuhnya dengan jayanya.');
  } catch (err) {
    console.error('[Migrasi] Ralat semasa pelaksanaan skema:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
