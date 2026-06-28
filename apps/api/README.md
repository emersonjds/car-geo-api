# 🌎 CAR Geo API — API Geoespacial Aberta do CAR

Fachada **OGC API Features** (REST + GeoJSON) sobre dados geoespaciais do **Cadastro Ambiental Rural (CAR)**.

> **haCARthon** · Desafio 2 (*Melhorar o acesso a dados geoespaciais do CAR*) · **Solução 7** — API geoespacial aberta e padronizada.

## Por que existe

As fontes oficiais já publicam dados do CAR, mas de forma difícil de consumir:

| Fonte | O que oferece | Limitação |
|-------|---------------|-----------|
| GeoServer do SICAR (`geoserver.car.gov.br`) | WMS/WFS, Base de Downloads (shapefile) | OGC legado (XML/GML), pesado para apps |
| INDE (`inde.gov.br`) | Catálogo nacional de geosserviços OGC | Disperso, sem API REST unificada |
| TerraBrasilis / INPE | PRODES, DETER (WMS/WFS) | Foco em desmatamento, não no CAR |
| MapBiomas | Uso e cobertura do solo | Não é o cadastro |

**Esta API** entrega uma camada moderna **REST + GeoJSON** por cima dessas fontes — fácil de consumir em QGIS, MapLibre/Leaflet, ou qualquer app. Pensada como **Bem Público Digital**: aberta, padronizada e evolutiva.

## Stack

Node.js + TypeScript + **Fastify** · **PostgreSQL/PostGIS** · `pg` puro · **yarn**.

## Como rodar

Este app faz parte do monorepo. **Rode a partir da raiz** (`car-geo-api/`):

```bash
yarn install      # na raiz
yarn db:up        # sobe PostGIS + schema + seed (Sinop/MT)
yarn dev:api      # só a API em http://localhost:3000  (ou `yarn dev` para API + portal)
```

Endpoint table no [README da raiz](../../README.md). Documentação interativa: http://localhost:3000/docs

## Endpoints (OGC API Features)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Landing page + links |
| 🌐 | GET | `/conformance` | Classes de conformidade OGC |
| 🌐 | GET | `/collections` · `/collections/{id}` | Coleções e metadados |
| 🌐 | POST | `/keys` | Gerar chave de API |
| 🌐 | GET | `/docs` · `/openapi.json` | Swagger UI / spec OpenAPI |
| 🔑 | GET | `/collections/{id}/items` | Feições em **GeoJSON** (`?bbox=`, `?limit=`, `?offset=`) |
| 🔑 | GET | `/collections/{id}/items/{fid}` | Uma feição |
| 🌐 | GET | `/health` | Health check |

🌐 = público · 🔑 = exige header `X-API-Key`. Coleções: `imovel`, `app` (APP), `hidrografia`.

### Exemplos

```bash
# 1) Gere sua chave (uma vez)
KEY=$(curl -s -X POST http://localhost:3000/keys -d '{}' -H 'Content-Type: application/json' | jq -r .key)

# Coleções disponíveis (público)
curl http://localhost:3000/collections | jq

# Imóveis em GeoJSON (com chave)
curl -H "X-API-Key: $KEY" 'http://localhost:3000/collections/imovel/items?limit=10' | jq

# Filtro espacial por bounding box (minLon,minLat,maxLon,maxLat em WGS84)
curl -H "X-API-Key: $KEY" 'http://localhost:3000/collections/imovel/items?bbox=-55.6,-11.9,-55.4,-11.8' | jq
```

### Abrir no QGIS

`Layer → Add Layer → Add WFS / OGC API Features Layer` → URL `http://localhost:3000`.

## Padrões geoespaciais

- Armazenamento em **SIRGAS 2000 (EPSG:4674)**; saída GeoJSON em **WGS84 (EPSG:4326)**.
- Índices **GIST**; filtro espacial via bounding box (`&&`).

## Como adicionar uma nova camada

Adicione uma entrada em [`src/lib/collections.ts`](src/lib/collections.ts) apontando para a tabela/coluna de geometria. As rotas passam a servi-la automaticamente.

## Roadmap (próximos passos)

- [ ] Job de ingestão a partir do WFS do SICAR e da Base de Downloads
- [ ] Camadas de referência (UC, TI, hidrografia ANA, MDE)
- [ ] Derivação automática de APP (buffer de hidrografia + MDE) — ver agente `geo`
- [ ] Detecção de sobreposições (imóvel × UC/TI × outro imóvel)
- [ ] Cache (ETag/`Cache-Control`), rate-limit e paginação por cursor
- [ ] OpenAPI 3 + Swagger UI

## Licença

A definir (recomendado: MIT ou similar, por ser Bem Público Digital).
