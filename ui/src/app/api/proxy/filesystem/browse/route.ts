import { NextRequest } from "next/server";
import { proxyRequest } from "@/lib/proxy";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "/root";
  return proxyRequest(`/api/filesystem/browse?path=${encodeURIComponent(path)}`);
}
