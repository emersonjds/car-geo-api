export const API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000'
).replace(/\/$/, '');

export interface Collection {
  id: string;
  title: string;
  description: string;
}

export interface GeneratedKey {
  key: string;
  keyPrefix: string;
  name: string | null;
  createdAt: string;
  aviso?: string;
}

export async function listCollections(): Promise<Collection[]> {
  const res = await fetch(`${API_BASE_URL}/collections`);
  if (!res.ok) throw new Error(`Falha ao listar coleções (HTTP ${res.status})`);
  const data = await res.json();
  return data.collections ?? [];
}

export async function generateKey(input: { name?: string; email?: string }): Promise<GeneratedKey> {
  const res = await fetch(`${API_BASE_URL}/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao gerar chave (HTTP ${res.status})`);
  return res.json();
}

export interface TestResult {
  status: number;
  ok: boolean;
  numberMatched?: number;
  numberReturned?: number;
  sample?: unknown;
  error?: string;
}

export async function testItems(collectionId: string, apiKey: string, bbox?: string): Promise<TestResult> {
  const url = new URL(`${API_BASE_URL}/collections/${collectionId}/items`);
  url.searchParams.set('limit', '5');
  if (bbox) url.searchParams.set('bbox', bbox);
  const res = await fetch(url.toString(), { headers: { 'X-API-Key': apiKey } });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return { status: res.status, ok: false, error: (body.description as string) ?? `HTTP ${res.status}` };
  }
  const features = (body.features as unknown[]) ?? [];
  return {
    status: res.status,
    ok: true,
    numberMatched: body.numberMatched as number,
    numberReturned: body.numberReturned as number,
    sample: features[0],
  };
}
