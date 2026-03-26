import { proxyRequest } from "@/lib/proxy";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(`/api/images/${id}`);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(`/api/images/${id}`, { method: "DELETE" });
}
