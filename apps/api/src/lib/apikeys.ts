import crypto from 'node:crypto';
import { query } from '../db/pool.js';

const KEY_PREFIX = 'cargeo_';

export interface ApiKeyInfo {
  id: number;
  name: string | null;
  email: string | null;
  keyPrefix: string;
  createdAt: string;
}

/** Cria a tabela de chaves se não existir (roda no boot — robusto a volume já criado). */
export async function ensureApiKeySchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS api_key (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name        TEXT,
      email       TEXT,
      key_prefix  TEXT NOT NULL,
      key_hash    TEXT UNIQUE NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at TIMESTAMPTZ,
      revoked     BOOLEAN NOT NULL DEFAULT false
    );
  `);
}

function hashKey(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

export interface CreatedKey extends ApiKeyInfo {
  /** Chave em texto puro — exibida UMA única vez. */
  key: string;
}

/** Gera uma nova chave, guarda só o hash, e retorna o texto puro uma vez. */
export async function createApiKey(input: { name?: string; email?: string }): Promise<CreatedKey> {
  const secret = crypto.randomBytes(24).toString('base64url');
  const key = `${KEY_PREFIX}${secret}`;
  const keyHash = hashKey(key);
  const keyPrefix = key.slice(0, 14); // ex.: cargeo_AbCdEf

  const res = await query<{ id: number; created_at: string }>(
    `INSERT INTO api_key (name, email, key_prefix, key_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [input.name ?? null, input.email ?? null, keyPrefix, keyHash],
  );
  const row = res.rows[0]!;
  return {
    id: row.id,
    name: input.name ?? null,
    email: input.email ?? null,
    keyPrefix,
    createdAt: row.created_at,
    key,
  };
}

/** Valida uma chave; atualiza last_used_at. Retorna info ou null. */
export async function verifyApiKey(plain: string | undefined): Promise<ApiKeyInfo | null> {
  if (!plain || !plain.startsWith(KEY_PREFIX)) return null;
  const res = await query<{
    id: number;
    name: string | null;
    email: string | null;
    key_prefix: string;
    created_at: string;
  }>(
    `UPDATE api_key SET last_used_at = now()
     WHERE key_hash = $1 AND revoked = false
     RETURNING id, name, email, key_prefix, created_at`,
    [hashKey(plain)],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, keyPrefix: row.key_prefix, createdAt: row.created_at };
}
