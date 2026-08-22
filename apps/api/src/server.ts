import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config.js';
import { registerRoutes } from './routes/index.js';
import { openapiDocument } from './openapi.js';
import { ensureApiKeySchema } from './lib/apikeys.js';
import { ensureDocumentSchema, ensureExampleDocument } from './lib/documents.js';
import { ensureGeoSchema } from './lib/geo-schema.js';

export async function buildApp() {
  const app = Fastify({
    trustProxy: true, // behind a proxy/CDN/tunnel: trust x-forwarded-*
    logger: {
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
  });

  await app.register(cors, { origin: true });

  // Swagger / OpenAPI — documentação interativa em /docs
  await app.register(swagger, {
    mode: 'static',
    specification: { document: openapiDocument as never },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
    // único ajuste: esconde a topbar (logo do Fastify). Resto é Swagger padrão.
    theme: {
      css: [{ filename: 'cargeo.css', content: '.swagger-ui .topbar{display:none}' }],
    },
  });

  await app.register(registerRoutes);

  return app;
}

async function main() {
  const app = await buildApp();

  // Bind the port BEFORE the database bootstrap: the port answers immediately
  // and the healthcheck passes even when Postgres is slow (under compose the
  // database container may still be starting). Previously listen only happened
  // after the seed, so a slow or stuck database looked like a dead service.
  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(`CAR Geo API ouvindo em ${config.baseUrl} — docs em ${config.baseUrl}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Bootstrap idempotente do schema/seed roda depois, sem bloquear a porta.
  // Falha aqui (ex.: Postgres sem PostGIS) é logada e NÃO derruba a API — os
  // endpoints que dependem do schema é que vão falhar, não o serviço inteiro.
  try {
    await ensureGeoSchema();      // garante extensões PostGIS, schema e seed (idempotente)
    await ensureApiKeySchema();   // garante a tabela de chaves (idempotente)
    await ensureDocumentSchema(); // garante a tabela de documentos (idempotente)
    await ensureExampleDocument(); // semeia o documento de exemplo (consulta CAMP24)
  } catch (err) {
    app.log.error({ err }, 'bootstrap de schema falhou — API no ar, endpoints dependentes de banco podem falhar');
  }
}

main();
