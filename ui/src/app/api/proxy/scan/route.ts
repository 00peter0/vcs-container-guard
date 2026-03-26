import { proxyRequest } from "@/lib/proxy";

export async function POST() {
  return proxyRequest("/api/scan", { method: "POST" });
}
