// Registro de coleções (camadas) servidas pela API.
// Adicionar uma nova camada = adicionar uma entrada aqui. Nada mais muda.

export interface CollectionDef {
  id: string;
  title: string;
  description: string;
  table: string;
  geomColumn: string;
  storageSrid: number;
  /** Colunas não-geométricas expostas como properties do GeoJSON. */
  properties: string[];
  /** Coluna usada como id da feição. */
  idColumn: string;
}

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
  },
];

export function getCollection(id: string): CollectionDef | undefined {
  return COLLECTIONS.find((c) => c.id === id);
}
