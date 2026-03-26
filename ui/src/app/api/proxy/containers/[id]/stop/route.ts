import { proxyRequest } from "@/lib/proxy";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(`/api/containers/${id}/stop`, {
    method: "POST",
  });
}
