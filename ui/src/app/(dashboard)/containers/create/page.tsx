"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { DirectoryPicker } from "@/components/DirectoryPicker";

interface ContainerTemplate {
  id: string;
  name: string;
  icon: string;
  image: string;
  containerName: string;
  ports: Array<{ hostIp: string; hostPort: string; containerPort: string; protocol: string }>;
  env: Array<{ key: string; value: string }>;
  volumes: Array<{ hostPath: string; containerPath: string; mode: string }>;
  restartPolicy: string;
  user: string;
}

const TEMPLATES: ContainerTemplate[] = [
  {
    id: "postgres",
    name: "PostgreSQL",
    icon: "🐘",
    image: "postgres:16",
    containerName: "postgres",
    ports: [{ hostIp: "127.0.0.1", hostPort: "5432", containerPort: "5432", protocol: "tcp" }],
    env: [
      { key: "POSTGRES_USER", value: "admin" },
      { key: "POSTGRES_PASSWORD", value: "" },
      { key: "POSTGRES_DB", value: "mydb" },
    ],
    volumes: [{ hostPath: "", containerPath: "/var/lib/postgresql/data", mode: "rw" }],
    restartPolicy: "unless-stopped",
    user: "",
  },
  {
    id: "mysql",
    name: "MySQL",
    icon: "🐬",
    image: "mysql:8",
    containerName: "mysql",
    ports: [{ hostIp: "127.0.0.1", hostPort: "3306", containerPort: "3306", protocol: "tcp" }],
    env: [
      { key: "MYSQL_ROOT_PASSWORD", value: "" },
      { key: "MYSQL_DATABASE", value: "mydb" },
      { key: "MYSQL_USER", value: "admin" },
      { key: "MYSQL_PASSWORD", value: "" },
    ],
    volumes: [{ hostPath: "", containerPath: "/var/lib/mysql", mode: "rw" }],
    restartPolicy: "unless-stopped",
    user: "",
  },
  {
    id: "mongo",
    name: "MongoDB",
    icon: "🍃",
    image: "mongo:7",
    containerName: "mongodb",
    ports: [{ hostIp: "127.0.0.1", hostPort: "27017", containerPort: "27017", protocol: "tcp" }],
    env: [
      { key: "MONGO_INITDB_ROOT_USERNAME", value: "admin" },
      { key: "MONGO_INITDB_ROOT_PASSWORD", value: "" },
    ],
    volumes: [{ hostPath: "", containerPath: "/data/db", mode: "rw" }],
    restartPolicy: "unless-stopped",
    user: "",
  },
  {
    id: "redis",
    name: "Redis",
    icon: "🔴",
    image: "redis:7-alpine",
    containerName: "redis",
    ports: [{ hostIp: "127.0.0.1", hostPort: "6379", containerPort: "6379", protocol: "tcp" }],
    env: [],
    volumes: [{ hostPath: "", containerPath: "/data", mode: "rw" }],
    restartPolicy: "unless-stopped",
    user: "",
  },
  {
    id: "mariadb",
    name: "MariaDB",
    icon: "🦭",
    image: "mariadb:11",
    containerName: "mariadb",
    ports: [{ hostIp: "127.0.0.1", hostPort: "3306", containerPort: "3306", protocol: "tcp" }],
    env: [
      { key: "MARIADB_ROOT_PASSWORD", value: "" },
      { key: "MARIADB_DATABASE", value: "mydb" },
      { key: "MARIADB_USER", value: "admin" },
      { key: "MARIADB_PASSWORD", value: "" },
    ],
    volumes: [{ hostPath: "", containerPath: "/var/lib/mysql", mode: "rw" }],
    restartPolicy: "unless-stopped",
    user: "",
  },
];

interface PortBinding {
  hostIp: string;
  hostPort: string;
  containerPort: string;
  protocol: string;
}

interface EnvVar {
  key: string;
  value: string;
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  mode: string;
}

