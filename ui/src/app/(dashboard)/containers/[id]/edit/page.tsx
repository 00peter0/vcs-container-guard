"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Save,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { DirectoryPicker } from "@/components/DirectoryPicker";

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

interface ContainerConfig {
  id: string;
  name: string;
  image: string;
  ports: PortBinding[];
  env: EnvVar[];
  volumes: VolumeMount[];
  restartPolicy: string;
  privileged: boolean;
  user: string;
  networkMode: string;
  memoryLimit: number | null;
  cpuLimit: number | null;
  state: string;
}

export default function EditContainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalConfig, setOriginalConfig] = useState<ContainerConfig | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch(`/guard/api/proxy/containers/${id}/config`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const config = (await res.json()) as ContainerConfig;
        setOriginalConfig(config);
        setImage(config.image);
        setName(config.name);
        setRestartPolicy(config.restartPolicy);
        setPorts(config.ports.map(p => ({ ...p })));
        setEnvVars(config.env.map(e => ({ ...e })));
        setVolumes(config.volumes.map(v => ({ ...v })));
        setPrivileged(config.privileged);
        setUser(config.user);
        setNetworkMode(config.networkMode);
        setMemoryLimit(config.memoryLimit ? String(config.memoryLimit) : "");
        setCpuLimit(config.cpuLimit ? String(config.cpuLimit) : "");
      } catch (err) {
        setConfigError(err instanceof Error ? err.message : "Failed to load config");
      } finally {
        setLoadingConfig(false);
      }
    }
    void loadConfig();
  }, [id]);

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
  const hadExternalPort = originalConfig?.ports.some((p) => p.hostIp === "0.0.0.0" || p.hostIp === "");
  const fixedExternalPort = hadExternalPort && !hasExternalPort;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/guard/api/proxy/containers/${id}/recreate`, {
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
          memoryLimit: memoryLimit ? parseInt(memoryLimit) : null,
          cpuLimit: cpuLimit ? parseFloat(cpuLimit) : null,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        if (res.status === 409) {
          setError(`Container name conflict. The name "${name}" is already in use by another container.`);
          return;
        }
        throw new Error(data.error);
      }

      router.push("/containers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recreate container");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50";
  const selectClass = inputClass + " appearance-none";
  const labelClass = "text-xs font-medium text-zinc-400";
  const sectionClass = "rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4";

  if (loadingConfig) {
    return (
      <>
        <TopBar title="Edit Container" subtitle="Loading configuration..." />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      </>
    );
  }

  if (configError) {
    return (
      <>
        <TopBar title="Edit Container" subtitle="Error" />
        <div className="m-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {configError}
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title={`Edit: ${originalConfig?.name ?? "Container"}`}
        subtitle="Modify and recreate container with new settings"
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Warning banner */}
        <div className="max-w-3xl mb-5 flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-200">
            <p className="font-medium">This will stop, remove, and recreate the container.</p>
            <p className="mt-1 text-yellow-300/70">Data in mounted volumes will be preserved. Data stored only inside the container will be lost.</p>
          </div>
        </div>

        {fixedExternalPort && (
          <div className="max-w-3xl mb-5 flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-400">
            External ports changed to local — this container will no longer be accessible from the internet.
          </div>
        )}

        <form onSubmit={handleSave} className="max-w-3xl space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Basic */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-zinc-100">Basic Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={labelClass}>Image</label>
                <input type="text" value={image} onChange={(e) => setImage(e.target.value)} required className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Container Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Restart Policy</label>
              <select value={restartPolicy} onChange={(e) => setRestartPolicy(e.target.value)} className={selectClass}>
                <option value="no">No</option>
                <option value="always">Always</option>
                <option value="unless-stopped">Unless Stopped</option>
                <option value="on-failure">On Failure</option>
              </select>
            </div>
          </div>

          {/* Ports */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">Port Bindings</h3>
              <button type="button" onClick={addPort} className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Port
              </button>
            </div>

            {hasExternalPort && (
              <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Port bound to 0.0.0.0 — publicly accessible!
              </div>
            )}

            {ports.length === 0 && <p className="text-sm text-zinc-500">No ports configured</p>}

            {ports.map((port, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="space-y-1.5 w-32">
                  <label className={labelClass}>Host IP</label>
                  <select value={port.hostIp} onChange={(e) => updatePort(i, "hostIp", e.target.value)} className={selectClass}>
                    <option value="127.0.0.1">127.0.0.1 (local)</option>
                    <option value="0.0.0.0">0.0.0.0 (external)</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className={labelClass}>Host Port</label>
                  <input type="text" value={port.hostPort} onChange={(e) => updatePort(i, "hostPort", e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className={labelClass}>Container Port</label>
                  <input type="text" value={port.containerPort} onChange={(e) => updatePort(i, "containerPort", e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5 w-24">
                  <label className={labelClass}>Protocol</label>
                  <select value={port.protocol} onChange={(e) => updatePort(i, "protocol", e.target.value)} className={selectClass}>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </div>
                <button type="button" onClick={() => removePort(i)} className="rounded-md p-2 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors mb-0.5">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Env */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">Environment Variables</h3>
              <button type="button" onClick={addEnv} className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Variable
              </button>
            </div>
            {envVars.length === 0 && <p className="text-sm text-zinc-500">No environment variables</p>}
            {envVars.map((env, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="space-y-1.5 flex-1">
                  <label className={labelClass}>Key</label>
                  <input type="text" value={env.key} onChange={(e) => updateEnv(i, "key", e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className={labelClass}>Value</label>
                  <input type="text" value={env.value} onChange={(e) => updateEnv(i, "value", e.target.value)} className={inputClass} />
                </div>
                <button type="button" onClick={() => removeEnv(i)} className="rounded-md p-2 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors mb-0.5">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Volumes */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">Volume Mounts</h3>
              <button type="button" onClick={addVolume} className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Volume
              </button>
            </div>
            {volumes.length === 0 && <p className="text-sm text-zinc-500">No volumes mounted</p>}
            {volumes.map((vol, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <DirectoryPicker label="Host Path" value={vol.hostPath} onChange={(v) => updateVolume(i, "hostPath", v)} />
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className={labelClass}>Container Path</label>
                  <input type="text" value={vol.containerPath} onChange={(e) => updateVolume(i, "containerPath", e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5 w-24">
                  <label className={labelClass}>Mode</label>
                  <select value={vol.mode} onChange={(e) => updateVolume(i, "mode", e.target.value)} className={selectClass}>
                    <option value="rw">Read/Write</option>
                    <option value="ro">Read Only</option>
                  </select>
                </div>
                <button type="button" onClick={() => removeVolume(i)} className="rounded-md p-2 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors mb-0.5">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Advanced */}
          <div className={sectionClass}>
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Advanced Settings
            </button>
            {showAdvanced && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="privileged" checked={privileged} onChange={(e) => setPrivileged(e.target.checked)} className="rounded border-zinc-600" />
                  <label htmlFor="privileged" className="text-sm text-zinc-300">Privileged mode</label>
                </div>
                {privileged && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    Privileged containers have full host access.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelClass}>User (UID:GID)</label>
                    <input type="text" value={user} onChange={(e) => setUser(e.target.value)} placeholder="1000:1000" className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Network Mode</label>
                    <select value={networkMode} onChange={(e) => setNetworkMode(e.target.value)} className={selectClass}>
                      <option value="bridge">Bridge</option>
                      <option value="host">Host</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Memory Limit (MB)</label>
                    <input type="number" value={memoryLimit} onChange={(e) => setMemoryLimit(e.target.value)} placeholder="512" className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>CPU Limit (cores)</label>
                    <input type="number" step="0.1" value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)} placeholder="1.0" className={inputClass} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => router.push("/containers")} className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !image.trim()} className="flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 transition-colors disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" />
              Recreate Container
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
