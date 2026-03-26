import Dockerode from 'dockerode';
import { createHash } from 'crypto';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface Finding {
  containerId: string;
  containerName: string;
  ruleId: string;
  severity: Severity;
  message: string;
  suggestion: string;
  fingerprint: string;
  port?: number;
}

export interface Rule {
  check(container: Dockerode.ContainerInfo): Finding[];
}

export interface InspectRule {
  check(inspect: Dockerode.ContainerInspectInfo, name: string): Finding[];
}

const DANGEROUS_PORTS: Record<number, Severity> = {
  6379: 'critical',   // Redis
  27017: 'critical',  // MongoDB
  5432: 'critical',   // PostgreSQL
  3306: 'critical',   // MySQL
  3389: 'critical',   // RDP
  5900: 'critical',   // VNC
  7681: 'critical',   // ttyd
  9229: 'critical',   // Node.js debugger
  8200: 'critical',   // HashiCorp Vault
  2375: 'critical',   // Docker daemon (unencrypted)
  2376: 'critical',   // Docker daemon (TLS)
  8188: 'high',       // ComfyUI
  8080: 'high',
  8443: 'high',
  9200: 'critical',   // Elasticsearch
  9300: 'critical',   // Elasticsearch cluster
  5601: 'high',       // Kibana
  11211: 'critical',  // Memcached
  4444: 'high',
  4445: 'high',
};

const DANGEROUS_IMAGE_PATTERNS = ['redis', 'mongo', 'postgres', 'mysql', 'memcached'];

const SENSITIVE_ENV_PATTERN = /PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY/i;

function fingerprint(dockerId: string, ruleId: string, port: number): string {
  return createHash('sha256')
    .update(`${dockerId}|${ruleId}|${port}`)
    .digest('hex')
    .substring(0, 32);
}

function fingerprintStr(dockerId: string, ...parts: string[]): string {
  return createHash('sha256')
    .update([dockerId, ...parts].join('|'))
    .digest('hex')
    .substring(0, 32);
}

function containerName(container: Dockerode.ContainerInfo): string {
  const name = container.Names?.[0] ?? container.Id.substring(0, 12);
  return name.startsWith('/') ? name.slice(1) : name;
}

function exposedPorts(container: Dockerode.ContainerInfo): Dockerode.Port[] {
  return (container.Ports ?? []).filter(
    (p) => p.IP === '0.0.0.0' && p.PublicPort !== undefined,
  );
}

const exposedPortRule: Rule = {
  check(container) {
    const findings: Finding[] = [];
    const name = containerName(container);

    for (const port of exposedPorts(container)) {
      const publicPort = port.PublicPort!;
      const containerPort = port.PrivatePort;
      const severity = DANGEROUS_PORTS[containerPort] ?? DANGEROUS_PORTS[publicPort] ?? 'medium';

      findings.push({
        containerId: container.Id,
        containerName: name,
        ruleId: 'exposed-port',
        severity,
        message: `Container ${name} exposes port ${containerPort} on 0.0.0.0:${publicPort}`,
        suggestion: `Bind to 127.0.0.1 instead of ${port.IP}: -p 127.0.0.1:${publicPort}:${containerPort}`,
        fingerprint: fingerprint(container.Id, 'exposed-port', containerPort),
        port: containerPort,
      });
    }

    return findings;
  },
};

function isDangerousImage(image: string): boolean {
  const normalized = image.toLowerCase().split(':')[0]!.split('/').pop() ?? '';
  return DANGEROUS_IMAGE_PATTERNS.some((pattern) => normalized === pattern || normalized.startsWith(`${pattern}-`));
}

const dangerousImageExposedRule: Rule = {
  check(container) {
    if (!isDangerousImage(container.Image)) return [];

    const findings: Finding[] = [];
    const name = containerName(container);

    for (const port of exposedPorts(container)) {
      const containerPort = port.PrivatePort;
      const publicPort = port.PublicPort!;

      findings.push({
        containerId: container.Id,
        containerName: name,
        ruleId: 'dangerous-image-exposed',
        severity: 'critical',
        message: `Dangerous service ${container.Image} exposes port ${containerPort} on 0.0.0.0:${publicPort}`,
        suggestion: `Never expose database/cache services publicly. Use -p 127.0.0.1:${publicPort}:${containerPort} or a private Docker network.`,
        fingerprint: fingerprint(container.Id, 'dangerous-image-exposed', containerPort),
        port: containerPort,
      });
    }

    return findings;
  },
};

