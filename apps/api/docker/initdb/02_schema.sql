-- ---------------------------------------------------------------------------
-- Esquema de dados geoespaciais do CAR
-- Geometrias armazenadas em SIRGAS 2000 (EPSG:4674), padrão oficial do CAR.
-- A API reprojeta para WGS84 (EPSG:4326) ao servir GeoJSON (RFC 7946).
-- ---------------------------------------------------------------------------

-- Imóveis rurais (CAR)
CREATE TABLE IF NOT EXISTS imovel (
  fid          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cod_car      TEXT UNIQUE NOT NULL,
  nome         TEXT,
  municipio    TEXT,
  uf           CHAR(2),
  area_ha      NUMERIC(12, 4),
  modulos_fisc NUMERIC(8, 2),
  situacao     TEXT,            -- ativo | pendente | cancelado | em_analise
  geom         GEOMETRY(MultiPolygon, 4674) NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_imovel_geom ON imovel USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_imovel_uf ON imovel (uf);

-- Áreas de Preservação Permanente (APP)
CREATE TABLE IF NOT EXISTS app (
  fid       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cod_car   TEXT,              -- imóvel ao qual pertence (FK lógica)
  tipo      TEXT NOT NULL,     -- margem_rio | nascente | topo_morro | encosta
  area_ha   NUMERIC(12, 4),
  geom      GEOMETRY(MultiPolygon, 4674) NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_geom ON app USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_app_cod_car ON app (cod_car);

-- Hidrografia de referência (feições naturais — rios)
CREATE TABLE IF NOT EXISTS hidrografia (
  fid    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome   TEXT,
  tipo   TEXT,                 -- rio | corrego | nascente
  geom   GEOMETRY(MultiLineString, 4674) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hidrografia_geom ON hidrografia USING GIST (geom);
