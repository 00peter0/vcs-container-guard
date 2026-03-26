import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { readFileSync, statSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { initDb, query, queryOne, closeDb } from './lib/db';
import { scan } from './scanner';
import containersPlugin from './routes/containers';
import imagesPlugin from './routes/images';

interface Config {
  dbUrl: string;
  apiPort?: number;
}

interface IssueRow {
  id: number;
  container_id: string;
  port_binding_id: string | null;
  rule_id: string;
  severity: string;
  status: string;
  message: string;
  suggestion: string | null;
  fingerprint: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

interface StatsRow {
  open_issues: string;
  acknowledged_issues: string;
  resolved_issues: string;
  critical_count: string;
  high_count: string;
  medium_count: string;
  low_count: string;
}

function loadConfig(): Config {
  const raw = readFileSync(join(__dirname, '..', 'config.json'), 'utf-8');
  return JSON.parse(raw) as Config;
}

const PORT = process.env['CG_API_PORT'] ? parseInt(process.env['CG_API_PORT'], 10) : 3847;

const server = Fastify({
  logger: {
    level: 'warn',
    file: '/var/log/container-guard-access.log',
  },
});

server.register(cors, { origin: false });
server.register(rateLimit, {
  max: 60,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
});
server.register(containersPlugin);
server.register(imagesPlugin);

server.addHook('onRequest', async (req, reply) => {
  if (req.method === 'GET' && req.url === '/health') return;

  const apiKey = process.env['CG_API_KEY'];
  if (!apiKey) {
    process.stderr.write('[container-guard] WARNING: CG_API_KEY is not set — request denied\n');
    return reply.status(401).send({ error: 'unauthorized' });
  }

  const provided = req.headers['x-api-key'];
  if (provided !== apiKey) {
    return reply.status(401).send({ error: 'unauthorized' });
  }
});

server.get('/health', async (_req, reply) => {
  try {
    await query('SELECT 1');
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    return reply.status(503).send({ status: 'degraded', timestamp: new Date().toISOString() });
  }
});

server.get('/api/issues', async (req, reply) => {
  const { status, severity, container_id } = req.query as Record<string, string | undefined>;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (severity) {
    params.push(severity);
    conditions.push(`severity = $${params.length}`);
  }
  if (container_id) {
    params.push(container_id);
    conditions.push(`container_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await query<IssueRow>(
      `SELECT i.*,
        c.name AS container_name,
        c.image,
        c.docker_id,
        pb.host_ip,
        pb.host_port,
        pb.container_port
       FROM issues i
       LEFT JOIN containers c ON c.id = i.container_id
       LEFT JOIN port_bindings pb ON pb.id = i.port_binding_id
       ${where} ORDER BY last_seen_at DESC`,
      params,
    );
    return reply.send(result.rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'query failed';
    process.stderr.write(`[container-guard] GET /api/issues error: ${message}\n`);
    return reply.status(500).send({ error: message });
  }
});

server.get('/api/issues/:id', async (req, reply) => {
  const { id } = req.params as { id: string };

  try {
    const row = await queryOne<IssueRow>(
      `SELECT i.*,
        c.name AS container_name,
        c.image,
        c.docker_id,
        pb.host_ip,
        pb.host_port,
        pb.container_port
       FROM issues i
       LEFT JOIN containers c ON c.id = i.container_id
       LEFT JOIN port_bindings pb ON pb.id = i.port_binding_id
       WHERE i.id = $1`,
      [id],
    );
    if (!row) return reply.status(404).send({ error: 'issue not found' });
    return reply.send(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'query failed';
    process.stderr.write(`[container-guard] GET /api/issues/${id} error: ${message}\n`);
    return reply.status(500).send({ error: message });
  }
});

const acknowledgeSchema = {
  body: {
    type: 'object',
    properties: {
      acknowledged_by: { type: 'string' },
    },
    additionalProperties: false,
  },
};

server.patch('/api/issues/:id/acknowledge', { schema: acknowledgeSchema }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { acknowledged_by?: string } | undefined;
  const acknowledgedBy = body?.acknowledged_by ?? 'system';

  try {
    const row = await queryOne<IssueRow>(
      `UPDATE issues
       SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $2
       WHERE id = $1
       RETURNING *`,
      [id, acknowledgedBy],
    );
    if (!row) return reply.status(404).send({ error: 'issue not found' });
    return reply.send(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'query failed';
    process.stderr.write(`[container-guard] PATCH /api/issues/${id}/acknowledge error: ${message}\n`);
    return reply.status(500).send({ error: message });
  }
});

const resolveSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
  },
};

server.patch('/api/issues/:id/resolve', { schema: resolveSchema }, async (req, reply) => {
  const { id } = req.params as { id: string };

  try {
    const row = await queryOne<IssueRow>(
      `UPDATE issues
       SET status = 'resolved', resolved_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id],
    );
    if (!row) return reply.status(404).send({ error: 'issue not found' });
    return reply.send(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'query failed';
    process.stderr.write(`[container-guard] PATCH /api/issues/${id}/resolve error: ${message}\n`);
    return reply.status(500).send({ error: message });
  }
});

server.get('/api/stats', async (_req, reply) => {
  try {
    const row = await queryOne<StatsRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'open')         AS open_issues,
         COUNT(*) FILTER (WHERE status = 'acknowledged') AS acknowledged_issues,
         COUNT(*) FILTER (WHERE status = 'resolved')     AS resolved_issues,
         COUNT(*) FILTER (WHERE severity = 'critical')   AS critical_count,
         COUNT(*) FILTER (WHERE severity = 'high')       AS high_count,
         COUNT(*) FILTER (WHERE severity = 'medium')     AS medium_count,
         COUNT(*) FILTER (WHERE severity = 'low')        AS low_count
       FROM issues`,
    );

    return reply.send({
      open_issues: parseInt(row?.open_issues ?? '0', 10),
      acknowledged_issues: parseInt(row?.acknowledged_issues ?? '0', 10),
      resolved_issues: parseInt(row?.resolved_issues ?? '0', 10),
      critical_count: parseInt(row?.critical_count ?? '0', 10),
      high_count: parseInt(row?.high_count ?? '0', 10),
      medium_count: parseInt(row?.medium_count ?? '0', 10),
      low_count: parseInt(row?.low_count ?? '0', 10),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'query failed';
    process.stderr.write(`[container-guard] GET /api/stats error: ${message}\n`);
    return reply.status(500).send({ error: message });
  }
});

let isScanning = false;
server.post('/api/scan', async (request, reply) => {
  if (isScanning) {
    return reply.status(429).send({ error: 'Scan already in progress' });
  }
  isScanning = true;
  try {
    await scan();
    return reply.send({ status: 'scan_complete', timestamp: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'scan failed';
    process.stderr.write(`[container-guard] POST /api/scan error: ${message}\n`);
    return reply.status(500).send({ error: message });
  } finally {
    isScanning = false;
  }
});

// --- Filesystem browse ---
const ALLOWED_PATHS = ['/root', '/home', '/opt', '/mnt', '/srv', '/data', '/var/lib', '/tmp'];

server.get('/api/filesystem/browse', async (request, reply) => {
  const { path: rawPath } = request.query as { path?: string };
  const targetPath = resolve(rawPath || '/root');

  if (!ALLOWED_PATHS.some(ap => targetPath === ap || targetPath.startsWith(ap + '/'))) {
    return reply.status(403).send({ error: 'Path not allowed. Allowed: ' + ALLOWED_PATHS.join(', ') });
  }

  try {
    const entries = readdirSync(targetPath, { withFileTypes: true });

    const items = entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => {
        const fullPath = join(targetPath, e.name);
        let size: number | null = null;
        try {
          if (e.isFile()) {
            size = statSync(fullPath).size;
          }
        } catch {}
        return {
          name: e.name,
          path: fullPath,
          type: e.isDirectory() ? 'directory' as const : 'file' as const,
          size,
        };
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    let diskInfo = { total: 0, used: 0, available: 0, use_percent: '' };
    try {
      const dfOutput = execFileSync('df', ['-B1', '--', targetPath]).toString().trim();
      const df = dfOutput.split('\n').pop() || '';
      const parts = df.split(/\s+/);
      diskInfo = {
        total: parseInt(parts[1]) || 0,
        used: parseInt(parts[2]) || 0,
        available: parseInt(parts[3]) || 0,
        use_percent: parts[4] || '0%',
      };
    } catch {}

    const parentPath = targetPath === '/' ? null : resolve(targetPath, '..');

    return reply.send({
      current_path: targetPath,
      parent_path: parentPath,
      items,
      disk: diskInfo,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cannot read directory';
    return reply.status(400).send({ error: message });
  }
});

async function start(): Promise<void> {
  const config = loadConfig();
  initDb(config.dbUrl);

  try {
    await query('SELECT 1');
    process.stderr.write('[container-guard] DB connection verified\n');
  } catch (err) {
    process.stderr.write('[container-guard] FATAL: Cannot connect to database\n');
    process.exit(1);
  }

  try {
    await server.listen({ port: PORT, host: '127.0.0.1' });
    process.stdout.write(`[container-guard] api listening on 127.0.0.1:${PORT}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[container-guard] failed to start: ${message}\n`);
    process.exit(1);
  }
}

async function shutdown() {
  process.stderr.write('[container-guard] Shutting down...\n');
  await server.close();
  await closeDb();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[container-guard] fatal: ${message}\n`);
  process.exit(1);
});
