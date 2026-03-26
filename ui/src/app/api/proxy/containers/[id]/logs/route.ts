import { NextRequest } from "next/server";
import { proxyRequest } from "@/lib/proxy";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tail = req.nextUrl.searchParams.get("tail") ?? "100";
  return proxyRequest(`/api/containers/${id}/logs?tail=${tail}`);
}
