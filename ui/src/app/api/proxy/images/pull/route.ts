import { NextRequest } from "next/server";
import { proxyRequest } from "@/lib/proxy";

export async function POST(req: NextRequest) {
  const body = await req.text();
  return proxyRequest("/api/images/pull", {
    method: "POST",
    body,
  });
}
