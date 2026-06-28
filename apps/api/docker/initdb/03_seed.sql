-- ---------------------------------------------------------------------------
-- Dados de exemplo (sintéticos, didáticos) — região de Sinop/MT.
-- Coordenadas em lon/lat SIRGAS 2000 (EPSG:4674 ≈ WGS84 para fins didáticos).
-- Bounding box geral: lon -55.70..-55.42, lat -11.88..-11.80
-- NÃO usar em produção. Executado na 1ª subida do PostGIS (via docker/initdb)
-- e pelo bootstrap da API quando a tabela imovel está vazia.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- IMÓVEIS (12 feições)
-- Polígonos retangulares, sem sobreposição, espalhados na região.
-- area_ha calculada a partir das dimensões do polígono em projeção UTM-21S.
-- módulo fiscal de referência: ~90 ha (Sinop/Sorriso/Vera/Cláudia - MT).
-- ===========================================================================
INSERT INTO imovel (cod_car, nome, municipio, uf, area_ha, modulos_fisc, situacao, geom) VALUES

-- ---- Sinop (IBGE 5107909) -----------------------------------------------

(
  'MT-5107909-A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6',
  'Fazenda Boa Esperança', 'Sinop', 'MT', 412.50, 4.58, 'ativo',
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.520 -11.860, -55.500 -11.860, -55.500 -11.878, -55.520 -11.878, -55.520 -11.860))',
  4674))
),
(
  'MT-5107909-B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7',
  'Sítio Três Irmãos', 'Sinop', 'MT', 88.20, 0.98, 'pendente',
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.498 -11.862, -55.486 -11.862, -55.486 -11.872, -55.498 -11.872, -55.498 -11.862))',
  4674))
),
(
  'MT-5107909-C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8',
  'Fazenda Rio Verde', 'Sinop', 'MT', 1240.00, 13.78, 'em_analise',
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.484 -11.855, -55.455 -11.855, -55.455 -11.885, -55.484 -11.885, -55.484 -11.855))',
  4674))
),
(
  'MT-5107909-F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6C7',
  'Fazenda Santa Clara', 'Sinop', 'MT', 800.80, 8.90, 'ativo',
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.450 -11.858, -55.420 -11.858, -55.420 -11.880, -55.450 -11.880, -55.450 -11.858))',
  4674))
),

-- ---- Sorriso (IBGE 5107925) ----------------------------------------------

(
  'MT-5107925-D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9',
  'Fazenda São Lucas', 'Sorriso', 'MT', 1061.70, 11.80, 'ativo',
  -- lon -55.700..-55.665 (Δ0.035°), lat -11.825..-11.800 (Δ0.025°)
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.700 -11.800, -55.665 -11.800, -55.665 -11.825, -55.700 -11.825, -55.700 -11.800))',
  4674))
),
(
  'MT-5107925-E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0',
  'Fazenda Três Marias', 'Sorriso', 'MT', 1188.80, 13.21, 'pendente',
  -- lon -55.660..-55.625 (Δ0.035°), lat -11.828..-11.800 (Δ0.028°)
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.660 -11.800, -55.625 -11.800, -55.625 -11.828, -55.660 -11.828, -55.660 -11.800))',
  4674))
),
(
  'MT-5107925-B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3',
  'Fazenda Primavera', 'Sorriso', 'MT', 1213.10, 13.48, 'ativo',
  -- lon -55.700..-55.660 (Δ0.040°), lat -11.855..-11.830 (Δ0.025°)
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.700 -11.830, -55.660 -11.830, -55.660 -11.855, -55.700 -11.855, -55.700 -11.830))',
  4674))
),

-- ---- Cláudia (IBGE 5103056) ---------------------------------------------

(
  'MT-5103056-F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1',
  'Sítio Bela Vista', 'Cláudia', 'MT', 970.70, 10.79, 'ativo',
  -- lon -55.620..-55.588 (Δ0.032°), lat -11.825..-11.800 (Δ0.025°)
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.620 -11.800, -55.588 -11.800, -55.588 -11.825, -55.620 -11.825, -55.620 -11.800))',
  4674))
),
(
  'MT-5103056-A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2',
  'Fazenda Nova Aurora', 'Cláudia', 'MT', 976.60, 10.85, 'cancelado',
  -- lon -55.583..-55.548 (Δ0.035°), lat -11.823..-11.800 (Δ0.023°)
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.583 -11.800, -55.548 -11.800, -55.548 -11.823, -55.583 -11.823, -55.583 -11.800))',
  4674))
),
(
  'MT-5103056-E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6',
  'Fazenda Cerrado Vivo', 'Cláudia', 'MT', 849.30, 9.44, 'ativo',
  -- lon -55.565..-55.530 (Δ0.035°), lat -11.850..-11.830 (Δ0.020°)
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.565 -11.830, -55.530 -11.830, -55.530 -11.850, -55.565 -11.850, -55.565 -11.830))',
  4674))
),

-- ---- Vera (IBGE 5108402) ------------------------------------------------

(
  'MT-5108402-C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4',
  'Fazenda Campo Largo', 'Vera', 'MT', 1116.20, 12.40, 'em_analise',
  -- lon -55.655..-55.615 (Δ0.040°), lat -11.853..-11.830 (Δ0.023°)
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.655 -11.830, -55.615 -11.830, -55.615 -11.853, -55.655 -11.853, -55.655 -11.830))',
  4674))
),
(
  'MT-5108402-D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5',
  'Sítio Ipê Amarelo', 'Vera', 'MT', 1067.80, 11.86, 'pendente',
  -- lon -55.610..-55.570 (Δ0.040°), lat -11.852..-11.830 (Δ0.022°)
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.610 -11.830, -55.570 -11.830, -55.570 -11.852, -55.610 -11.852, -55.610 -11.830))',
  4674))
);


