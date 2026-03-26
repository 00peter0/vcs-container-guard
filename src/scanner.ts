import Dockerode from 'dockerode';
import { PoolClient } from 'pg';
import { withTransaction } from './lib/db';
import { Finding, RULES, INSPECT_RULES } from './rules';

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

interface ContainerRow {
  id: string;
  docker_id: string;
}

interface PortBindingRow {
  id: string;
  host_ip: string;
  host_port: number;
  container_port: number;
  protocol: string;
}

interface IssueRow {
  id: string;
  status: string;
}

interface ScanCounts {
  containersTotal: number;
  containersRunning: number;
  issuesOpen: number;
  issuesNew: number;
  issuesResolved: number;
}

async function insertScan(client: PoolClient): Promise<string> {
  const result = await client.query<{ id: string }>(
    'INSERT INTO scans (started_at) VALUES (now()) RETURNING id',
  );
  return result.rows[0]!.id;
}

async function upsertContainer(
  client: PoolClient,
  dockerId: string,
  name: string,
  image: string,
  state: string,
): Promise<ContainerRow> {
  const result = await client.query<ContainerRow>(
    `INSERT INTO containers (docker_id, name, image, state, last_seen_at, removed_at)
     VALUES ($1, $2, $3, $4, now(), NULL)
     ON CONFLICT (docker_id) DO UPDATE
       SET name = EXCLUDED.name,
           image = EXCLUDED.image,
           state = EXCLUDED.state,
           last_seen_at = now(),
           removed_at = NULL
     RETURNING id, docker_id`,
    [dockerId, name, image, state],
  );
  return result.rows[0]!;
}

async function syncPortBindings(
  client: PoolClient,
  containerId: string,
  ports: Dockerode.Port[],
): Promise<void> {
  const existing = await client.query<PortBindingRow>(
    `SELECT id, host_ip::text, host_port, container_port, protocol
     FROM port_bindings
     WHERE container_id = $1 AND removed_at IS NULL`,
    [containerId],
  );

  const currentPorts = ports.filter((p) => p.PublicPort !== undefined);

  const existingKeys = new Set(
    existing.rows.map((r) => `${r.host_ip}:${r.host_port}:${r.container_port}:${r.protocol}`),
  );

  const incomingKeys = new Set(
    currentPorts.map(
      (p) => `${p.IP ?? '0.0.0.0'}:${p.PublicPort}:${p.PrivatePort}:${p.Type ?? 'tcp'}`,
    ),
  );

  for (const port of currentPorts) {
    const ip = port.IP ?? '0.0.0.0';
    const key = `${ip}:${port.PublicPort}:${port.PrivatePort}:${port.Type ?? 'tcp'}`;
    if (!existingKeys.has(key)) {
      await client.query(
        `INSERT INTO port_bindings (container_id, host_ip, host_port, container_port, protocol)
         VALUES ($1, $2::inet, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [containerId, ip, port.PublicPort, port.PrivatePort, port.Type ?? 'tcp'],
      );
    }
  }

  for (const row of existing.rows) {
    const key = `${row.host_ip}:${row.host_port}:${row.container_port}:${row.protocol}`;
    if (!incomingKeys.has(key)) {
      await client.query(
        'UPDATE port_bindings SET removed_at = now() WHERE id = $1',
        [row.id],
      );
    }
  }
}

async function markRemovedContainers(
  client: PoolClient,
  activeDockerIds: string[],
): Promise<void> {
  if (activeDockerIds.length === 0) {
    await client.query(
      'UPDATE containers SET removed_at = now() WHERE removed_at IS NULL',
    );
    return;
  }

  await client.query(
    `UPDATE containers
     SET removed_at = now()
     WHERE removed_at IS NULL AND docker_id <> ALL($1::varchar[])`,
    [activeDockerIds],
  );
}

async function upsertIssue(
  client: PoolClient,
  scanId: string,
  finding: Finding,
  containerDbId: string,
  portBindingId: string | null,
): Promise<{ isNew: boolean; isReopened: boolean }> {
  const existing = await client.query<IssueRow>(
    'SELECT id, status FROM issues WHERE fingerprint = $1',
    [finding.fingerprint],
  );

  if (existing.rows.length === 0) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO issues
         (container_id, port_binding_id, rule_id, severity, status, message, suggestion, fingerprint)
       VALUES ($1, $2, $3, $4, 'open', $5, $6, $7)
       RETURNING id`,
      [
        containerDbId,
        portBindingId,
        finding.ruleId,
        finding.severity,
        finding.message,
        finding.suggestion,
        finding.fingerprint,
      ],
    );
    const issueId = inserted.rows[0]!.id;

    await client.query(
      `INSERT INTO issue_events (issue_id, scan_id, event_type, new_status)
       VALUES ($1, $2, 'detected', 'open')`,
      [issueId, scanId],
    );

    return { isNew: true, isReopened: false };
  }

  const issue = existing.rows[0]!;

  if (issue.status === 'resolved') {
    await client.query(
      `UPDATE issues
       SET status = 'open', last_seen_at = now(), resolved_at = NULL,
           severity = $2, message = $3, suggestion = $4
       WHERE id = $1`,
      [issue.id, finding.severity, finding.message, finding.suggestion],
    );
    await client.query(
      `INSERT INTO issue_events (issue_id, scan_id, event_type, old_status, new_status)
       VALUES ($1, $2, 'reopened', 'resolved', 'open')`,
      [issue.id, scanId],
    );
    return { isNew: false, isReopened: true };
  }

  await client.query(
    'UPDATE issues SET last_seen_at = now(), severity = $2, message = $3 WHERE id = $1',
    [issue.id, finding.severity, finding.message],
  );

  return { isNew: false, isReopened: false };
}

async function getIssueById(client: PoolClient, fingerprint: string): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    'SELECT id FROM issues WHERE fingerprint = $1',
    [fingerprint],
  );
  return result.rows[0]?.id ?? null;
}

