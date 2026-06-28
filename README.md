# 🌎 CAR Geo — plataforma de dados geoespaciais abertos do CAR

Monorepo com **API geoespacial aberta** (OGC API Features, REST + GeoJSON) sobre dados do **Cadastro Ambiental Rural** + um **portal de desenvolvedor** onde qualquer pessoa gera uma chave gratuita e testa a API (estilo Swagger).

> **haCARthon** · Desafio 2 (*Melhorar o acesso a dados geoespaciais do CAR*) · **Solução 7**.

## Estrutura (yarn workspaces)

```
apps/api    → Backend Fastify + PostGIS (OGC API Features + chaves de API + Swagger)
apps/web    → Portal do desenvolvedor (Vite + React): gerar chave, testar, docs
docker-compose.yml → PostGIS
```

## Como rodar (tudo junto)

Pré-requisitos: Docker, Node 20+, yarn.

```bash
yarn install
yarn db:up        # sobe PostGIS + schema + seed (Sinop/MT)
yarn dev          # API em :3000  +  Portal em :5173
```

Abra **http://localhost:5173** → gere sua chave → teste na hora. A documentação Swagger fica em **http://localhost:3000/docs**.

## Fluxo de uso da API

1. **Gere uma chave** (no portal, ou `POST /keys`):
   ```bash
   curl -X POST http://localhost:3000/keys -H 'Content-Type: application/json' \
     -d '{"name":"Minha equipe"}'
   # → { "key": "cargeo_…" }  (guarde: aparece só uma vez)
   ```
2. **Consuma os dados** enviando a chave no header `X-API-Key`:
   ```bash
   curl 'http://localhost:3000/collections/imovel/items?limit=10' \
     -H 'X-API-Key: cargeo_…'
   ```

## Endpoints

| Acesso | Rota | Descrição |
|--------|------|-----------|
| 🌐 público | `GET /` · `/conformance` · `/collections` · `/collections/{id}` | Metadados OGC |
| 🌐 público | `POST /keys` | Gerar chave de API |
| 🌐 público | `GET /docs` · `/openapi.json` | Swagger UI / spec OpenAPI |
| 🔑 com chave | `GET /collections/{id}/items` | Feições em GeoJSON (`?bbox=`, `?limit=`, `?offset=`) |
| 🔑 com chave | `GET /collections/{id}/items/{fid}` | Uma feição |

Coleções: `imovel`, `app` (APP), `hidrografia`.

## Por que existe

As fontes oficiais (GeoServer do SICAR, INDE, TerraBrasilis) já publicam dados do CAR, mas em OGC legado (XML/GML, shapefile), difícil de consumir. Esta plataforma entrega acesso **REST + GeoJSON**, com **chave self-service** e **documentação interativa** — pensada como **Bem Público Digital**.

Detalhes técnicos por app: [`apps/api/README.md`](apps/api/README.md).

## Roadmap

- [ ] Endpoint de escrita autenticado (recebe geometria do app [CAR Campo](../car-campo-app))
- [ ] Ingestão do WFS do SICAR e da Base de Downloads
- [ ] Rate-limit por chave, painel de uso, revogação de chave
- [ ] Camadas de referência (UC, TI, hidrografia ANA, MDE) + derivação automática de APP
