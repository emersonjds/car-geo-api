import { config } from '../config.js';

export interface Link {
  href: string;
  rel: string;
  type?: string;
  title?: string;
}

export function link(path: string, rel: string, type = 'application/json', title?: string): Link {
  return { href: `${config.baseUrl}${path}`, rel, type, ...(title ? { title } : {}) };
}

/** WGS84 = SRID de saída do GeoJSON (RFC 7946). */
export const OUTPUT_SRID = 4326;

/** Parseia um parâmetro bbox "minLon,minLat,maxLon,maxLat". Lança Error se inválido. */
export function parseBbox(raw: string | undefined): [number, number, number, number] | null {
  if (!raw) return null;
  const parts = raw.split(',').map((n) => Number(n.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw new Error('bbox inválido: use minLon,minLat,maxLon,maxLat');
  }
  return parts as [number, number, number, number];
}

/** Normaliza limit/offset dentro dos limites de segurança. */
export function parsePaging(limitRaw?: string, offsetRaw?: string): { limit: number; offset: number } {
  let limit = limitRaw ? Number(limitRaw) : config.defaultLimit;
  if (Number.isNaN(limit) || limit <= 0) limit = config.defaultLimit;
  limit = Math.min(limit, config.maxLimit);
  let offset = offsetRaw ? Number(offsetRaw) : 0;
  if (Number.isNaN(offset) || offset < 0) offset = 0;
  return { limit, offset };
}
