// Registro de coleções (camadas) servidas pela API.
// Adicionar uma nova camada = adicionar uma entrada aqui. Nada mais muda.

/** Propriedade derivada da geometria via SQL (ex.: perímetro, centroide). */
export interface ComputedProp {
  /** Nome da chave no `properties` do GeoJSON. */
  key: string;
  /** Expressão SQL (pode referenciar `t.geom`). Calculada no banco (PostGIS). */
  expr: string;
}

export interface CollectionDef {
  id: string;
  title: string;
  description: string;
  table: string;
  geomColumn: string;
  storageSrid: number;
  /** Colunas não-geométricas expostas como properties do GeoJSON. */
  properties: string[];
  /** Propriedades calculadas da geometria (metragem real, lat/lon do centroide). */
  computed?: ComputedProp[];
  /** Coluna usada como id da feição. */
  idColumn: string;
}

// Helpers de expressão (geometria armazenada em 4674 → métrica via geography 4326).
const PERIMETRO_M = `round(ST_Perimeter(ST_Transform(t.geom, 4326)::geography)::numeric, 1)`;
const COMPRIMENTO_M = `round(ST_Length(ST_Transform(t.geom, 4326)::geography)::numeric, 1)`;
const AREA_HA_CALC = `round((ST_Area(ST_Transform(t.geom, 4326)::geography) / 10000)::numeric, 2)`;
const CENTROIDE = `jsonb_build_object(
  'lon', round(ST_X(ST_Centroid(ST_Transform(t.geom, 4326)))::numeric, 6),
  'lat', round(ST_Y(ST_Centroid(ST_Transform(t.geom, 4326)))::numeric, 6)
)`;

export const COLLECTIONS: CollectionDef[] = [
  {
    id: 'imovel',
    title: 'Imóveis rurais (CAR)',
    description:
      'Perímetros dos imóveis rurais cadastrados no CAR, com situação cadastral, área e município.',
    table: 'imovel',
    geomColumn: 'geom',
    storageSrid: 4674,
    idColumn: 'fid',
    properties: ['cod_car', 'nome', 'municipio', 'uf', 'area_ha', 'modulos_fisc', 'situacao', 'atualizado_em'],
    computed: [
      { key: 'area_ha_calc', expr: AREA_HA_CALC },
      { key: 'perimetro_m', expr: PERIMETRO_M },
      { key: 'centroide', expr: CENTROIDE },
    ],
  },
  {
    id: 'app',
    title: 'Áreas de Preservação Permanente (APP)',
    description:
      'Feições de APP (margem de rio, nascente, topo de morro, encosta) associadas aos imóveis.',
    table: 'app',
    geomColumn: 'geom',
    storageSrid: 4674,
    idColumn: 'fid',
    properties: ['cod_car', 'tipo', 'area_ha', 'atualizado_em'],
    computed: [
      { key: 'perimetro_m', expr: PERIMETRO_M },
      { key: 'centroide', expr: CENTROIDE },
    ],
  },
  {
    id: 'hidrografia',
    title: 'Hidrografia de referência',
    description: 'Feições naturais de hidrografia (rios, córregos, nascentes) usadas como base de referência.',
    table: 'hidrografia',
    geomColumn: 'geom',
    storageSrid: 4674,
    idColumn: 'fid',
    properties: ['nome', 'tipo'],
    computed: [
      { key: 'comprimento_m', expr: COMPRIMENTO_M },
      { key: 'centroide', expr: CENTROIDE },
    ],
  },
];

export function getCollection(id: string): CollectionDef | undefined {
  return COLLECTIONS.find((c) => c.id === id);
}
