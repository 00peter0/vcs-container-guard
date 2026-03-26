import Dockerode from 'dockerode';

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

const SENSITIVE_ENV_PATTERN = /PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY/i;

export const ALLOWED_ACTIONS = ['start', 'stop', 'restart', 'pause', 'unpause', 'kill'] as const;
export type ContainerAction = typeof ALLOWED_ACTIONS[number];

export interface MappedPort {
  hostIp: string;
  hostPort: number;
  containerPort: number;
  protocol: string;
}

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: string;
  ports: MappedPort[];
  labels: Record<string, string>;
}

type InspectState = Dockerode.ContainerInspectInfo['State'];
type InspectNetworkSettings = Dockerode.ContainerInspectInfo['NetworkSettings'];
type InspectMounts = Dockerode.ContainerInspectInfo['Mounts'];

export interface ContainerDetail {
  id: string;
  name: string;
  image: string;
  state: InspectState;
  platform: string;
  config: {
    env: string[];
    cmd: string[] | null;
    workingDir: string;
    user: string;
  };
  mounts: InspectMounts;
  ports: Dockerode.PortMap | undefined;
  networkSettings: InspectNetworkSettings;
  restartPolicy: Dockerode.HostRestartPolicy | undefined;
}

export interface LogOptions {
  tail?: number;
  since?: number;
  timestamps?: boolean;
}

export interface ContainerStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  block_read: number;
  block_write: number;
  pids: number;
}

export interface ActionResult {
  success: boolean;
  message: string;
}

interface DockerRawStats {
  cpu_stats: {
    cpu_usage: {
      total_usage: number;
      percpu_usage?: number[];
    };
    system_cpu_usage: number;
    online_cpus?: number;
  };
  precpu_stats: {
    cpu_usage: {
      total_usage: number;
    };
    system_cpu_usage: number;
  };
  memory_stats: {
    usage: number;
    limit: number;
  };
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
  blkio_stats: {
    io_service_bytes_recursive?: Array<{ op: string; value: number }>;
  };
  pids_stats?: {
    current?: number;
  };
}

function maskEnvVars(envs: string[]): string[] {
  return envs.map((env) => {
    const eqIdx = env.indexOf('=');
    if (eqIdx === -1) return env;
    const varName = env.substring(0, eqIdx);
    return SENSITIVE_ENV_PATTERN.test(varName) ? `${varName}=***REDACTED***` : env;
  });
}

function mapPorts(ports: Dockerode.Port[]): MappedPort[] {
  return (ports ?? [])
    .filter((p) => p.PublicPort !== undefined)
    .map((p) => ({
      hostIp: p.IP ?? '0.0.0.0',
      hostPort: p.PublicPort ?? 0,
      containerPort: p.PrivatePort,
      protocol: p.Type,
    }));
}

function calcCpuPercent(raw: DockerRawStats): number {
  const deltaCpu = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
  const deltaSystem = raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
  if (deltaSystem <= 0) return 0;
  const numCpus = raw.cpu_stats.online_cpus ?? raw.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;
  return (deltaCpu / deltaSystem) * numCpus * 100;
}

function calcNetworkBytes(raw: DockerRawStats): { rx: number; tx: number } {
  if (!raw.networks) return { rx: 0, tx: 0 };
  return Object.values(raw.networks).reduce(
    (acc, iface) => ({ rx: acc.rx + iface.rx_bytes, tx: acc.tx + iface.tx_bytes }),
    { rx: 0, tx: 0 },
  );
}

function calcBlockIO(raw: DockerRawStats): { read: number; write: number } {
  const entries = raw.blkio_stats.io_service_bytes_recursive ?? [];
  return entries.reduce(
    (acc, entry) => {
      const op = entry.op.toLowerCase();
      if (op === 'read') return { ...acc, read: acc.read + entry.value };
      if (op === 'write') return { ...acc, write: acc.write + entry.value };
      return acc;
    },
    { read: 0, write: 0 },
  );
}