-- ===========================================================================
-- APP — Áreas de Preservação Permanente (8 feições)
-- Geometrias dentro dos respectivos imóveis. Tipos: margem_rio (30 m de
-- faixa marginal do leito regular), nascente (raio 50 m), topo_morro,
-- encosta. Valores de area_ha sintéticos/aproximados.
-- ===========================================================================
INSERT INTO app (cod_car, tipo, area_ha, geom) VALUES

-- APP 1: faixa marginal do Córrego da Onça — Fazenda Boa Esperança
-- (paralelogramo representando faixa inclinada junto ao curso d'água)
(
  'MT-5107909-A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6',
  'margem_rio', 6.4,
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.516 -11.862, -55.514 -11.862, -55.508 -11.876, -55.510 -11.876, -55.516 -11.862))',
  4674))
),

-- APP 2: raio de nascente — Fazenda Rio Verde
(
  'MT-5107909-C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8',
  'nascente', 1.1,
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.470 -11.866, -55.468 -11.866, -55.468 -11.868, -55.470 -11.868, -55.470 -11.866))',
  4674))
),

-- APP 3: faixa marginal do Córrego da Onça — Fazenda Primavera (Sorriso)
-- faixa de ~218 m × 1113 m ao longo do corrego (sintético/didático)
(
  'MT-5107925-B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3',
  'margem_rio', 24.3,
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.682 -11.838, -55.680 -11.838, -55.680 -11.848, -55.682 -11.848, -55.682 -11.838))',
  4674))
),

-- APP 4: raio de nascente — Fazenda São Lucas (Sorriso)
-- ~100 m × 100 m ao redor do ponto de nascente (approx 50 m de raio)
(
  'MT-5107925-D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9',
  'nascente', 1.2,
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.692 -11.809, -55.691 -11.809, -55.691 -11.810, -55.692 -11.810, -55.692 -11.809))',
  4674))
),

-- APP 5: topo de morro — Fazenda Três Marias (Sorriso)
(
  'MT-5107925-E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0',
  'topo_morro', 10.9,
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.650 -11.808, -55.647 -11.808, -55.647 -11.811, -55.650 -11.811, -55.650 -11.808))',
  4674))
),

-- APP 6: encosta (declividade > 45°) — Fazenda Campo Largo (Vera)
(
  'MT-5108402-C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4',
  'encosta', 19.4,
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.645 -11.836, -55.641 -11.836, -55.641 -11.840, -55.645 -11.840, -55.645 -11.836))',
  4674))
),

-- APP 7: faixa marginal do Córrego do Canivete — Sítio Ipê Amarelo (Vera)
-- faixa centrada sobre o eixo do córrego em lon ≈ -55.592
(
  'MT-5108402-D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5',
  'margem_rio', 19.4,
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.594 -11.836, -55.590 -11.836, -55.590 -11.844, -55.594 -11.844, -55.594 -11.836))',
  4674))
),

-- APP 8: topo de morro — Fazenda Cerrado Vivo (Cláudia)
(
  'MT-5103056-E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6',
  'topo_morro', 30.4,
  ST_Multi(ST_GeomFromText(
    'POLYGON((-55.558 -11.835, -55.553 -11.835, -55.553 -11.840, -55.558 -11.840, -55.558 -11.835))',
  4674))
);


-- ===========================================================================
-- HIDROGRAFIA (4 feições)
-- MultiLineString representando trechos de rios, córregos e nascente
-- na região de Sinop/MT. Fluxo geral: norte → sul (lat decrescente).
-- ===========================================================================
INSERT INTO hidrografia (nome, tipo, geom) VALUES

-- Rio Teles Pires — trecho leste (atravessa imóveis 1-3, referência principal)
(
  'Rio Teles Pires (trecho)', 'rio',
  ST_Multi(ST_GeomFromText(
    'LINESTRING(-55.520 -11.860, -55.512 -11.870, -55.500 -11.875, -55.484 -11.880, -55.460 -11.884)',
  4674))
),

-- Córrego do Canivete — afluente pela margem direita do Teles Pires
-- atravessa imóveis 9 e 10 (Vera), origem norte, desemboca ~lat -11.882
(
  'Córrego do Canivete', 'corrego',
  ST_Multi(ST_GeomFromText(
    'LINESTRING(-55.600 -11.800, -55.597 -11.815, -55.594 -11.828, -55.592 -11.840, -55.590 -11.855, -55.588 -11.870, -55.585 -11.882)',
  4674))
),

-- Córrego da Onça — drena imóveis 4 e 8 (Sorriso), segue rumo sul
-- margem coincide com APP 1 (Fazenda Boa Esperança) e APP 3 (Fazenda Primavera)
(
  'Córrego da Onça', 'corrego',
  ST_Multi(ST_GeomFromText(
    'LINESTRING(-55.682 -11.800, -55.681 -11.815, -55.681 -11.830, -55.680 -11.845, -55.680 -11.855)',
  4674))
),

-- Nascente do Cerrado — cabeceira de drenagem dentro da Fazenda São Lucas
-- representa o ponto de surgência de água (APP 4)
(
  'Nascente do Cerrado', 'nascente',
  ST_Multi(ST_GeomFromText(
    'LINESTRING(-55.692 -11.808, -55.691 -11.809, -55.690 -11.811)',
  4674))
);