async function enqueueAlert(
  client: PoolClient,
  issueId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // TODO: Alert queue is a placeholder — no worker processes these yet.
  // Future: implement webhook dispatcher to send notifications.
  await client.query(
    `INSERT INTO alert_queue (issue_id, event_type, payload)
     VALUES ($1, $2, $3)`,
    [issueId, eventType, JSON.stringify(payload)],
  );
}

async function resolveStaleIssues(
  client: PoolClient,
  scanId: string,
  seenFingerprints: Set<string>,
): Promise<number> {
  const openIssues = await client.query<{ id: string; fingerprint: string; container_id: string }>(
    `SELECT i.id, i.fingerprint, i.container_id
     FROM issues i
     JOIN containers c ON c.id = i.container_id
     WHERE i.status IN ('open', 'acknowledged')
       AND c.removed_at IS NULL`,
  );

  const staleIds = openIssues.rows
    .filter((issue) => !seenFingerprints.has(issue.fingerprint))
    .map((issue) => issue.id);

  if (staleIds.length === 0) return 0;

  await client.query(
    `UPDATE issues SET status = 'resolved', resolved_at = now(), last_seen_at = now()
     WHERE id = ANY($1::uuid[])`,
    [staleIds],
  );

  const eventValues = staleIds.map((_, i) => `($${i * 3 + 1}::uuid, $${i * 3 + 2}::uuid, $${i * 3 + 3})`).join(', ');
  const eventParams = staleIds.flatMap((id) => [id, scanId, 'resolved']);
  await client.query(
    `INSERT INTO issue_events (issue_id, scan_id, event_type) VALUES ${eventValues}`,
    eventParams,
  );

  for (const issue of openIssues.rows.filter((i) => staleIds.includes(i.id))) {
    await enqueueAlert(client, issue.id, 'issue_resolved', {
      issueId: issue.id,
      fingerprint: issue.fingerprint,
    });
  }

  return staleIds.length;
}