export async function listContainers(): Promise<ContainerSummary[]> {
  const containers = await docker.listContainers({ all: true });
  return containers.map((c) => ({
    id: c.Id,
    name: (c.Names?.[0] ?? c.Id.substring(0, 12)).replace(/^\//, ''),
    image: c.Image,
    state: c.State,
    status: c.Status,
    created: new Date(c.Created * 1000).toISOString(),
    ports: mapPorts(c.Ports ?? []),
    labels: c.Labels ?? {},
  }));
}

export async function inspectContainer(id: string): Promise<ContainerDetail> {
  const info = await docker.getContainer(id).inspect();
  return {
    id: info.Id,
    name: info.Name.replace(/^\//, ''),
    image: info.Config?.Image ?? info.Image,
    state: info.State,
    platform: info.Platform,
    config: {
      env: maskEnvVars(info.Config?.Env ?? []),
      cmd: info.Config?.Cmd ?? null,
      workingDir: info.Config?.WorkingDir ?? '',
      user: info.Config?.User ?? '',
    },
    mounts: info.Mounts ?? [],
    ports: info.NetworkSettings?.Ports,
    networkSettings: info.NetworkSettings,
    restartPolicy: info.HostConfig?.RestartPolicy,
  };
}

export async function getContainerLogs(id: string, options: LogOptions = {}): Promise<string> {
  // follow: false causes dockerode to resolve with a Buffer, not a readable stream
  const result = await docker.getContainer(id).logs({
    stdout: true,
    stderr: true,
    tail: options.tail ?? 100,
    timestamps: options.timestamps ?? true,
    since: options.since ?? 0,
    follow: false,
  }) as unknown as Buffer;

  return result.toString('utf-8');
}

export async function getContainerStats(id: string): Promise<ContainerStats> {
  // stream: false causes dockerode to resolve with the stats object directly
  const raw = await docker.getContainer(id).stats(
    { stream: false } as Record<string, unknown>,
  ) as unknown as DockerRawStats;

  const network = calcNetworkBytes(raw);
  const blockIO = calcBlockIO(raw);

  return {
    cpu_percent: calcCpuPercent(raw),
    memory_usage: raw.memory_stats.usage,
    memory_limit: raw.memory_stats.limit,
    memory_percent: (raw.memory_stats.usage / raw.memory_stats.limit) * 100,
    network_rx_bytes: network.rx,
    network_tx_bytes: network.tx,
    block_read: blockIO.read,
    block_write: blockIO.write,
    pids: raw.pids_stats?.current ?? 0,
  };
}

export async function containerAction(id: string, action: ContainerAction): Promise<ActionResult> {
  const container = docker.getContainer(id);

  switch (action) {
    case 'start':   await container.start(); break;
    case 'stop':    await container.stop({ t: 10 }); break;
    case 'restart': await container.restart(); break;
    case 'pause':   await container.pause(); break;
    case 'unpause': await container.unpause(); break;
    case 'kill':    await container.kill(); break;
  }

  return { success: true, message: `container ${action} successful` };
}

export async function removeContainer(id: string, force = false): Promise<ActionResult> {
  await docker.getContainer(id).remove({ force });
  return { success: true, message: 'container removed' };
}

export interface ContainerConfig {
  id: string;
  name: string;
  image: string;
  ports: Array<{ hostIp: string; hostPort: string; containerPort: string; protocol: string }>;
  env: Array<{ key: string; value: string }>;
  volumes: Array<{ hostPath: string; containerPath: string; mode: string }>;
  restartPolicy: string;
  privileged: boolean;
  user: string;
  networkMode: string;
  memoryLimit: number | null;
  cpuLimit: number | null;
  state: string;
  ipAddress: string | null;
  networks: Array<{ name: string; ipAddress: string | null; gateway: string | null }>;
}

export async function getContainerConfig(id: string): Promise<ContainerConfig> {
  const info = await docker.getContainer(id).inspect();

  const ports: ContainerConfig['ports'] = [];
  for (const [containerPortProto, bindings] of Object.entries(info.HostConfig?.PortBindings ?? {})) {
    if (!bindings) continue;
    const [containerPort, protocol] = containerPortProto.split('/');
    for (const binding of bindings as Array<{ HostIp: string; HostPort: string }>) {
      ports.push({ hostIp: binding.HostIp || '0.0.0.0', hostPort: binding.HostPort, containerPort, protocol: protocol ?? 'tcp' });
    }
  }

  const env: ContainerConfig['env'] = (info.Config?.Env ?? []).map((e) => {
    const idx = e.indexOf('=');
    return { key: e.slice(0, idx), value: e.slice(idx + 1) };
  });

  const volumes: ContainerConfig['volumes'] = (info.HostConfig?.Binds ?? []).map((b) => {
    const parts = b.split(':');
    return { hostPath: parts[0], containerPath: parts[1], mode: parts[2] ?? 'rw' };
  });

  return {
    id: info.Id,
    name: info.Name.replace(/^\//, ''),
    image: info.Config?.Image ?? '',
    ports,
    env,
    volumes,
    restartPolicy: info.HostConfig?.RestartPolicy?.Name ?? 'no',
    privileged: info.HostConfig?.Privileged ?? false,
    user: info.Config?.User ?? '',
    networkMode: info.HostConfig?.NetworkMode ?? 'bridge',
    memoryLimit: info.HostConfig?.Memory ? Math.round(info.HostConfig.Memory / 1024 / 1024) : null,
    cpuLimit: info.HostConfig?.NanoCpus ? info.HostConfig.NanoCpus / 1e9 : null,
    state: info.State?.Status ?? 'unknown',
    ipAddress: (info.NetworkSettings as unknown as { IPAddress?: string })?.IPAddress || null,
    networks: Object.entries(info.NetworkSettings?.Networks || {}).map(([name, net]) => ({
      name,
      ipAddress: net?.IPAddress || null,
      gateway: net?.Gateway || null,
    })),
  };
}

export async function recreateContainer(
  id: string,
  overrides: Partial<Parameters<typeof createContainer>[0]>,
): Promise<{ id: string; name: string }> {
  const oldContainer = docker.getContainer(id);
  const oldConfig = await getContainerConfig(id);

  try {
    await oldContainer.stop({ t: 10 });
  } catch {
    // already stopped
  }
  await oldContainer.remove({ force: true });

  return createContainer({
    image: overrides.image ?? oldConfig.image,
    name: overrides.name ?? oldConfig.name,
    ports: overrides.ports ?? oldConfig.ports,
    env: overrides.env ?? oldConfig.env,
    volumes: overrides.volumes ?? oldConfig.volumes,
    restartPolicy: overrides.restartPolicy ?? oldConfig.restartPolicy,
    privileged: overrides.privileged ?? oldConfig.privileged,
    user: overrides.user ?? oldConfig.user,
    networkMode: overrides.networkMode ?? oldConfig.networkMode,
    memoryLimit: (overrides.memoryLimit !== undefined ? overrides.memoryLimit : oldConfig.memoryLimit) ?? undefined,
    cpuLimit: (overrides.cpuLimit !== undefined ? overrides.cpuLimit : oldConfig.cpuLimit) ?? undefined,
  });
}

export async function createContainer(options: {
  image: string;
  name?: string;
  ports?: Array<{
    hostIp: string;
    hostPort: string;
    containerPort: string;
    protocol: string;
  }>;
  env?: Array<{ key: string; value: string }>;
  volumes?: Array<{ hostPath: string; containerPath: string; mode: string }>;
  restartPolicy?: string;
  privileged?: boolean;
  user?: string;
  networkMode?: string;
  memoryLimit?: number;
  cpuLimit?: number;
}): Promise<{ id: string; name: string }> {
  const portBindings: Record<string, Array<{ HostIp: string; HostPort: string }>> = {};
  const exposedPorts: Record<string, Record<string, never>> = {};

  if (options.ports) {
    for (const p of options.ports) {
      const key = `${p.containerPort}/${p.protocol}`;
      exposedPorts[key] = {};
      portBindings[key] = portBindings[key] || [];
      portBindings[key].push({ HostIp: p.hostIp, HostPort: p.hostPort });
    }
  }

  const env = options.env
    ?.filter(e => e.key.trim())
    .map(e => `${e.key}=${e.value}`) ?? [];

  const binds = options.volumes
    ?.filter(v => v.hostPath.trim() && v.containerPath.trim())
    .map(v => `${v.hostPath}:${v.containerPath}:${v.mode}`) ?? [];

  let restartPolicy: { Name: string; MaximumRetryCount?: number } = { Name: '' };
  switch (options.restartPolicy) {
    case 'always': restartPolicy = { Name: 'always' }; break;
    case 'unless-stopped': restartPolicy = { Name: 'unless-stopped' }; break;
    case 'on-failure': restartPolicy = { Name: 'on-failure', MaximumRetryCount: 5 }; break;
    default: restartPolicy = { Name: '' }; break;
  }

  const container = await docker.createContainer({
    Image: options.image,
    name: options.name || undefined,
    ExposedPorts: Object.keys(exposedPorts).length > 0 ? exposedPorts : undefined,
    Env: env.length > 0 ? env : undefined,
    User: options.user || undefined,
    HostConfig: {
      PortBindings: Object.keys(portBindings).length > 0 ? portBindings : undefined,
      Binds: binds.length > 0 ? binds : undefined,
      RestartPolicy: restartPolicy,
      Privileged: options.privileged ?? false,
      NetworkMode: options.networkMode || 'bridge',
      Memory: options.memoryLimit ? options.memoryLimit * 1024 * 1024 : undefined,
      NanoCpus: options.cpuLimit ? Math.round(options.cpuLimit * 1e9) : undefined,
    },
  });

  await container.start();

  const info = await container.inspect();
  return { id: info.Id, name: info.Name.replace(/^\//, '') };
}
