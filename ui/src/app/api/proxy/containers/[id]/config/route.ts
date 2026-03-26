import { proxyRequest } from "@/lib/proxy";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(`/api/containers/${id}/config`);
}
