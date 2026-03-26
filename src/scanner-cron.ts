import { initDb, closeDb } from './lib/db';
import { scan } from './scanner';

const DEFAULT_DB_URL = 'postgresql://vcs-admin@127.0.0.1:5432/container_guard';

async function run(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'] ?? DEFAULT_DB_URL;
  const startedAt = Date.now();

  process.stdout.write(`[container-guard] scanner-cron start ${new Date(startedAt).toISOString()}\n`);

  initDb(connectionString);

  try {
    await scan();
  } finally {
    await closeDb();
  }

  const durationMs = Date.now() - startedAt;
  process.stdout.write(`[container-guard] scanner-cron done duration_ms=${durationMs}\n`);
}

run().then(() => {
  process.exit(0);
}).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[container-guard] scanner-cron error: ${message}\n`);
  process.exit(1);
});
