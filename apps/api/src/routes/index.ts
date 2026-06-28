import type { FastifyInstance, FastifyRequest } from 'fastify';
import { pool } from '../db/pool.js';
import { COLLECTIONS, getCollection } from '../lib/collections.js';
import { getItem, getItems } from '../lib/features.js';
import { link, parseBbox, parsePaging } from '../lib/ogc.js';
import { createApiKey } from '../lib/apikeys.js';
import {
  getDocument,
  saveDocument,
  gerarCodigo,
  hashCpf,
  getDocumentByCodigo,
} from '../lib/documents.js';
import { config } from '../config.js';
import { openapiDocument } from '../openapi.js';

const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8 MB decodificado
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Origem pública para montar o link do documento. Funciona atrás de proxy/CDN
// (Render, Cloudflare, túnel) e em LAN: prioriza PUBLIC_BASE_URL (deploy), senão
// deriva dos headers x-forwarded-* / host do próprio request. Nunca usa localhost
// quando há host real — é isso que faz o link abrir em qualquer navegador.
function publicOrigin(req: FastifyRequest): string {
  const env = process.env.PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim() || req.protocol;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  return host ? `${proto}://${host}` : config.baseUrl;
}

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
  app.post<{ Body: { pdf_base64?: string; nome?: string; cpf?: string } }>(
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
      const cpfHash = typeof body.cpf === 'string' ? hashCpf(body.cpf.replace(/\D/g, '')) : null;

      // Tenta gerar um código único; colisão no índice único → tenta de novo.
      let saved;
      let codigo = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        codigo = gerarCodigo();
        try {
          saved = await saveDocument({ nome, bytes, codigo, cpfHash });
          break;
        } catch (err) {
          if ((err as { code?: string }).code === '23505' && attempt < 4) continue;
          throw err;
        }
      }
      if (!saved) {
        return reply.code(500).send({ code: 'internal', description: 'não foi possível gerar código' });
      }
      const origin = publicOrigin(req);
      return reply.code(201).send({
        id: saved.id,
        codigo,
        url: `${origin}/documentos/${saved.id}`,
        view_url: `${origin}/documentos/${saved.id}/ver`,
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

  // Página web de visualização (pitch/desktop) — embute o PDF servido em /:id.
  app.get<{ Params: { id: string } }>('/documentos/:id/ver', async (req, reply) => {
    if (!UUID_RE.test(req.params.id)) {
      return reply.code(404).type('text/html').send('<h1>Documento não encontrado</h1>');
    }
    const doc = await getDocument(req.params.id);
    if (!doc) return reply.code(404).type('text/html').send('<h1>Documento não encontrado</h1>');
    const pdf = `${publicOrigin(req)}/documentos/${req.params.id}`;
    const nome = (doc.nome ?? 'Medição CAR Campo').replace(/[<>&"]/g, '');
    const html = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nome} · CAR Campo</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0e1b12;color:#e9f0ea}
  header{display:flex;align-items:center;gap:10px;padding:14px 20px;background:#16321f}
  header b{font-size:16px} header span{color:#9bbfa6;font-size:13px}
  main{max-width:960px;margin:0 auto;padding:16px}
  iframe{width:100%;height:78vh;border:0;border-radius:10px;background:#fff}
  a.btn{display:inline-block;margin-top:12px;padding:10px 18px;background:#2d5a27;color:#fff;text-decoration:none;border-radius:8px;font-weight:600}
</style></head><body>
<header><span>🌿</span><b>CAR Campo</b><span>· Medição preliminar</span></header>
<main>
  <iframe src="${pdf}" title="${nome}"></iframe>
  <a class="btn" href="${pdf}" download>Baixar PDF</a>
</main></body></html>`;
    return reply.type('text/html').send(html);
  });

  // Página de consulta pública (pitch/desktop) — CPF + código → /documentos/:id/ver.
  app.get('/consulta', async (_req, reply) => {
    const html = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Consultar medição · CAR Campo</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0e1b12;color:#e9f0ea}
  header{display:flex;align-items:center;gap:10px;padding:14px 20px;background:#16321f}
  header b{font-size:16px} header span{color:#9bbfa6;font-size:13px}
  main{max-width:460px;margin:0 auto;padding:24px 16px}
  h1{font-size:22px;margin:8px 0 18px}
  label{display:block;margin:14px 0 6px;font-size:14px;color:#9bbfa6}
  input{width:100%;padding:12px 14px;border:1px solid #2d5a27;border-radius:8px;background:#10241a;color:#e9f0ea;font-size:16px}
  button{width:100%;margin-top:20px;padding:13px 18px;background:#2d5a27;color:#fff;border:0;border-radius:8px;font-weight:600;font-size:16px;cursor:pointer}
  #erro{margin-top:14px;color:#f3b0a8;font-size:14px;min-height:18px}
</style></head><body>
<header><span>🌿</span><b>CAR Campo</b><span>· Consulta</span></header>
<main>
  <h1>Consultar medição</h1>
  <form id="f">
    <label for="cpf">CPF</label>
    <input id="cpf" name="cpf" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="000.000.000-00">
    <label for="codigo">Código</label>
    <input id="codigo" name="codigo" autocapitalize="characters" autocomplete="off" placeholder="Ex.: K7M2QX" style="text-transform:uppercase">
    <button type="submit">Ver medição</button>
    <div id="erro"></div>
  </form>
</main>
<script>
  // Máscara de CPF: formata 000.000.000-00 enquanto digita (server ignora a pontuação).
  var cpfEl = document.getElementById('cpf');
  cpfEl.addEventListener('input', function () {
    var d = cpfEl.value.replace(/\D/g, '').slice(0, 11);
    var out = d;
    if (d.length > 9) out = d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6,9)+'-'+d.slice(9);
    else if (d.length > 6) out = d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6);
    else if (d.length > 3) out = d.slice(0,3)+'.'+d.slice(3);
    cpfEl.value = out;
  });
  document.getElementById('f').addEventListener('submit', async function (e) {
    e.preventDefault();
    var erro = document.getElementById('erro');
    erro.textContent = '';
    var cpf = document.getElementById('cpf').value;
    var codigo = document.getElementById('codigo').value.toUpperCase().trim();
    try {
      var r = await fetch('/consulta/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: cpf, codigo: codigo }),
      });
      var data = await r.json();
      if (data.ok) { location.href = data.view_url; }
      else { erro.textContent = 'Medição não encontrada — confira CPF e código.'; }
    } catch (_) {
      erro.textContent = 'Medição não encontrada — confira CPF e código.';
    }
  });
</script>
</body></html>`;
    return reply.type('text/html').send(html);
  });

  // Lookup da consulta — acha por código e confere o CPF (hash). Não vaza se erro
  // é "código inexistente" ou "CPF errado": ambos respondem 404 { ok:false }.
  app.post<{ Body: { cpf?: string; codigo?: string } }>('/consulta/lookup', async (req, reply) => {
    const body = req.body ?? {};
    if (typeof body.codigo !== 'string' || body.codigo.trim().length === 0) {
      return reply.code(400).send({ ok: false, description: 'código é obrigatório' });
    }
    const doc = await getDocumentByCodigo(body.codigo.trim().toUpperCase());
    if (!doc) return reply.code(404).send({ ok: false });
    if (doc.cpf_hash && hashCpf((body.cpf ?? '').replace(/\D/g, '')) !== doc.cpf_hash) {
      return reply.code(404).send({ ok: false });
    }
    return reply.send({
      ok: true,
      id: doc.id,
      view_url: `${publicOrigin(req)}/documentos/${doc.id}/ver`,
    });
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
  }>('/collections/:collectionId/items', async (req, reply) => {
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
