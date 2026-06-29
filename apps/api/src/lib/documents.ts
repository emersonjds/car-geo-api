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

// ---------------------------------------------------------------------------
// Documento de EXEMPLO (demonstração sem o app)
// ---------------------------------------------------------------------------
// Avaliador que não roda o app ainda consegue clicar "ver exemplo" na /consulta
// e abrir um documento preliminar realista (croqui de satélite + metragem).
// Código fixo, dados da Fazenda Boa Esperança (mesmo imóvel do seed geoespacial).

/** Código curto fixo do documento de exemplo (consulta pública). */
export const CODIGO_EXEMPLO = 'CAMP24';

const EXEMPLO_BBOX = '-55.326829,-11.667025,-55.273406,-11.632146';
const EXEMPLO_SVG_PTS = '416.5,74.1 254.5,192.9 226.3,397.8 416.5,485.9 613.7,401.9 575,195';
const EXEMPLO_SAT = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${EXEMPLO_BBOX}&bboxSR=4326&imageSR=4326&size=840,560&format=jpg&f=image`;

/** HTML do documento preliminar de exemplo (renderiza no iframe da /ver). */
function buildExemploHTML(): string {
  const dots = EXEMPLO_SVG_PTS.split(' ')
    .map((p) => {
      const [x, y] = p.split(',');
      return `<circle cx="${x}" cy="${y}" r="6" fill="#fff" stroke="#1f7a3d" stroke-width="2.5"/>`;
    })
    .join('');
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Documento preliminar (exemplo) · CAR Campo</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:'Work Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#eef3ee;color:#1a241c}
  .sheet{max-width:780px;margin:18px auto;background:#fff;border:1px solid #dce5dd;border-radius:16px;overflow:hidden;box-shadow:0 18px 40px rgba(16,40,24,0.10)}
  .top{display:flex;align-items:center;gap:10px;padding:18px 22px;background:#16321f;color:#fff}
  .top .mark{width:30px;height:30px;border-radius:8px;background:#2d5a27;display:inline-flex;align-items:center;justify-content:center;font-size:16px}
  .top b{font-size:16px} .top .sub{font-size:12px;color:#bcd6c2;margin-left:auto}
  .ribbon{background:#fff7e6;color:#9a6b00;font-size:12px;font-weight:700;text-align:center;padding:7px;border-bottom:1px solid #f0e2bf;letter-spacing:.04em}
  .pad{padding:20px 22px}
  h1{font-size:20px;margin:0 0 2px;color:#012d1d}
  .muted{color:#5b6b5d;font-size:13px;margin:0 0 16px}
  .croqui{position:relative;border-radius:12px;overflow:hidden;border:1px solid #cfe0d2;aspect-ratio:840/560;background:#dfe7e0}
  .croqui img{width:100%;height:100%;object-fit:cover;display:block}
  .croqui svg{position:absolute;inset:0;width:100%;height:100%}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:16px}
  .kpi{background:#f5f8f5;border:1px solid #e1ebe3;border-radius:12px;padding:12px 14px}
  .kpi .l{font-size:11px;color:#5b6b5d;text-transform:uppercase;letter-spacing:.05em}
  .kpi .v{font-size:18px;font-weight:800;color:#16321f;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:18px;font-size:14px}
  td{padding:9px 0;border-bottom:1px solid #eef2ee} td.k{color:#5b6b5d;width:42%}
  td.v{font-weight:600;color:#1a241c;text-align:right}
  .foot{padding:14px 22px;background:#f5f8f5;border-top:1px solid #e1ebe3;font-size:12px;color:#5b6b5d;text-align:center}
</style></head><body>
  <div class="sheet">
    <div class="top"><span class="mark">🌿</span><b>CAR Campo Geo API</b><span class="sub">Documento preliminar</span></div>
    <div class="ribbon">EXEMPLO · gerado pelo app CAR Campo para demonstração — sem valor cadastral</div>
    <div class="pad">
      <h1>Medição — Fazenda Boa Esperança</h1>
      <p class="muted">Croqui georreferenciado do perímetro medido em campo (imagem de satélite + vetor da demarcação).</p>
      <div class="croqui">
        <img src="${EXEMPLO_SAT}" alt="Imagem de satélite do imóvel" loading="eager">
        <svg viewBox="0 0 840 560" preserveAspectRatio="none">
          <polygon points="${EXEMPLO_SVG_PTS}" fill="rgba(64,196,99,0.22)" stroke="#1f7a3d" stroke-width="3.5" stroke-linejoin="round"/>
          ${dots}
        </svg>
      </div>
      <div class="grid">
        <div class="kpi"><div class="l">Área</div><div class="v">522,70 ha</div></div>
        <div class="kpi"><div class="l">Perímetro</div><div class="v">8.607 m</div></div>
        <div class="kpi"><div class="l">Vértices</div><div class="v">6</div></div>
        <div class="kpi"><div class="l">Centroide</div><div class="v">-11.6500, -55.3003</div></div>
      </div>
      <table>
        <tr><td class="k">Produtor</td><td class="v">João Pereira da Silva</td></tr>
        <tr><td class="k">CPF</td><td class="v">***.456.789-**</td></tr>
        <tr><td class="k">Município / UF</td><td class="v">Sorriso / MT</td></tr>
        <tr><td class="k">Datum de referência</td><td class="v">SIRGAS 2000 (EPSG:4674)</td></tr>
        <tr><td class="k">Código da medição</td><td class="v">${CODIGO_EXEMPLO}</td></tr>
      </table>
    </div>
    <div class="foot">CAR Campo Geo API · haCARthon — Desafio 2 · Solução 7 · documento de exemplo</div>
  </div>
</body></html>`;
}

/** Semeia/atualiza o documento de exemplo (idempotente — roda no boot). */
export async function ensureExampleDocument(): Promise<void> {
  const html = Buffer.from(buildExemploHTML(), 'utf8');
  await query(
    `INSERT INTO documento (nome, mime, bytes, codigo)
     VALUES ($1, 'text/html', $2, $3)
     ON CONFLICT (codigo) DO UPDATE
       SET bytes = EXCLUDED.bytes, mime = EXCLUDED.mime, nome = EXCLUDED.nome`,
    ['Exemplo — Fazenda Boa Esperança', html, CODIGO_EXEMPLO],
  );
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
