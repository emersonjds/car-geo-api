import { query } from '../db/pool.js';
import type { CollectionDef } from './collections.js';
import { OUTPUT_SRID } from './ogc.js';

interface FeatureRow {
  fid: string | number;
  geojson: string;
  props: Record<string, unknown>;
}

function buildSelect(col: CollectionDef): string {
  const propsJson = col.properties.map((p) => `'${p}', t.${p}`).join(', ');
  return `
    SELECT
      t.${col.idColumn}::text AS fid,
      ST_AsGeoJSON(ST_Transform(t.${col.geomColumn}, ${OUTPUT_SRID}), 7) AS geojson,
      jsonb_build_object(${propsJson}) AS props
    FROM ${col.table} t
  `;
}

export interface ItemsParams {
  limit: number;
  offset: number;
  bbox?: [number, number, number, number] | null;
}

/** Retorna uma FeatureCollection GeoJSON + total de feições que casam o filtro. */
export async function getItems(col: CollectionDef, params: ItemsParams) {
  const where: string[] = [];
  const values: unknown[] = [];

  if (params.bbox) {
    // bbox vem em WGS84 (4326); converte o envelope para o SRID de armazenamento.
    values.push(params.bbox[0], params.bbox[1], params.bbox[2], params.bbox[3]);
    where.push(
      `t.${col.geomColumn} && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, ${OUTPUT_SRID}), ${col.storageSrid})`,
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countSql = `SELECT count(*)::int AS n FROM ${col.table} t ${whereSql}`;
  const countRes = await query<{ n: number }>(countSql, values);
  const numberMatched = countRes.rows[0]?.n ?? 0;

  const dataSql = `
    ${buildSelect(col)}
    ${whereSql}
    ORDER BY t.${col.idColumn}
    LIMIT ${params.limit} OFFSET ${params.offset}
  `;
  const dataRes = await query<FeatureRow>(dataSql, values);

  const features = dataRes.rows.map((r) => ({
    type: 'Feature' as const,
    id: r.fid,
    geometry: JSON.parse(r.geojson),
    properties: r.props,
  }));

  return { features, numberMatched, numberReturned: features.length };
}

/** Retorna uma única feição (ou null). */
export async function getItem(col: CollectionDef, fid: string) {
  const sql = `${buildSelect(col)} WHERE t.${col.idColumn}::text = $1 LIMIT 1`;
  const res = await query<FeatureRow>(sql, [fid]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    type: 'Feature' as const,
    id: r.fid,
    geometry: JSON.parse(r.geojson),
    properties: r.props,
  };
}
