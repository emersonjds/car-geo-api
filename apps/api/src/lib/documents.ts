import { query } from '../db/pool.js';

/** Cria a tabela de documentos se não existir (roda no boot — idempotente). */
export async function ensureDocumentSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS documento (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome        TEXT,
      mime        TEXT NOT NULL DEFAULT 'application/pdf',
      bytes       BYTEA NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/** Salva um documento (PDF) e retorna id + timestamp de criação. */
export async function saveDocument(input: {
  nome?: string;
  mime?: string;
  bytes: Buffer;
}): Promise<{ id: string; createdAt: string }> {
  const res = await query<{ id: string; created_at: string }>(
    `INSERT INTO documento (nome, mime, bytes)
     VALUES ($1, $2, $3)
     RETURNING id, created_at`,
    [input.nome ?? null, input.mime ?? 'application/pdf', input.bytes],
  );
  const row = res.rows[0]!;
  return { id: row.id, createdAt: row.created_at };
}

/** Busca um documento por id; retorna null se não existir. */
export async function getDocument(
  id: string,
): Promise<{ nome: string | null; mime: string; bytes: Buffer } | null> {
  const res = await query<{ nome: string | null; mime: string; bytes: Buffer }>(
    `SELECT nome, mime, bytes FROM documento WHERE id = $1`,
    [id],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { nome: row.nome, mime: row.mime, bytes: row.bytes };
}
