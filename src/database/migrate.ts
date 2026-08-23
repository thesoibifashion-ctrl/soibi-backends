import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const migrationDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

const BASELINE_MIGRATION = '015_addresses_analytics_and_product_views.sql';

async function ensureMigrationTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function baselineExistingMigrations(
  migrationFiles: string[],
): Promise<void> {
  const baselineIndex = migrationFiles.indexOf(BASELINE_MIGRATION);

  if (baselineIndex === -1) {
    return;
  }

  const existingMigrations = migrationFiles.slice(0, baselineIndex + 1);

  for (const file of existingMigrations) {
    await pool.query(
      `
        INSERT INTO schema_migrations (filename)
        VALUES ($1)
        ON CONFLICT (filename) DO NOTHING
      `,
      [file],
    );
  }

  if (existingMigrations.length > 0) {
    console.log(
      `Baselined ${existingMigrations.length} existing migrations through ${BASELINE_MIGRATION}`,
    );
  }
}

async function runMigrations(): Promise<void> {
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort((left, right) => left.localeCompare(right));

  if (migrationFiles.length === 0) {
    throw new Error('No SQL migrations found');
  }

  await ensureMigrationTable();

  /*
   * The database already contains migrations 001–015, but this project
   * previously had no migration tracking table.
   *
   * Baseline those known migrations so they are never executed again.
   */
  await baselineExistingMigrations(migrationFiles);

  const client = await pool.connect();

  try {
    for (const file of migrationFiles) {
      const result = await client.query(
        `
          SELECT 1
          FROM schema_migrations
          WHERE filename = $1
        `,
        [file],
      );

      if (result.rowCount && result.rowCount > 0) {
        console.log(`Skipping ${file} (already applied)`);
        continue;
      }

      const sql = await readFile(join(migrationDirectory, file), 'utf8');

      console.log(`Applying ${file}`);

      await client.query('BEGIN');

      try {
        await client.query(sql);

        await client.query(
          `
            INSERT INTO schema_migrations (filename)
            VALUES ($1)
          `,
          [file],
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations()
  .then(() => console.log('All migrations applied successfully'))
  .catch((error: unknown) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  });