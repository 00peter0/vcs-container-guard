const GUARD_API_URL = process.env.GUARD_API_URL ?? "http://127.0.0.1:3847";

const BASE_PATH = "/guard";

export function apiUrl(path: string): string {
  return `${BASE_PATH}${path}`;
}

export interface Container {
  id: string;
  name: string;
  status: string;
  state: string;
  image: string;
  cpu_percent: number | null;
  memory_percent: number | null;
}

export interface Image {
  id: string;
  repoTags: string[];
  size: number;
  created: string;
  update_available?: boolean;
}

export interface Issue {
  id: string;
  container_id: string;
  port_binding_id: string | null;
  severity: "critical" | "high" | "medium" | "low";
  rule_id: string;
  status: "open" | "acknowledged" | "resolved";
  message: string;
  suggestion: string;
  fingerprint: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  container_name: string | null;
  image: string | null;
  docker_id: string | null;
  host_ip: string | null;
  host_port: number | null;
  container_port: number | null;
}

export interface DashboardStats {
  running_containers: number;
  stopped_containers: number;
  total_images: number;
  open_issues: number;
  acknowledged_issues: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}

export interface ContainerLog {
  lines: string[];
}

async function guardFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = process.env.CG_API_KEY ?? "";
  const response = await fetch(`${GUARD_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Guard API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [stats, containers, images] = await Promise.all([
    guardFetch<{
      open_issues: number;
      acknowledged_issues: number;
      resolved_issues: number;
      critical_count: number;
      high_count: number;
      medium_count: number;
      low_count: number;
    }>("/api/stats"),
    guardFetch<Array<{ state: string }>>("/api/containers"),
    guardFetch<Array<unknown>>("/api/images"),
  ]);

  return {
    running_containers: containers.filter(c => c.state === "running").length,
    stopped_containers: containers.filter(c => c.state !== "running").length,
    total_images: images.length,
    open_issues: stats.open_issues,
    acknowledged_issues: stats.acknowledged_issues,
    critical_count: stats.critical_count,
    high_count: stats.high_count,
    medium_count: stats.medium_count,
    low_count: stats.low_count,
  };
}

export async function getRecentIssues(): Promise<Issue[]> {
  return guardFetch<Issue[]>("/api/issues?limit=5&sort=last_seen_at:desc");
}

export async function getContainersList() {
  return guardFetch<Array<{ id: string; name: string; image: string; state: string; status: string }>>("/api/containers");
}

export async function getImagesList() {
  return guardFetch<Array<{ id: string; repoTags: string[]; size: number; created: string }>>("/api/images");
}

export async function getContainers(): Promise<Container[]> {
  return guardFetch<Container[]>("/api/containers");
}

export async function getContainerLogs(containerId: string): Promise<ContainerLog> {
  return guardFetch<ContainerLog>(`/api/containers/${containerId}/logs?tail=100`);
}

export async function containerAction(
  containerId: string,
  action: "start" | "stop" | "restart"
): Promise<void> {
  await guardFetch<unknown>(`/api/containers/${containerId}/${action}`, {
    method: "POST",
  });
}

export async function getImages(): Promise<Image[]> {
  return guardFetch<Image[]>("/api/images");
}

export async function deleteImage(imageId: string): Promise<void> {
  await guardFetch<unknown>(`/api/images/${imageId}`, { method: "DELETE" });
}

export async function pullImage(imageName: string): Promise<void> {
  await guardFetch<unknown>(`/api/images/pull`, {
    method: "POST",
    body: JSON.stringify({ image: imageName }),
  });
}

export async function checkImageUpdates(): Promise<void> {
  await guardFetch<unknown>("/api/images/check-updates", { method: "POST" });
}

export async function getIssues(
  params: { severity?: string; status?: string } = {}
): Promise<Issue[]> {
  const query = new URLSearchParams();
  if (params.severity) query.set("severity", params.severity);
  if (params.status) query.set("status", params.status);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return guardFetch<Issue[]>(`/api/issues${qs}`);
}

export async function updateIssueStatus(
  issueId: string,
  status: "acknowledged" | "resolved"
): Promise<void> {
  await guardFetch<unknown>(`/api/issues/${issueId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
