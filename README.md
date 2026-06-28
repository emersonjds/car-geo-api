<div align="center">

# 🌎 CAR Geo

### API geoespacial aberta para o Cadastro Ambiental Rural

Dados do CAR em **REST + GeoJSON** (padrão **OGC API Features**), com **chave self-service** e **documentação interativa** — pensada como **Bem Público Digital**.

<p align="center">
  <img alt="OGC API Features" src="https://img.shields.io/badge/OGC%20API-Features-005a9c?style=flat-square">
  <img alt="GeoJSON" src="https://img.shields.io/badge/output-GeoJSON%20(RFC%207946)-3fb950?style=flat-square">
  <img alt="Fastify" src="https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify">
  <img alt="PostGIS" src="https://img.shields.io/badge/PostGIS-16--3.4-336791?style=flat-square&logo=postgresql&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Node" src="https://img.shields.io/badge/Node-20%2B-339933?style=flat-square&logo=node.js&logoColor=white">
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square">
</p>

<p align="center">
  <b><a href="https://car-geo-api.onrender.com/docs">🚀 Demo ao vivo (Swagger)</a></b>
  ·
  <a href="https://car-geo-api.onrender.com/openapi.json">openapi.json</a>
  ·
  <a href="https://car-geo-api.onrender.com/collections">/collections</a>
</p>

<sub><b>haCARthon</b> · Desafio 2 — <i>Melhorar o acesso a dados geoespaciais do CAR</i> · <b>Solução 7</b></sub>

</div>

---

## O que é

As fontes oficiais (GeoServer do SICAR, INDE, TerraBrasilis) já publicam dados do CAR — mas em formatos OGC legados (XML/GML, WFS, shapefile), difíceis de consumir por quem só quer *desenhar um mapa*. A **CAR Geo** põe uma camada moderna na frente:

- 🗺️ **OGC API Features** (REST + GeoJSON) — `fetch()` no navegador, plugar no QGIS, MapLibre, Leaflet.
- 🔑 **Chave self-service** — qualquer pessoa gera uma chave em segundos (`POST /keys`), sem cadastro.
- 📖 **Swagger embutido** — `/docs` para explorar e testar na hora.
- 🧭 **Geo correto** — armazena em SIRGAS 2000 (EPSG:4674), serve em WGS84 (4326); filtro por `bbox`, paginação, índice GIST.

## Coleções disponíveis

| `id` | Camada | Conteúdo |
|------|--------|----------|
| `imovel` | Imóveis rurais (CAR) | Perímetros, situação cadastral, área, município |
| `app` | Áreas de Preservação Permanente | Margem de rio, nascente, topo de morro, encosta |
| `hidrografia` | Hidrografia de referência | Rios, córregos, nascentes |

> Adicionar uma camada nova = **uma entrada** em [`apps/api/src/lib/collections.ts`](apps/api/src/lib/collections.ts). Nada mais muda.

---

## Como rodar localmente (com Docker)

Pré-requisitos: **Docker**, **Node 20+**, **yarn**.

```bash
yarn install      # instala todos os workspaces
yarn db:up        # sobe PostGIS no Docker (porta 5433) + extensões + schema + seed (Sinop/MT)
yarn dev          # API em :3000  +  Portal em :5173
```

Pronto:

- **Portal** → http://localhost:5173 — gere a chave e teste na hora
- **Swagger** → http://localhost:3000/docs
- **API** → http://localhost:3000

> O banco roda em container PostGIS (`postgis/postgis:16-3.4`); na primeira subida os scripts de [`apps/api/docker/initdb`](apps/api/docker/initdb) criam extensões, schema, **seed de exemplo (Sinop/MT)** e a tabela de chaves.

Outros comandos úteis:

```bash
yarn dev:api      # só a API
yarn dev:web      # só o portal
yarn db:down      # derruba o banco
yarn db:logs      # logs do PostGIS
yarn typecheck    # checa os dois workspaces
```

---

## Usando a API

**1. Gere uma chave** (pública, aparece só uma vez):

```bash
curl -X POST http://localhost:3000/keys \
  -H 'Content-Type: application/json' \
  -d '{"name":"Minha equipe"}'
# → { "key": "cargeo_…", "keyPrefix": "cargeo_…", "createdAt": "…" }
```

**2. Consuma os dados** com a chave no header `X-API-Key`:

```bash
# 10 imóveis em GeoJSON
curl 'http://localhost:3000/collections/imovel/items?limit=10' \
  -H 'X-API-Key: cargeo_…'

# filtrando por bounding box (minLon,minLat,maxLon,maxLat em WGS84)
curl 'http://localhost:3000/collections/imovel/items?bbox=-55.6,-11.9,-55.4,-11.7' \
  -H 'X-API-Key: cargeo_…'
```

### Endpoints

| Acesso | Rota | Descrição |
|--------|------|-----------|
| 🌐 público | `GET /` · `/conformance` | Landing + classes de conformidade OGC |
| 🌐 público | `GET /collections` · `/collections/{id}` | Metadados das coleções |
| 🌐 público | `POST /keys` | Gerar chave de API |
| 🌐 público | `GET /docs` · `/openapi.json` · `/health` | Swagger UI · spec OpenAPI · healthcheck |
| 🔑 com chave | `GET /collections/{id}/items` | Feições GeoJSON — `?bbox=` · `?limit=` · `?offset=` |
| 🔑 com chave | `GET /collections/{id}/items/{fid}` | Uma feição |

---

## Arquitetura

```
car-geo-api/                  monorepo (yarn workspaces)
├── apps/
│   ├── api/                  Fastify + PostGIS — OGC API Features, chaves, Swagger
│   │   ├── src/lib/          collections (registro), features (GeoJSON), apikeys, auth
│   │   ├── src/routes/       rotas públicas e protegidas
│   │   └── docker/initdb/    extensões + schema + seed + tabela de chaves
│   └── web/                  Portal do dev (Vite + React) — gerar chave, testar, Swagger
├── docker-compose.yml        PostGIS (host :5433)
└── render.yaml               blueprint de deploy (web service + Postgres)
```

**Regras geoespaciais:** armazena em **EPSG:4674** (SIRGAS 2000), serve GeoJSON em **4326** (WGS84) via `ST_Transform`; área/distância em metros (reprojetando, nunca em graus); índice **GIST** e filtro espacial começando por `&&`; queries **sempre parametrizadas**.

---

## Roadmap

- [ ] Endpoint de escrita autenticado (recebe geometria do app **CAR Campo**)
- [ ] Ingestão do WFS do SICAR e da Base de Downloads
- [ ] Rate-limit por chave, painel de uso, revogação de chave
- [ ] Camadas de referência (UC, TI, hidrografia ANA, MDE) + derivação automática de APP

## Licença

[MIT](LICENSE)
</content>
