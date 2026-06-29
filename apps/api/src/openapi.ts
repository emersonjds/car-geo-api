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
      'Leitura de feições é pública (sem autenticação). Gere uma chave gratuita no portal para acesso a funcionalidades futuras. haCARthon · Desafio 2 · Solução 7.',
    license: { name: 'MIT' },
  },
  // URL relativa: o Swagger resolve as chamadas contra o mesmo host que serve o /docs,
  // funcionando em local e em produção sem depender de env.
  servers: [{ url: '/' }],
  tags: [
    { name: 'Meta', description: 'Landing, conformidade e coleções (público)' },
    { name: 'Dados', description: 'Feições geoespaciais em GeoJSON (público)' },
    { name: 'Chaves', description: 'Geração de chave de API (público)' },
    { name: 'Documentos', description: 'Relatório preliminar do CAR Campo — PDF, link e consulta por CPF + código (público)' },
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
      NovoDocumentoRequest: {
        type: 'object',
        required: ['pdf_base64'],
        properties: {
          pdf_base64: { type: 'string', description: 'PDF da medição codificado em base64 (até 8 MB)' },
          nome: { type: 'string', example: 'Medição — Fazenda Boa Esperança' },
          cpf: { type: 'string', example: '000.000.000-00', description: 'Opcional; se enviado, protege a consulta (guardado como hash)' },
        },
      },
      DocumentoResponse: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          codigo: { type: 'string', example: 'K7M2QX', description: 'Código curto para consulta' },
          url: { type: 'string', description: 'Link direto do PDF' },
          view_url: { type: 'string', description: 'Página de visualização' },
          nome: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ConsultaLookupRequest: {
        type: 'object',
        required: ['codigo'],
        properties: {
          codigo: { type: 'string', example: 'K7M2QX' },
          cpf: { type: 'string', example: '000.000.000-00', description: 'Exigido se o documento foi salvo com CPF' },
        },
      },
    },
  },
  paths: {
    '/': {
      get: {
        tags: ['Meta'],
        summary: 'Documento raiz da API (OGC API Features)',
        description:
          'Ponto de entrada da OGC API Features — documento JSON obrigatório pelo padrão, com os links para /conformance, /collections e /openapi.json. Não é uma página web.',
        responses: { '200': { description: 'OK' } },
      },
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
        summary: 'Feições em GeoJSON (público)',
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
        },
      },
    },
    '/collections/{collectionId}/items/{featureId}': {
      get: {
        tags: ['Dados'],
        summary: 'Uma feição por id (público)',
        parameters: [
          { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'featureId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Feature' }, '404': { description: 'Não encontrada' } },
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
    '/documentos': {
      post: {
        tags: ['Documentos'],
        summary: 'Enviar relatório preliminar (PDF) e receber link + código',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NovoDocumentoRequest' } } },
        },
        responses: {
          '201': {
            description: 'Documento salvo',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DocumentoResponse' } } },
          },
          '400': { description: 'PDF ausente ou inválido' },
        },
      },
    },
    '/documentos/{id}': {
      get: {
        tags: ['Documentos'],
        summary: 'Baixar o PDF do documento',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'PDF', content: { 'application/pdf': {} } },
          '404': { description: 'Não encontrado' },
        },
      },
    },
    '/documentos/{id}/ver': {
      get: {
        tags: ['Documentos'],
        summary: 'Página de visualização do documento',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Página HTML', content: { 'text/html': {} } },
          '404': { description: 'Não encontrado' },
        },
      },
    },
    '/consulta': {
      get: {
        tags: ['Documentos'],
        summary: 'Página pública de consulta (CPF + código)',
        responses: { '200': { description: 'Página HTML', content: { 'text/html': {} } } },
      },
    },
    '/consulta/lookup': {
      post: {
        tags: ['Documentos'],
        summary: 'Localiza a medição por código e confere o CPF',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ConsultaLookupRequest' } } },
        },
        responses: {
          '200': { description: 'Encontrado — retorna { ok, view_url }' },
          '404': { description: 'Código inexistente ou CPF não confere' },
        },
      },
    },
    '/health': {
      get: { tags: ['Meta'], summary: 'Health check', responses: { '200': { description: 'OK' } } },
    },
  },
} as const;
