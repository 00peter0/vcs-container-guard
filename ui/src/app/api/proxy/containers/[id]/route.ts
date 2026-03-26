import { NextResponse } from "next/server";

const GUARD_API_URL = process.env.GUARD_API_URL ?? "http://127.0.0.1:3847";

interface RawPortBinding {
  HostIp: string;
  HostPort: string;
}

interface PortInfo {
  hostIp: string;
  hostPort: string;
  containerPort: string;
  protocol: string;
}

interface RawContainerDetail {
  id: string;
  name: string;
  ports: Record<string, RawPortBinding[] | null> | PortInfo[];
  [key: string]: unknown;
}

function normalizeDockerPorts(
  raw: Record<string, RawPortBinding[] | null>
): PortInfo[] {
  return Object.entries(raw).flatMap(([key, bindings]) => {
    if (!bindings) return [];
    const [containerPort, protocol] = key.split("/");
    return bindings.map((b) => ({
      hostIp: b.HostIp,
      hostPort: b.HostPort,
      containerPort: containerPort ?? key,
      protocol: protocol ?? "tcp",
    }));
  });
}

async function proxyRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = process.env.CG_API_KEY ?? "";

  try {
    const hasBody = options.body != null;
    const response = await fetch(`${GUARD_API_URL}${path}`, {
      ...options,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        "X-API-Key": token,
        ...options.headers,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log("[CONTAINER-ID] GET called with id:", id);

  const response = await proxyRequest(`/api/containers/${id}`);
  if (!response.ok || response.headers.get("content-type")?.includes("application/json") === false) {
    return response;
  }

  const data = (await response.json()) as RawContainerDetail;

  // Backend /api/containers/:id returns Docker-raw ports format
  // Normalize to PortInfo[] for consistency with the list endpoint
  if (data.ports && !Array.isArray(data.ports)) {
    data.ports = normalizeDockerPorts(
      data.ports as Record<string, RawPortBinding[] | null>
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") ?? "true";
  return proxyRequest(`/api/containers/${id}?force=${force}`, { method: "DELETE" });
}
