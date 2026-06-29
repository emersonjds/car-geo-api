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
    // esconde a topbar (logo do Fastify) e força tema claro (caso o SO/navegador
    // esteja em dark mode). ponytail: não vence extensões tipo Dark Reader.
    theme: {
      css: [
        {
          filename: 'cargeo.css',
          content:
            ':root{color-scheme:light}html,body,.swagger-ui{background:#fff !important}.swagger-ui .topbar{display:none}',
        },
      ],
    },
  });

  await app.register(registerRoutes);

  return app;
}

async function main() {
  const app = await buildApp();

  // Abre a porta ANTES do bootstrap de banco: o Render detecta a porta na hora
  // e o healthcheck /health passa, mesmo se o Postgres estiver lento. Antes, o
  // listen só ocorria após o seed — banco lento/travado = "no open ports detected".
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
