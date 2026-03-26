import { NextRequest, NextResponse } from "next/server";
import { proxyRequest } from "@/lib/proxy";

export async function GET() {
  console.log("[CONTAINERS] GET called");
  return proxyRequest("/api/containers");
}

export async function POST(req: NextRequest) {
  console.log("[CONTAINERS] POST called");
  const body = await req.text();
  console.log("[CONTAINERS] Body:", body.slice(0, 100));
  return proxyRequest("/api/containers/create", {
    method: "POST",
    body,
  });
}
