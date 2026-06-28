import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { COLLECTIONS, getCollection } from '../lib/collections.js';
import { getItem, getItems } from '../lib/features.js';
import { link, parseBbox, parsePaging } from '../lib/ogc.js';
import { createApiKey } from '../lib/apikeys.js';
import { requireApiKey } from '../lib/auth.js';
import { getDocument, saveDocument } from '../lib/documents.js';
import { config } from '../config.js';
import { openapiDocument } from '../openapi.js';

const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8 MB decodificado
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function registerRoutes(app: FastifyInstance) {
  // Health check (infra/k8s)
  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { status: 'ok' };
  });

  // Spec OpenAPI bruto (para ferramentas externas / portal)
  app.get('/openapi.json', async () => openapiDocument);

  // Geração de chave de API (público) — qualquer pessoa pode gerar a sua.
  app.post<{ Body: { name?: string; email?: string } }>('/keys', async (req, reply) => {
    const body = req.body ?? {};
    const name = typeof body.name === 'string' ? body.name.slice(0, 120) : undefined;
    const email = typeof body.email === 'string' ? body.email.slice(0, 160) : undefined;
    const created = await createApiKey({ name, email });
    return reply.code(201).send({
      key: created.key,
      keyPrefix: created.keyPrefix,
      name: created.name,
      createdAt: created.createdAt,
      aviso: 'Guarde esta chave: ela não será exibida novamente. Envie-a no header X-API-Key.',
    });
  });

  // Upload de documento PDF (público) — recebe base64, devolve link público.
  app.post<{ Body: { pdf_base64?: string; nome?: string } }>(
    '/documentos',
    { bodyLimit: 12 * 1024 * 1024 }, // generoso p/ caber o base64 de um PDF de 8 MB
    async (req, reply) => {
      const body = req.body ?? {};
      if (typeof body.pdf_base64 !== 'string' || body.pdf_base64.length === 0) {
        return reply.code(400).send({ code: 'bad-request', description: 'pdf_base64 é obrigatório' });
      }
      const bytes = Buffer.from(body.pdf_base64, 'base64');
      if (bytes.byteLength === 0) {
        return reply.code(400).send({ code: 'bad-request', description: 'pdf_base64 inválido' });
      }
      if (bytes.byteLength > MAX_PDF_BYTES) {
        return reply.code(400).send({ code: 'bad-request', description: 'PDF maior que 8 MB' });
      }
      const nome = typeof body.nome === 'string' ? body.nome.slice(0, 200) : undefined;
      const saved = await saveDocument({ nome, bytes });
      return reply.code(201).send({
        id: saved.id,
        url: `${config.baseUrl}/documentos/${saved.id}`,
        nome: nome ?? null,
        createdAt: saved.createdAt,
      });
    },
  );

  // Download de documento PDF (público) — serve os bytes inline.
  app.get<{ Params: { id: string } }>('/documentos/:id', async (req, reply) => {
    if (!UUID_RE.test(req.params.id)) {
      return reply.code(404).send({ code: 'not-found', description: 'Documento não encontrado' });
    }
    const doc = await getDocument(req.params.id);
    if (!doc) return reply.code(404).send({ code: 'not-found', description: 'Documento não encontrado' });
    const safeName = (doc.nome ?? 'documento').replace(/["\r\n]/g, '').trim() || 'documento';
    reply.header('Content-Type', doc.mime || 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="${safeName}.pdf"`);
    return reply.send(doc.bytes);
  });

  // Landing page (OGC API Features — requirement class "Core")
  app.get('/', async () => ({
    title: 'API Geoespacial Aberta do CAR',
    description:
      'Fachada OGC API Features (REST + GeoJSON) para dados geoespaciais do Cadastro Ambiental Rural. haCARthon · Desafio 2 · Solução 7.',
    links: [
      link('/', 'self', 'application/json', 'Esta landing page'),
      link('/conformance', 'conformance', 'application/json', 'Classes de conformidade'),
      link('/collections', 'data', 'application/json', 'Coleções disponíveis'),
      link('/docs', 'service-doc', 'text/html', 'Documentação interativa (Swagger UI)'),
      link('/openapi.json', 'service-desc', 'application/json', 'Especificação OpenAPI'),
    ],
  }));

  // Conformance
  app.get('/conformance', async () => ({
    conformsTo: [
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/oas30',
    ],
  }));

  // Lista de coleções
  app.get('/collections', async () => ({
    links: [link('/collections', 'self')],
    collections: COLLECTIONS.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      itemType: 'feature',
      crs: ['http://www.opengis.net/def/crs/OGC/1.3/CRS84'],
      links: [
        link(`/collections/${c.id}`, 'self', 'application/json', c.title),
        link(`/collections/${c.id}/items`, 'items', 'application/geo+json', `Feições de ${c.title}`),
      ],
    })),
  }));

  // Metadados de uma coleção
  app.get<{ Params: { collectionId: string } }>('/collections/:collectionId', async (req, reply) => {
    const c = getCollection(req.params.collectionId);
    if (!c) return reply.code(404).send({ code: 'not-found', description: 'Coleção não encontrada' });
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      itemType: 'feature',
      crs: ['http://www.opengis.net/def/crs/OGC/1.3/CRS84'],
      links: [
        link(`/collections/${c.id}`, 'self'),
        link(`/collections/${c.id}/items`, 'items', 'application/geo+json'),
      ],
    };
  });

  // Feições (GeoJSON FeatureCollection) — suporta bbox, limit, offset
  app.get<{
    Params: { collectionId: string };
    Querystring: { bbox?: string; limit?: string; offset?: string };
  }>('/collections/:collectionId/items', { preHandler: requireApiKey }, async (req, reply) => {
    const c = getCollection(req.params.collectionId);
    if (!c) return reply.code(404).send({ code: 'not-found', description: 'Coleção não encontrada' });

    let bbox;
    try {
      bbox = parseBbox(req.query.bbox);
    } catch (err) {
      return reply.code(400).send({ code: 'bad-request', description: (err as Error).message });
    }
    const { limit, offset } = parsePaging(req.query.limit, req.query.offset);

    const { features, numberMatched, numberReturned } = await getItems(c, { limit, offset, bbox });

    reply.type('application/geo+json');
    return {
      type: 'FeatureCollection',
      features,
      numberMatched,
      numberReturned,
      timeStamp: new Date().toISOString(),
      links: [
        link(`/collections/${c.id}/items`, 'self', 'application/geo+json'),
        link(`/collections/${c.id}`, 'collection', 'application/json'),
      ],
    };
  });

  // Uma feição por id
  app.get<{ Params: { collectionId: string; featureId: string } }>(
    '/collections/:collectionId/items/:featureId',
    { preHandler: requireApiKey },
    async (req, reply) => {
      const c = getCollection(req.params.collectionId);
      if (!c) return reply.code(404).send({ code: 'not-found', description: 'Coleção não encontrada' });
      const feature = await getItem(c, req.params.featureId);
      if (!feature) return reply.code(404).send({ code: 'not-found', description: 'Feição não encontrada' });
      reply.type('application/geo+json');
      return { ...feature, links: [link(`/collections/${c.id}/items/${req.params.featureId}`, 'self')] };
    },
  );
}
