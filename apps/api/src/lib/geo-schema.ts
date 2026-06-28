import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';

// ponytail: resolve do repo (apps/api/docker/initdb/) tanto em src/ quanto em dist/
// pois ambos ficam a ../../ do arquivo; o tsc não precisa copiar os .sql.
function sqlPath(filename: string): string {
  return fileURLToPath(new URL(`../../docker/initdb/${filename}`, import.meta.url));
}

/** Garante extensões PostGIS, schema e seed inicial. Idempotente. */
export async function ensureGeoSchema(): Promise<void> {
  try {
    console.log('[geo-schema] Aplicando extensões e schema...');
    // pool.query sem params usa o protocolo simples (PQexec) — suporta múltiplos statements.
    await pool.query(fs.readFileSync(sqlPath('01_extensions.sql'), 'utf8'));
    await pool.query(fs.readFileSync(sqlPath('02_schema.sql'), 'utf8'));
    console.log('[geo-schema] Extensões e tabelas OK.');

    const countRes = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM imovel');
    const n = countRes.rows[0]?.n ?? 0;

    if (n === 0) {
      console.log('[geo-schema] Tabela imovel vazia — executando seed...');
      await pool.query(fs.readFileSync(sqlPath('03_seed.sql'), 'utf8'));
      const afterRes = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM imovel');
      const after = afterRes.rows[0]?.n ?? 0;
      console.log(`[geo-schema] Seed concluído: ${after} imóveis inseridos.`);
    } else {
      console.log(`[geo-schema] Seed ignorado: ${n} imóveis já presentes.`);
    }
  } catch (err) {
    console.error('[geo-schema] Falha ao inicializar schema geoespacial:', err);
    throw err; // propaga para main() encerrar o processo com erro visível
  }
}
