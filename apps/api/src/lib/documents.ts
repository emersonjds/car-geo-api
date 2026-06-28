import { createHash, randomInt } from 'node:crypto';
import { query } from '../db/pool.js';

// ponytail: salt fixo no código; produção usaria env (CONSULTA_SALT).
const SALT = 'car-campo-consulta-v1';

/** Hash com salt do CPF (só dígitos) — CPF nunca é salvo cru (LGPD). */
export function hashCpf(cpfDigits: string): string {
  return createHash('sha256').update(SALT + cpfDigits).digest('hex');
}

/** Gera código curto de 6 chars (alfabeto sem ambíguos: 0/O, 1/I/L). */
export function gerarCodigo(): string {
  const alf = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 6; i++) out += alf[randomInt(0, alf.length)];
  return out;
}

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
  await query(`ALTER TABLE documento ADD COLUMN IF NOT EXISTS codigo TEXT;`);
  await query(`ALTER TABLE documento ADD COLUMN IF NOT EXISTS cpf_hash TEXT;`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS documento_codigo_idx ON documento (codigo);`);
}

/** Salva um documento (PDF) e retorna id + timestamp de criação. */
export async function saveDocument(input: {
  nome?: string;
  mime?: string;
  bytes: Buffer;
  codigo?: string;
  cpfHash?: string | null;
}): Promise<{ id: string; createdAt: string }> {
  const res = await query<{ id: string; created_at: string }>(
    `INSERT INTO documento (nome, mime, bytes, codigo, cpf_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [
      input.nome ?? null,
      input.mime ?? 'application/pdf',
      input.bytes,
      input.codigo ?? null,
      input.cpfHash ?? null,
    ],
  );
  const row = res.rows[0]!;
  return { id: row.id, createdAt: row.created_at };
}

/** Busca id + cpf_hash por código curto; null se não existir. */
export async function getDocumentByCodigo(
  codigo: string,
): Promise<{ id: string; cpf_hash: string | null } | null> {
  const res = await query<{ id: string; cpf_hash: string | null }>(
    `SELECT id, cpf_hash FROM documento WHERE codigo = $1`,
    [codigo],
  );
  return res.rows[0] ?? null;
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
