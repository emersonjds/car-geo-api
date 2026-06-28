import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config.js';
import { registerRoutes } from './routes/index.js';
import { openapiDocument } from './openapi.js';
import { ensureApiKeySchema } from './lib/apikeys.js';
import { ensureDocumentSchema } from './lib/documents.js';
import { ensureGeoSchema } from './lib/geo-schema.js';

export async function buildApp() {
  const app = Fastify({
    trustProxy: true, // atrás do proxy do Render/CDN: confia em x-forwarded-*
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
    // esconde a barra de topo do Swagger (logo do Fastify)
    theme: { css: [{ filename: 'no-topbar.css', content: '.swagger-ui .topbar { display: none }' }] },
  });

  await app.register(registerRoutes);

  return app;
}

async function main() {
  const app = await buildApp();
  try {
    await ensureGeoSchema();      // garante extensões PostGIS, schema e seed (idempotente)
    await ensureApiKeySchema();   // garante a tabela de chaves (idempotente)
    await ensureDocumentSchema(); // garante a tabela de documentos (idempotente)
    await app.listen({ host: config.host, port: config.port });
    app.log.info(`CAR Geo API ouvindo em ${config.baseUrl} — docs em ${config.baseUrl}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
