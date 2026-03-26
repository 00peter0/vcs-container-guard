import { NextResponse } from "next/server";

const GUARD_API_URL = process.env.GUARD_API_URL ?? "http://127.0.0.1:3847";

export async function getSessionToken(): Promise<string | null> {
  return process.env.CG_API_KEY ?? null;
}

export async function proxyRequest(
  path: string,
  options: RequestInit = {}
): Promise<NextResponse> {
  const token = await getSessionToken();

  if (!token) {
    console.log("[PROXY] No token found");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = `${GUARD_API_URL}${path}`;
    console.log(`[PROXY] ${options.method ?? "GET"} ${url}`);

    const headers: Record<string, string> = {
      "X-API-Key": token,
    };

    if (options.body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    console.log(`[PROXY] Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errBody = await response.text();
      console.log(`[PROXY] Error body: ${errBody.slice(0, 200)}`);
      try {
        const errJson = JSON.parse(errBody);
        return NextResponse.json(errJson, { status: response.status });
      } catch {
        return NextResponse.json(
          { error: errBody || `Upstream error: ${response.status} ${response.statusText}` },
          { status: response.status }
        );
      }
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      response.status === 204 ||
      !contentType.includes("application/json")
    ) {
      return NextResponse.json({ ok: true });
    }

    const data: unknown = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy error";
    console.log(`[PROXY] Exception: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