const privilegedContainerRule: InspectRule = {
  check(inspect, name) {
    if (!inspect.HostConfig?.Privileged) return [];
    return [{
      containerId: inspect.Id,
      containerName: name,
      ruleId: 'privileged-container',
      severity: 'critical',
      message: `Container ${name} is running in privileged mode`,
      suggestion: 'Remove --privileged flag. Use specific --cap-add flags for required capabilities only',
      fingerprint: fingerprintStr(inspect.Id, 'privileged'),
    }];
  },
};

const noHealthcheckRule: InspectRule = {
  check(inspect, name) {
    // Health is only populated at runtime for containers with HEALTHCHECK configured
    if (inspect.State.Health != null) return [];
    return [{
      containerId: inspect.Id,
      containerName: name,
      ruleId: 'no-healthcheck',
      severity: 'low',
      message: `Container ${name} has no health check configured`,
      suggestion: 'Add HEALTHCHECK instruction to Dockerfile or --health-cmd to docker run',
      fingerprint: fingerprintStr(inspect.Id, 'no-healthcheck'),
    }];
  },
};

const runningAsRootRule: InspectRule = {
  check(inspect, name) {
    const user = inspect.Config?.User ?? '';
    if (user !== '' && user !== 'root' && user !== '0') return [];
    return [{
      containerId: inspect.Id,
      containerName: name,
      ruleId: 'running-as-root',
      severity: 'high',
      message: `Container ${name} is running as root user`,
      suggestion: 'Add USER directive in Dockerfile to run as non-root user',
      fingerprint: fingerprintStr(inspect.Id, 'running-as-root'),
    }];
  },
};

const dockerSocketMountedRule: InspectRule = {
  check(inspect, name) {
    const hasSock = (inspect.Mounts ?? []).some((m) => m.Source === '/var/run/docker.sock');
    if (!hasSock) return [];
    return [{
      containerId: inspect.Id,
      containerName: name,
      ruleId: 'docker-socket-mounted',
      severity: 'critical',
      message: `Container ${name} has Docker socket mounted (/var/run/docker.sock)`,
      suggestion: 'Remove Docker socket mount. Use Docker API proxy with limited access if needed',
      fingerprint: fingerprintStr(inspect.Id, 'docker-socket'),
    }];
  },
};

const sensitiveEnvVarsRule: InspectRule = {
  check(inspect, name) {
    const findings: Finding[] = [];
    const envs = inspect.Config?.Env ?? [];

    for (const env of envs) {
      const eqIdx = env.indexOf('=');
      if (eqIdx === -1) continue;

      const varName = env.substring(0, eqIdx);
      const value = env.substring(eqIdx + 1);

      if (!SENSITIVE_ENV_PATTERN.test(varName)) continue;
      if (!value || value.startsWith('$') || value.startsWith('vault://')) continue;

      findings.push({
        containerId: inspect.Id,
        containerName: name,
        ruleId: 'sensitive-env-vars',
        severity: 'high',
        message: `Container ${name} has sensitive value in environment variable ${varName}`,
        suggestion: 'Use Docker secrets or mount sensitive values from files instead of environment variables',
        fingerprint: fingerprintStr(inspect.Id, 'sensitive-env', varName),
      });
    }

    return findings;
  },
};

const DANGEROUS_CAPABILITIES = ['SYS_ADMIN', 'NET_ADMIN', 'SYS_PTRACE', 'SYS_RAWIO', 'DAC_OVERRIDE', 'NET_RAW'];

const dangerousCapabilityRule: InspectRule = {
  check(inspect, name) {
    const caps = (inspect.HostConfig?.CapAdd ?? []) as string[];
    const found = caps.filter((c) => DANGEROUS_CAPABILITIES.includes(c.toUpperCase()));
    if (found.length === 0) return [];
    return [{
      containerId: inspect.Id,
      containerName: name,
      ruleId: 'dangerous-capability',
      severity: 'high',
      message: `Container ${name} has dangerous capabilities: ${found.join(', ')}`,
      suggestion: 'Remove unnecessary capabilities. Grant only the minimum required for the container to function.',
      fingerprint: fingerprintStr(inspect.Id, 'dangerous-capability', found.sort().join(',')),
    }];
  },
};

export const RULES: Rule[] = [exposedPortRule, dangerousImageExposedRule];

export const INSPECT_RULES: InspectRule[] = [
  privilegedContainerRule,
  noHealthcheckRule,
  runningAsRootRule,
  dockerSocketMountedRule,
  sensitiveEnvVarsRule,
  dangerousCapabilityRule,
];
