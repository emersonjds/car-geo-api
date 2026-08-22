<div align="center">

# 🌎 CAR Geo

### Open geospatial API for Brazil's Rural Environmental Registry (CAR)

CAR data as **REST + GeoJSON** (**OGC API Features**), with **self-service keys** and **interactive docs** — built as a **Digital Public Good**.

<p align="center">
  <img alt="OGC API Features" src="https://img.shields.io/badge/OGC%20API-Features-005a9c?style=flat-square">
  <img alt="GeoJSON" src="https://img.shields.io/badge/output-GeoJSON%20(RFC%207946)-3fb950?style=flat-square">
  <img alt="Fastify" src="https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify">
  <img alt="PostGIS" src="https://img.shields.io/badge/PostGIS-16--3.4-336791?style=flat-square&logo=postgresql&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Node" src="https://img.shields.io/badge/Node-22%2B-339933?style=flat-square&logo=node.js&logoColor=white">
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square">
</p>

<p align="center">
  <b>One command brings the whole stack up:</b> <code>docker compose up -d --build</code>
  <br>
  Portal on <code>:5173</code> · API on <code>:3000</code> · Swagger on <code>/docs</code>
</p>

<sub><b>haCARthon</b> · Challenge 2 — <i>Improve access to CAR geospatial data</i> · <b>Solution 7</b></sub>

</div>

---

## What it is

The official sources (SICAR's GeoServer, INDE, TerraBrasilis) already publish CAR data — but in legacy OGC formats (XML/GML, WFS, shapefile) that are hard to consume when all you want is to *draw a map*. **CAR Geo** puts a modern layer in front of them:

- 🗺️ **OGC API Features** (REST + GeoJSON) — `fetch()` in the browser, or plug straight into QGIS, MapLibre, Leaflet.
- 🔑 **Self-service keys** — anyone gets a key in seconds (`POST /keys`), no sign-up.
- 📖 **Swagger built in** — `/docs` to explore and try it out right away.
- 🧭 **Correct geospatial handling** — stored in SIRGAS 2000 (EPSG:4674), served in WGS84 (4326); `bbox` filtering, pagination, GIST index.

## Available collections

| `id` | Layer | Contents |
|------|-------|----------|
| `imovel` | Rural properties (CAR) | Boundaries, registry status, area, municipality |
| `app` | Permanent Preservation Areas | Riverbanks, springs, hilltops, slopes |
| `hidrografia` | Reference hydrography | Rivers, streams, springs |

> Adding a new layer means **one entry** in [`apps/api/src/lib/collections.ts`](apps/api/src/lib/collections.ts). Nothing else changes.

---

## Running locally

All you need is **Docker**. The whole stack — PostGIS, API and portal — comes up with one command:

```bash
docker compose up -d --build     # or: yarn docker:up
```

That's it:

| | URL |
|---|---|
| **Developer portal** | http://localhost:5173 — generate a key and try the API |
| **Swagger** | http://localhost:3000/docs |
| **API** | http://localhost:3000 |
| **PostGIS** | `localhost:5433` (user `car`, password `car`, database `car_geo`) |

On the first start the scripts in [`apps/api/docker/initdb`](apps/api/docker/initdb) create the PostGIS
extensions, the schema, the **example seed (Sinop/MT and neighbouring municipalities)** and the API key
table. The API repeats that bootstrap on boot, idempotently, so an empty database heals itself.

```bash
docker compose logs -f           # follow the logs (or: yarn docker:logs)
docker compose down              # tear everything down (or: yarn docker:down)
docker compose down -v           # tear down and drop the database volume (resets the seed)
```

### Development mode (hot reload)

To work on the code, run only the database in a container and both apps on your machine.
Requires **Node 22+** and **yarn**:

```bash
yarn install      # install every workspace
yarn db:up        # start PostGIS only (port 5433)
yarn dev          # API on :3000 + portal on :5173, with reload
```

Other useful commands:

```bash
yarn dev:api      # API only
yarn dev:web      # portal only
yarn db:down      # stop the database
yarn db:logs      # PostGIS logs
yarn typecheck    # type-check both workspaces
```

Environment variables: copy [`apps/api/.env.example`](apps/api/.env.example) and
[`apps/web/.env.example`](apps/web/.env.example) to `.env` if you need different ports or want to point
the portal at another API. Compose already passes the right values.

---

## Using the API

**1. Generate a key** (public, shown only once):

```bash
curl -X POST http://localhost:3000/keys \
  -H 'Content-Type: application/json' \
  -d '{"name":"My team"}'
# → { "key": "cargeo_…", "keyPrefix": "cargeo_…", "createdAt": "…" }
```

**2. Read the data** with the key in the `X-API-Key` header:

```bash
# 10 properties as GeoJSON
curl 'http://localhost:3000/collections/imovel/items?limit=10' \
  -H 'X-API-Key: cargeo_…'

# filtering by bounding box (minLon,minLat,maxLon,maxLat in WGS84)
curl 'http://localhost:3000/collections/imovel/items?bbox=-55.9,-12.0,-55.3,-11.6' \
  -H 'X-API-Key: cargeo_…'
```

### Endpoints

| Access | Route | Description |
|--------|-------|-------------|
| 🌐 public | `GET /` · `/conformance` | Landing page + OGC conformance classes |
| 🌐 public | `GET /collections` · `/collections/{id}` | Collection metadata |
| 🌐 public | `POST /keys` | Generate an API key |
| 🌐 public | `GET /docs` · `/openapi.json` · `/health` | Swagger UI · OpenAPI spec · healthcheck |
| 🔑 with key | `GET /collections/{id}/items` | GeoJSON features — `?bbox=` · `?limit=` · `?offset=` |
| 🔑 with key | `GET /collections/{id}/items/{fid}` | A single feature |

---

## Architecture

```
car-geo-api/                  monorepo (yarn workspaces)
├── apps/
│   ├── api/                  Fastify + PostGIS — OGC API Features, keys, Swagger
│   │   ├── src/lib/          collections (registry), features (GeoJSON), apikeys, auth
│   │   ├── src/routes/       public and protected routes
│   │   ├── docker/initdb/    extensions + schema + seed + API key table
│   │   └── Dockerfile        API image
│   └── web/                  Developer portal (Vite + React) — keys, testing, Swagger
│       └── Dockerfile        portal image
└── docker-compose.yml        full stack: PostGIS (:5433) + API (:3000) + portal (:5173)
```

**Geospatial rules:** stored in **EPSG:4674** (SIRGAS 2000), served as GeoJSON in **4326** (WGS84) via `ST_Transform`; area and distance in metres (reprojecting, never in degrees); **GIST** index with the spatial filter starting from `&&`; queries **always parameterised**.

---

## Roadmap

- [ ] Authenticated write endpoint (receives geometry from the **CAR Campo** app)
- [ ] Ingestion from SICAR's WFS and download base
- [ ] Per-key rate limiting, usage dashboard, key revocation
- [ ] Reference layers (conservation units, indigenous land, ANA hydrography, DEM) + automatic APP derivation

## License

[MIT](LICENSE)
