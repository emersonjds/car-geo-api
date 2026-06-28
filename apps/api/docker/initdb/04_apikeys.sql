-- Chaves de API (também garantida no boot da API via ensureApiKeySchema).
CREATE TABLE IF NOT EXISTS api_key (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT,
  email        TEXT,
  key_prefix   TEXT NOT NULL,
  key_hash     TEXT UNIQUE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked      BOOLEAN NOT NULL DEFAULT false
);