export default function CreateContainerPage() {
  const router = useRouter();

  const [image, setImage] = useState("");
  const [name, setName] = useState("");
  const [restartPolicy, setRestartPolicy] = useState("unless-stopped");

  const [ports, setPorts] = useState<PortBinding[]>([]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [volumes, setVolumes] = useState<VolumeMount[]>([]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [privileged, setPrivileged] = useState(false);
  const [user, setUser] = useState("");
  const [networkMode, setNetworkMode] = useState("bridge");
  const [memoryLimit, setMemoryLimit] = useState("");
  const [cpuLimit, setCpuLimit] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyTemplate(template: ContainerTemplate) {
    setImage(template.image);
    setName(template.containerName);
    setPorts([...template.ports]);
    setEnvVars(template.env.map(e => ({ ...e })));
    setVolumes(template.volumes.map(v => ({ ...v })));
    setRestartPolicy(template.restartPolicy);
    setUser(template.user);
    setPrivileged(false);
    setNetworkMode("bridge");
    setMemoryLimit("");
    setCpuLimit("");
  }

  function addPort() {
    setPorts([...ports, { hostIp: "127.0.0.1", hostPort: "", containerPort: "", protocol: "tcp" }]);
  }
  function removePort(i: number) {
    setPorts(ports.filter((_, idx) => idx !== i));
  }
  function updatePort(i: number, field: keyof PortBinding, value: string) {
    setPorts(ports.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }

  function addEnv() {
    setEnvVars([...envVars, { key: "", value: "" }]);
  }
  function removeEnv(i: number) {
    setEnvVars(envVars.filter((_, idx) => idx !== i));
  }
  function updateEnv(i: number, field: keyof EnvVar, value: string) {
    setEnvVars(envVars.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  }

  function addVolume() {
    setVolumes([...volumes, { hostPath: "", containerPath: "", mode: "rw" }]);
  }
  function removeVolume(i: number) {
    setVolumes(volumes.filter((_, idx) => idx !== i));
  }
  function updateVolume(i: number, field: keyof VolumeMount, value: string) {
    setVolumes(volumes.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)));
  }

  const hasExternalPort = ports.some((p) => p.hostIp === "0.0.0.0");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/guard/api/proxy/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: image.trim(),
          name: name.trim() || undefined,
          ports: ports.filter((p) => p.containerPort),
          env: envVars.filter((e) => e.key.trim()),
          volumes: volumes.filter((v) => v.hostPath && v.containerPath),
          restartPolicy,
          privileged,
          user: user.trim() || undefined,
          networkMode,
          memoryLimit: memoryLimit ? parseInt(memoryLimit) : undefined,
          cpuLimit: cpuLimit ? parseFloat(cpuLimit) : undefined,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        if (res.status === 409) {
          const suggestedName = name.trim() + "-" + Math.random().toString(36).slice(2, 6);
          setError(`Container "${name}" already exists. Try a different name, e.g. "${suggestedName}", or delete the existing container first.`);
          return;
        }
        throw new Error(data.error);
      }

      router.push("/containers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create container");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50";
  const selectClass = inputClass + " appearance-none";
  const labelClass = "text-xs font-medium text-zinc-400";
  const sectionClass = "rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4";

  return (
    <>
      <TopBar title="Create Container" subtitle="Deploy a new Docker container" />

      <div className="flex-1 overflow-y-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Template Selector */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-zinc-100">Quick Start Template</h3>
            <p className="text-xs text-zinc-500">Select a template to pre-fill the form, or configure manually below.</p>
            <div className="grid grid-cols-5 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-3 text-xs font-medium text-zinc-300 hover:border-cyan-500 hover:text-zinc-100 transition-colors"
                >
                  <span className="text-2xl">{t.icon}</span>
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Basic */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-zinc-100">Basic Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={labelClass}>Image *</label>
                <input
                  type="text"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="nginx:latest"
                  required
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Container Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-container"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Restart Policy</label>
              <select
                value={restartPolicy}
                onChange={(e) => setRestartPolicy(e.target.value)}
                className={selectClass}
              >
                <option value="no">No</option>
                <option value="always">Always</option>
                <option value="unless-stopped">Unless Stopped</option>
                <option value="on-failure">On Failure (max 5 retries)</option>
              </select>
            </div>
          </div>

          {/* Ports */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">Port Bindings</h3>
              <button
                type="button"
                onClick={addPort}
                className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add Port
              </button>
            </div>

            {hasExternalPort && (
              <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Port bound to 0.0.0.0 will be publicly accessible. Container Guard will flag this as an issue.
              </div>
            )}

            {ports.length === 0 && (
              <p className="text-sm text-zinc-500">No ports configured</p>
            )}

            {ports.map((port, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="space-y-1.5 w-32">
                  <label className={labelClass}>Host IP</label>
                  <select
                    value={port.hostIp}
                    onChange={(e) => updatePort(i, "hostIp", e.target.value)}
                    className={selectClass}
                  >
                    <option value="127.0.0.1">127.0.0.1 (local)</option>
                    <option value="0.0.0.0">0.0.0.0 (external)</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className={labelClass}>Host Port</label>
                  <input
                    type="text"
                    value={port.hostPort}
                    onChange={(e) => updatePort(i, "hostPort", e.target.value)}
                    placeholder="8080"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className={labelClass}>Container Port</label>
                  <input
                    type="text"
                    value={port.containerPort}
                    onChange={(e) => updatePort(i, "containerPort", e.target.value)}
                    placeholder="80"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5 w-24">
                  <label className={labelClass}>Protocol</label>
                  <select
                    value={port.protocol}
                    onChange={(e) => updatePort(i, "protocol", e.target.value)}
                    className={selectClass}
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removePort(i)}
                  className="rounded-md p-2 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors mb-0.5"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Environment Variables */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">Environment Variables</h3>
              <button
                type="button"
                onClick={addEnv}
                className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add Variable
              </button>
            </div>

            {envVars.length === 0 && (
              <p className="text-sm text-zinc-500">No environment variables</p>
            )}

            {envVars.map((env, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="space-y-1.5 flex-1">
                  <label className={labelClass}>Key</label>
                  <input
                    type="text"
                    value={env.key}
                    onChange={(e) => updateEnv(i, "key", e.target.value)}
                    placeholder="DB_HOST"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className={labelClass}>Value</label>
                  <input
                    type="text"
                    value={env.value}
                    onChange={(e) => updateEnv(i, "value", e.target.value)}
                    placeholder="localhost"
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeEnv(i)}
                  className="rounded-md p-2 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors mb-0.5"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Volumes */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">Volume Mounts</h3>
              <button
                type="button"
                onClick={addVolume}
                className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add Volume
              </button>
            </div>

            {volumes.length === 0 && (
              <p className="text-sm text-zinc-500">No volumes mounted</p>
            )}

            {volumes.map((vol, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <DirectoryPicker
                      label="Host Path"
                      value={vol.hostPath}
                      onChange={(v) => updateVolume(i, "hostPath", v)}
                      placeholder="/data/my-app"
                    />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <label className={labelClass}>Container Path</label>
                    <input
                      type="text"
                      value={vol.containerPath}
                      onChange={(e) => updateVolume(i, "containerPath", e.target.value)}
                      placeholder="/var/lib/data"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5 w-24">
                    <label className={labelClass}>Mode</label>
                    <select
                      value={vol.mode}
                      onChange={(e) => updateVolume(i, "mode", e.target.value)}
                      className={selectClass}
                    >
                      <option value="rw">Read/Write</option>
                      <option value="ro">Read Only</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeVolume(i)}
                    className="rounded-md p-2 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors mb-0.5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Advanced */}
          <div className={sectionClass}>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm font-semibold text-zinc-100"
            >
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Advanced Settings
            </button>

            {showAdvanced && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="privileged"
                    checked={privileged}
                    onChange={(e) => setPrivileged(e.target.checked)}
                    className="rounded border-zinc-600"
                  />
                  <label htmlFor="privileged" className="text-sm text-zinc-300">
                    Privileged mode
                  </label>
                </div>
                {privileged && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    Privileged containers have full host access. Container Guard will flag this as CRITICAL.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelClass}>User (UID:GID)</label>
                    <input
                      type="text"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      placeholder="1000:1000"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Network Mode</label>
                    <select
                      value={networkMode}
                      onChange={(e) => setNetworkMode(e.target.value)}
                      className={selectClass}
                    >
                      <option value="bridge">Bridge</option>
                      <option value="host">Host</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Memory Limit (MB)</label>
                    <input
                      type="number"
                      value={memoryLimit}
                      onChange={(e) => setMemoryLimit(e.target.value)}
                      placeholder="512"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>CPU Limit (cores)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={cpuLimit}
                      onChange={(e) => setCpuLimit(e.target.value)}
                      placeholder="1.0"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push("/containers")}
              className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !image.trim()}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create & Start
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
