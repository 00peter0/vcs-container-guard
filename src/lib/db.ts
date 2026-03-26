import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

let pool: Pool | null = null;

export function initDb(connectionString: string): void {
  pool = new Pool({
    connectionString,
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => {
    process.stderr.write(`[container-guard] pg pool error: ${err.message}\n`);
  });
}

export function getPool(): Pool {
  if (!pool) throw new Error('[container-guard] db not initialized');
  return pool;
}

export async function query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function queryOne<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T | null> {
  const result = await getPool().query<T>(text, params);
  return result.rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  let began = false;
  try {
    await client.query('BEGIN');
    began = true;
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    if (began) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        process.stderr.write(`[container-guard] ROLLBACK failed: ${rollbackErr}\n`);
      }
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
