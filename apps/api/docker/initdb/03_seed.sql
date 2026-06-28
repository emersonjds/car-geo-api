-- ---------------------------------------------------------------------------
-- Dados de exemplo (sintéticos) — região de Sinop/MT, apenas para desenvolvimento.
-- Coordenadas em lon/lat (SIRGAS 2000 ~ WGS84 para fins didáticos).
-- ---------------------------------------------------------------------------

INSERT INTO imovel (cod_car, nome, municipio, uf, area_ha, modulos_fisc, situacao, geom) VALUES
(
  'MT-5107909-A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6', 'Fazenda Boa Esperança', 'Sinop', 'MT', 412.5, 4.58, 'ativo',
  ST_Multi(ST_GeomFromText('POLYGON((-55.520 -11.860, -55.500 -11.860, -55.500 -11.878, -55.520 -11.878, -55.520 -11.860))', 4674))
),
(
  'MT-5107909-B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7', 'Sítio Três Irmãos', 'Sinop', 'MT', 88.2, 0.98, 'pendente',
  ST_Multi(ST_GeomFromText('POLYGON((-55.498 -11.862, -55.486 -11.862, -55.486 -11.872, -55.498 -11.872, -55.498 -11.862))', 4674))
),
(
  'MT-5107909-C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8', 'Fazenda Rio Verde', 'Sinop', 'MT', 1240.0, 13.78, 'em_analise',
  ST_Multi(ST_GeomFromText('POLYGON((-55.484 -11.855, -55.455 -11.855, -55.455 -11.885, -55.484 -11.885, -55.484 -11.855))', 4674))
);

-- APP: faixa de margem do rio dentro da Fazenda Boa Esperança
INSERT INTO app (cod_car, tipo, area_ha, geom) VALUES
(
  'MT-5107909-A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6', 'margem_rio', 6.4,
  ST_Multi(ST_GeomFromText('POLYGON((-55.516 -11.862, -55.514 -11.862, -55.508 -11.876, -55.510 -11.876, -55.516 -11.862))', 4674))
),
(
  'MT-5107909-C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8', 'nascente', 1.1,
  ST_Multi(ST_GeomFromText('POLYGON((-55.470 -11.866, -55.468 -11.866, -55.468 -11.868, -55.470 -11.868, -55.470 -11.866))', 4674))
);

-- Hidrografia de referência: um rio cruzando a área
INSERT INTO hidrografia (nome, tipo, geom) VALUES
(
  'Rio Teles Pires (trecho)', 'rio',
  ST_Multi(ST_GeomFromText('LINESTRING(-55.520 -11.860, -55.512 -11.870, -55.500 -11.875, -55.484 -11.880, -55.460 -11.884)', 4674))
);