async function updateScanCounts(client: PoolClient, scanId: string, counts: ScanCounts, durationMs: number): Promise<void> {
  await client.query(
    `UPDATE scans
     SET finished_at = now(),
         duration_ms = $7,
         containers_total = $2,
         containers_running = $3,
         issues_open = $4,
         issues_new = $5,
         issues_resolved = $6
     WHERE id = $1`,
    [
      scanId,
      counts.containersTotal,
      counts.containersRunning,
      counts.issuesOpen,
      counts.issuesNew,
      counts.issuesResolved,
      durationMs,
    ],
  );
}

interface ContainerData {
  container: Dockerode.ContainerInfo;
  name: string;
  inspectData: Dockerode.ContainerInspectInfo | null;
  findings: Finding[];
}

export async function scan(): Promise<void> {
  // Phase 1 (outside transaction): list containers + inspect — collect all data
  const containers = await docker.listContainers({ all: true });

  const containerDataList: ContainerData[] = [];
  for (const container of containers) {
    const name = (container.Names?.[0] ?? container.Id.substring(0, 12)).replace(/^\//, '');

    let inspectData: Dockerode.ContainerInspectInfo | null = null;
    try {
      inspectData = await docker.getContainer(container.Id).inspect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[container-guard] inspect failed for ${container.Id.substring(0, 12)}: ${msg}\n`);
    }

    const allFindings: Finding[] = [];
    for (const rule of RULES) {
      allFindings.push(...rule.check(container));
    }
    if (inspectData !== null) {
      for (const rule of INSPECT_RULES) {
        allFindings.push(...rule.check(inspectData, name));
      }
    }

    containerDataList.push({ container, name, inspectData, findings: allFindings });
  }

  const wallStart = Date.now();

  // Phase 2 (inside transaction): upsert into DB with already-collected data
  await withTransaction(async (client) => {
    const scanId = await insertScan(client);

    const containerDbMap = new Map<string, string>();

    for (const { container, name } of containerDataList) {
      const row = await upsertContainer(
        client,
        container.Id,
        name,
        container.Image,
        container.State,
      );
      containerDbMap.set(container.Id, row.id);
      await syncPortBindings(client, row.id, container.Ports ?? []);
    }

    await markRemovedContainers(client, containers.map((c) => c.Id));

    const seenFingerprints = new Set<string>();
    let issuesNew = 0;

    for (const { container, findings } of containerDataList) {
      const containerDbId = containerDbMap.get(container.Id)!;

      for (const finding of findings) {
        seenFingerprints.add(finding.fingerprint);

        const portBindingId = await resolvePortBindingId(client, containerDbId, finding.port);
        const { isNew, isReopened } = await upsertIssue(
          client,
          scanId,
          finding,
          containerDbId,
          portBindingId,
        );

        if (isNew || isReopened) {
          const issueId = (await getIssueById(client, finding.fingerprint))!;
          const eventType = isNew ? 'new_issue' : 'issue_reopened';
          await enqueueAlert(client, issueId, eventType, {
            issueId,
            fingerprint: finding.fingerprint,
            ruleId: finding.ruleId,
            severity: finding.severity,
            containerName: finding.containerName,
            message: finding.message,
          });

          if (isNew) issuesNew++;
        }
      }
    }

    const issuesResolved = await resolveStaleIssues(client, scanId, seenFingerprints);

    const openCount = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM issues WHERE status IN ('open', 'acknowledged')`,
    );
    const issuesOpen = parseInt(openCount.rows[0]!.count, 10);

    const durationMs = Date.now() - wallStart;
    await updateScanCounts(client, scanId, {
      containersTotal: containers.length,
      containersRunning: containers.filter((c) => c.State === 'running').length,
      issuesOpen,
      issuesNew,
      issuesResolved,
    }, durationMs);
  });
}

async function resolvePortBindingId(
  client: PoolClient,
  containerDbId: string,
  port: number | undefined,
): Promise<string | null> {
  if (port === undefined) return null;

  const result = await client.query<{ id: string }>(
    `SELECT id FROM port_bindings
     WHERE container_id = $1 AND container_port = $2 AND removed_at IS NULL
     LIMIT 1`,
    [containerDbId, port],
  );

  return result.rows[0]?.id ?? null;
}
