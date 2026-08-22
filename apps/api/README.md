# 🌎 CAR Geo API — Open Geospatial API for the CAR

An **OGC API Features** facade (REST + GeoJSON) over geospatial data from Brazil's **Rural Environmental Registry (CAR)**.

> **haCARthon** · Challenge 2 (*Improve access to CAR geospatial data*) · **Solution 7** — an open, standardised geospatial API.

## Why it exists

The official sources already publish CAR data, but in ways that are hard to consume:

| Source | What it offers | Limitation |
|--------|----------------|------------|
| SICAR GeoServer (`geoserver.car.gov.br`) | WMS/WFS, download base (shapefile) | Legacy OGC (XML/GML), heavy for apps |
| INDE (`inde.gov.br`) | National catalogue of OGC geoservices | Scattered, no unified REST API |
| TerraBrasilis / INPE | PRODES, DETER (WMS/WFS) | Focused on deforestation, not the registry |
| MapBiomas | Land use and land cover | Not the registry |

**This API** puts a modern **REST + GeoJSON** layer on top of those sources — easy to consume from QGIS, MapLibre/Leaflet, or any app. Built as a **Digital Public Good**: open, standardised and evolving.

## Stack

Node.js + TypeScript + **Fastify** · **PostgreSQL/PostGIS** · plain `pg` · **yarn**.

## Running it

This app is part of the monorepo. **Run it from the root** (`car-geo-api/`).

Everything in containers (Docker is the only requirement):

```bash
docker compose up -d --build    # PostGIS + API (:3000) + portal (:5173)
```

Or in development mode, with hot reload (requires Node 22+ and yarn):

```bash
yarn install      # from the root
yarn db:up        # start PostGIS only, with schema + seed (Sinop/MT)
yarn dev:api      # API only, on http://localhost:3000  (or `yarn dev` for API + portal)
```

Endpoint table in the [root README](../../README.md). Interactive docs: http://localhost:3000/docs

## Endpoints (OGC API Features)

| | Method | Route | Description |
|---|--------|-------|-------------|
| 🌐 | GET | `/` | Landing page + links |
| 🌐 | GET | `/conformance` | OGC conformance classes |
| 🌐 | GET | `/collections` · `/collections/{id}` | Collections and metadata |
| 🌐 | POST | `/keys` | Generate an API key |
| 🌐 | GET | `/docs` · `/openapi.json` | Swagger UI / OpenAPI spec |
| 🔑 | GET | `/collections/{id}/items` | Features as **GeoJSON** (`?bbox=`, `?limit=`, `?offset=`) |
| 🔑 | GET | `/collections/{id}/items/{fid}` | A single feature |
| 🌐 | GET | `/health` | Health check |

🌐 = public · 🔑 = requires the `X-API-Key` header. Collections: `imovel`, `app` (APP), `hidrografia`.

### Examples

```bash
# 1) Generate your key (once)
KEY=$(curl -s -X POST http://localhost:3000/keys -d '{}' -H 'Content-Type: application/json' | jq -r .key)

# Available collections (public)
curl http://localhost:3000/collections | jq

# Properties as GeoJSON (with a key)
curl -H "X-API-Key: $KEY" 'http://localhost:3000/collections/imovel/items?limit=10' | jq

# Spatial filter by bounding box (minLon,minLat,maxLon,maxLat in WGS84)
curl -H "X-API-Key: $KEY" 'http://localhost:3000/collections/imovel/items?bbox=-55.9,-12.0,-55.3,-11.6' | jq
```

### Opening it in QGIS

`Layer → Add Layer → Add WFS / OGC API Features Layer` → URL `http://localhost:3000`.

## Geospatial standards

- Stored in **SIRGAS 2000 (EPSG:4674)**; GeoJSON output in **WGS84 (EPSG:4326)**.
- **GIST** indexes; spatial filtering through a bounding box (`&&`).

## Adding a new layer

Add an entry to [`src/lib/collections.ts`](src/lib/collections.ts) pointing at the table and geometry column. The routes serve it automatically from then on.

## Roadmap

- [ ] Ingestion job from SICAR's WFS and download base
- [ ] Reference layers (conservation units, indigenous land, ANA hydrography, DEM)
- [ ] Automatic APP derivation (hydrography buffer + DEM) — see the `geo` agent
- [ ] Overlap detection (property × conservation unit / indigenous land / other properties)
- [ ] Caching (ETag/`Cache-Control`), rate limiting and cursor pagination

## License

MIT
