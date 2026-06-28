import { config } from './config.js';
import { COLLECTIONS } from './lib/collections.js';

// Documento OpenAPI 3 servido para o Swagger UI (/docs) e em /openapi.json.
export const openapiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'CAR Geo API',
    version: '0.1.0',
    description:
      'API geoespacial aberta e padronizada (OGC API Features) para o Cadastro Ambiental Rural (CAR). ' +
      'Gere uma chave gratuita no portal e use no header `X-API-Key`. haCARthon · Desafio 2 · Solução 7.',
    license: { name: 'MIT' },
  },
  // URL relativa: o Swagger resolve as chamadas contra o mesmo host que serve o /docs,
  // funcionando em local e em produção sem depender de env.
  servers: [{ url: '/' }],
  tags: [
    { name: 'Meta', description: 'Landing, conformidade e coleções (público)' },
    { name: 'Dados', description: 'Feições geoespaciais em GeoJSON (requer chave)' },
    { name: 'Chaves', description: 'Geração de chave de API (público)' },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    },
    schemas: {
      Erro: {
        type: 'object',
        properties: { code: { type: 'string' }, description: { type: 'string' } },
      },
      NovaChaveRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Equipe Panic Lobster' },
          email: { type: 'string', example: 'time@exemplo.org' },
        },
      },
      NovaChaveResponse: {
        type: 'object',
        properties: {
          key: { type: 'string', example: 'cargeo_AbC...xyz', description: 'Mostrada apenas uma vez' },
          keyPrefix: { type: 'string', example: 'cargeo_AbCdEf' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      FeatureCollection: {
        type: 'object',
        properties: {
          type: { type: 'string', example: 'FeatureCollection' },
          features: { type: 'array', items: { type: 'object' } },
          numberMatched: { type: 'integer' },
          numberReturned: { type: 'integer' },
        },
      },
    },
  },
  paths: {
    '/': {
      get: { tags: ['Meta'], summary: 'Landing page', responses: { '200': { description: 'OK' } } },
    },
    '/conformance': {
      get: { tags: ['Meta'], summary: 'Classes de conformidade OGC', responses: { '200': { description: 'OK' } } },
    },
    '/collections': {
      get: {
        tags: ['Meta'],
        summary: 'Lista de coleções (camadas) disponíveis',
        responses: { '200': { description: 'OK' } },
      },
    },
    '/collections/{collectionId}': {
      get: {
        tags: ['Meta'],
        summary: 'Metadados de uma coleção',
        parameters: [
          {
            name: 'collectionId',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: COLLECTIONS.map((c) => c.id) },
          },
        ],
        responses: { '200': { description: 'OK' }, '404': { description: 'Não encontrada' } },
      },
    },
    '/collections/{collectionId}/items': {
      get: {
        tags: ['Dados'],
        summary: 'Feições em GeoJSON (requer chave de API)',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: 'collectionId',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: COLLECTIONS.map((c) => c.id) },
          },
          { name: 'bbox', in: 'query', schema: { type: 'string' }, description: 'minLon,minLat,maxLon,maxLat (WGS84)' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: config.defaultLimit } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': {
            description: 'FeatureCollection',
            content: { 'application/geo+json': { schema: { $ref: '#/components/schemas/FeatureCollection' } } },
          },
          '401': { description: 'Chave ausente/inválida', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
        },
      },
    },
    '/collections/{collectionId}/items/{featureId}': {
      get: {
        tags: ['Dados'],
        summary: 'Uma feição por id (requer chave de API)',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'featureId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Feature' }, '401': { description: 'Não autorizado' }, '404': { description: 'Não encontrada' } },
      },
    },
    '/keys': {
      post: {
        tags: ['Chaves'],
        summary: 'Gerar uma chave de API (gratuita)',
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NovaChaveRequest' } } },
        },
        responses: {
          '201': {
            description: 'Chave criada (guarde — só aparece uma vez)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/NovaChaveResponse' } } },
          },
        },
      },
    },
    '/health': {
      get: { tags: ['Meta'], summary: 'Health check', responses: { '200': { description: 'OK' } } },
    },
  },
} as const;
