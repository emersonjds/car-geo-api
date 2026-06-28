# CLAUDE.md — CAR Geo (monorepo)

Contexto para agentes de IA trabalhando neste repositório.

## O que é

Plataforma **CAR Geo**: API geoespacial aberta (**OGC API Features**, REST + GeoJSON) sobre dados do **Cadastro Ambiental Rural (CAR)** + um **portal de desenvolvedor** onde qualquer pessoa gera uma chave e testa a API (estilo Swagger).
haCARthon · **Desafio 2 · Solução 7**.

## Monorepo (yarn workspaces)

```
car-geo-api/
├── apps/
│   ├── api/        Backend Fastify + PostGIS (OGC API Features + chaves de API)
│   └── web/        Portal do desenvolvedor (Vite + React) — gerar chave, testar, Swagger embutido
├── docker-compose.yml   PostGIS (porta host 5433)
└── package.json         workspaces + scripts orquestradores
```

Gerenciador: **yarn** (workspaces). Dependências hoisted no `node_modules` da raiz.

## Comandos (na raiz)

```bash
yarn install        # instala todos os workspaces
yarn db:up          # sobe PostGIS (docker)
yarn dev            # sobe API (:3000) + Web (:5173) juntos (concurrently)
yarn dev:api        # só a API
yarn dev:web        # só o portal
yarn typecheck      # checa os dois workspaces
yarn db:down        # derruba o banco
```

## apps/api (backend)

- `src/server.ts` — Fastify + CORS + **Swagger UI** (`/docs`) + bootstrap da tabela de chaves.
- `src/openapi.ts` — documento **OpenAPI 3** (servido em `/openapi.json` e no `/docs`).
- `src/lib/collections.ts` — **registro de coleções** (camadas). Adicionar camada = uma entrada.
- `src/lib/features.ts` — GeoJSON via `ST_AsGeoJSON` + `ST_Transform`.
- `src/lib/apikeys.ts` — geração/validação de chave (hash sha256, tabela `api_key`).
- `src/lib/auth.ts` — preHandler `requireApiKey` (header `X-API-Key`).
- `src/routes/index.ts` — rotas. **Públicas**: `/`, `/conformance`, `/collections`, `/collections/{id}`, `POST /keys`, `/openapi.json`, `/docs`, `/health`. **Protegidas (exigem chave)**: `/collections/{id}/items` e `.../items/{fid}`.
- `docker/initdb/*.sql` — extensões, schema, seed e tabela de chaves (1ª subida do PostGIS).

### Regras geoespaciais (não quebrar)
- Armazenar em **SIRGAS 2000 (EPSG:4674)**; servir GeoJSON em **WGS84 (4326)** via `ST_Transform`.
- Área/distância em metros → reprojetar; nunca em graus. Índice **GIST**; filtro espacial começa por `&&`.
- Queries **sempre parametrizadas**; nome de tabela/coluna só do registro de coleções.

### Chaves de API
- `POST /keys` (público) cria uma chave `cargeo_…` e retorna o texto puro **uma vez** (guarda só o hash).
- Endpoints de dados exigem header `X-API-Key`. A tabela `api_key` é garantida no boot (`ensureApiKeySchema`).

## apps/web (portal)

- Vite + React + TS. `src/App.tsx` — landing, geração de chave, quickstart com a chave, mini-console de teste, lista de coleções (live da API) e **Swagger embutido** (iframe de `/docs`).
- `src/api.ts` — cliente. URL da API via `VITE_API_BASE_URL` (default `http://localhost:3000`).

## Agentes & MCP

`.claude/agents/`: **arq**, **back**, **geo**, **bug**, **redteam**, **scribe** (adaptados ao domínio CAR/geo).
MCP: `serena`, `context-mode`, `context7` (`.mcp.json`).
