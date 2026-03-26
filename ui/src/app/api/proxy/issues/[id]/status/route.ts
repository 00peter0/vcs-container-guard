import { NextRequest } from "next/server";
import { proxyRequest } from "@/lib/proxy";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { status: string };

  if (body.status === "acknowledged") {
    return proxyRequest(`/api/issues/${id}/acknowledge`, {
      method: "PATCH",
      body: JSON.stringify({ acknowledged_by: "ui-user" }),
    });
  }

  if (body.status === "resolved") {
    return proxyRequest(`/api/issues/${id}/resolve`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
  }

  return new Response(JSON.stringify({ error: "Invalid status" }), { status: 400 });
}
