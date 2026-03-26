import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface GuardConfig {
  guardKey: string;
  serverId: string;
  gatewayUrl: string;
  dbUrl: string;
  scanInterval: number;
  heartbeatInterval: number;
  alertQueueInterval: number;
  apiPort: number;
}

function loadConfig(): GuardConfig {
  const configPath = process.env['CONFIG_PATH'] ?? '/opt/vcs-container-guard/config.json';
  const raw = readFileSync(resolve(configPath), 'utf-8');
  return JSON.parse(raw) as GuardConfig;
}

let cached: GuardConfig | null = null;

export function getConfig(): GuardConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}
