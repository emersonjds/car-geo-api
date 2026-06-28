export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  // URL base pública usada para montar os links HATEOAS exigidos pela OGC API.
  baseUrl: (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  database: {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5433),
    user: process.env.PGUSER ?? 'car',
    password: process.env.PGPASSWORD ?? 'car',
    database: process.env.PGDATABASE ?? 'car_geo',
  },
  // Limite de feições por página (proteção contra payloads gigantes).
  defaultLimit: 100,
  maxLimit: 10000,
} as const;
