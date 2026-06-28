# CAR Geo — Leitura pública + Portal CAR Campo (design)

**Data:** 2026-06-28 · **haCARthon** Desafio 2 · Solução 7

## Contexto / problema

Hoje os endpoints de dados (`/collections/{id}/items`) exigem `X-API-Key`, e o seed
geográfico só existe no Docker local — em produção (Render) não há PostGIS nem tabelas
geo, então a leitura de feições quebraria. Para a API servir como **Bem Público Digital**
consumível por outras ferramentas/plataformas, a leitura precisa ser pública e haver dados
reais em produção. Em paralelo, o portal web precisa comunicar o valor do **CAR Campo**
(medir a propriedade sobre mapas oficiais, sem custo, como documento inicial) de forma
impactante.

## Objetivos

1. **Leitura pública** das feições (interoperabilidade OGC / open data).
2. **Dados em produção**: popular o banco do Render automaticamente no boot.
3. **Portal de tirar o fôlego**: narrativa CAR Campo + mapa interativo com animações.

## A) Backend

### A1. GET público
- Remover `{ preHandler: requireApiKey }` de `/collections/:collectionId/items` e
  `/collections/:collectionId/items/:featureId` em `apps/api/src/routes/index.ts`.
- Manter `auth.ts` e `POST /keys` (uso futuro: escrita, rate-limit, atribuição).
- Atualizar `apps/api/src/openapi.ts`: tirar `security` desses operations + ajustar textos.

### A2. Auto-seed no boot — `ensureGeoSchema()`
- Novo módulo (ex.: `apps/api/src/lib/geo-schema.ts`), idempotente, no padrão de
  `ensureApiKeySchema`/`ensureDocumentSchema`; chamado em `server.ts main()`.
- Passos: executar `01_extensions.sql` (CREATE EXTENSION postgis) e `02_schema.sql`
  (CREATE TABLE IF NOT EXISTS) sempre; se `SELECT count(*) FROM imovel = 0`, executar
  `03_seed.sql`.
- **Fonte única de verdade:** lê os arquivos de `apps/api/docker/initdb/*.sql` em runtime
  (resolvendo o caminho a partir da raiz do projeto), então Docker local e Render usam o
  mesmo SQL. Não duplicar o seed em TS.
- Premissa: Render free Postgres suporta `CREATE EXTENSION postgis`.

### A3. Seed mais rico (`03_seed.sql`)
- De 3 → ~10-12 imóveis em Sinop/MT, mais APP (margem_rio, nascente, topo_morro, encosta)
  e mais hidrografia. Geometrias válidas em EPSG:4674.
- Incluir um par "perímetro **oficial** (CAR) × medição **de campo**" para ilustrar a
  sobreposição/diferença de metragem no mapa do portal.

## B) Frontend (`apps/web`)

Landing com scroll cinematográfico, mantendo o cliente em `src/api.ts`:

1. **Hero** com mapa animado de fundo — "Meça sua propriedade sobre os mapas oficiais. De graça."
2. **Para o produtor** — cards de valor: mede no campo, sobrepõe ao CAR/mapas oficiais para
   conferir metragem, sem custo, serve como documento inicial.
3. **Mapa interativo (MapLibre GL)** — basemap satélite/OSM + GeoJSON ao vivo da API pública;
   animações: polígono "desenhando", `flyTo` entre feições, swipe oficial × medido.
4. **Portal do dev** (mantido, reposicionado) — gerar chave, console de teste, Swagger embutido.

- **Dependência nova:** `maplibre-gl` (única). Tiles raster gratuitos (Esri World Imagery / OSM).
- Animações: IntersectionObserver (reveal on scroll), easing do MapLibre, CSS transitions.
- `api.ts`: como a leitura é pública, `testItems`/preview do mapa não precisam de chave.

## C) Orquestração

`arq` (valida ponta-a-ponta) · `back` (rotas públicas + boot-seed + OpenAPI) ·
`geo` (seed rico + correção espacial) · frontend/UX `fintech-pwa-ux-specialist`
(landing + mapa + animações) · `redteam` (superfície pública: DoS por bbox/limit, exposição) ·
`bug` (gate final) · `scribe` (README/copy/OpenAPI).

Branch `feat/leitura-publica-e-portal` → merge na master. Micro commits sem traço de LLM
(sem Co-Authored-By, sem 🤖, autor é o usuário, conventional commits em pt-br minúsculas).

## Verificação

- `yarn typecheck` (api + web) verde.
- Local: `yarn db:up && yarn dev` → portal em :5173 com mapa renderizando GeoJSON; API em :3000.
- `curl http://localhost:3000/collections/imovel/items?limit=5` **sem** header → 200 + FeatureCollection.
- Produção: novo deploy do Render popula o banco; `/collections/imovel/items` responde 200 público.

## Fora de escopo (roadmap)

- Ingestão de WFS oficial do SICAR / camadas WMS oficiais embutidas.
- Rate-limit por chave, revogação, painel de uso.
- Endpoint de escrita autenticado (recebe medição do app CAR Campo).
