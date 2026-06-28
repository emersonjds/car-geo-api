import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapGL, type StyleSpecification, type GeoJSONSource } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  API_BASE_URL,
  fetchItems,
  generateKey,
  listCollections,
  testItems,
  type Collection,
  type GeoJSONFeature,
  type GeneratedKey,
  type TestResult,
} from './api';

// ponytail: checked once at module load — client-only Vite bundle
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Stats ----

interface Stats {
  count: number;
  totalHa: number;
  municipalities: number;
}

function computeStats(features: GeoJSONFeature[]): Stats {
  const munis = new Set<string>();
  let totalHa = 0;
  for (const f of features) {
    if (f.properties.municipio) munis.add(String(f.properties.municipio));
    if (typeof f.properties.area_ha === 'number') totalHa += f.properties.area_ha;
  }
  return { count: features.length, totalHa, municipalities: munis.size };
}

// ---- Basemap styles ----

function makeSatStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      sat: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye',
      },
    },
    layers: [{ id: 'sat-bg', type: 'raster', source: 'sat' }],
  };
}

function makeOsmStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
      },
    },
    layers: [{ id: 'osm-bg', type: 'raster', source: 'osm' }],
  };
}

// ---- GeoJSON helpers ----

function getCoords(geometry: { type: string; coordinates: unknown }): number[][] {
  const out: number[][] = [];
  function walk(v: unknown): void {
    if (!Array.isArray(v)) return;
    if (typeof v[0] === 'number') { out.push(v as number[]); } else { (v as unknown[]).forEach(walk); }
  }
  walk(geometry.coordinates);
  return out;
}

function featureBbox(feat: GeoJSONFeature): [number, number, number, number] | null {
  const pts = getCoords(feat.geometry);
  if (!pts.length) return null;
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

function collectionBbox(feats: GeoJSONFeature[]): [number, number, number, number] | null {
  const boxes = feats.map(featureBbox).filter((b): b is [number, number, number, number] => b !== null);
  if (!boxes.length) return null;
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

// ---- Add GeoJSON layer with fade-in ----

function addGeoJSONLayer(map: MapGL, features: GeoJSONFeature[]): void {
  if (!features.length) return;
  const data = { type: 'FeatureCollection' as const, features } as unknown as GeoJSON.FeatureCollection;
  if (map.getSource('parcels')) {
    (map.getSource('parcels') as GeoJSONSource).setData(data);
    return;
  }
  map.addSource('parcels', { type: 'geojson', data });
  map.addLayer({
    id: 'parcels-fill',
    type: 'fill',
    source: 'parcels',
    paint: {
      'fill-color': '#22c55e',
      'fill-opacity': 0,
      'fill-opacity-transition': { duration: 900, delay: 0 },
    },
  });
  map.addLayer({
    id: 'parcels-outline',
    type: 'line',
    source: 'parcels',
    paint: { 'line-color': '#86efac', 'line-width': 1.8 },
  });
  setTimeout(() => {
    if (map.getLayer('parcels-fill')) map.setPaintProperty('parcels-fill', 'fill-opacity', 0.38);
  }, 80);
  const bbox = collectionBbox(features);
  if (bbox) map.fitBounds(bbox, { padding: 60, duration: 1800, maxZoom: 14 });
}

// ---- Faint hero overlay layer ----

function addHeroLayer(map: MapGL, features: GeoJSONFeature[]): void {
  if (!features.length) return;
  const data = { type: 'FeatureCollection' as const, features } as unknown as GeoJSON.FeatureCollection;
  if (map.getSource('hero-parcels')) {
    (map.getSource('hero-parcels') as GeoJSONSource).setData(data);
    return;
  }
  map.addSource('hero-parcels', { type: 'geojson', data });
  map.addLayer({
    id: 'hero-fill',
    type: 'fill',
    source: 'hero-parcels',
    paint: {
      'fill-color': '#22c55e',
      'fill-opacity': 0,
      'fill-opacity-transition': { duration: 1400, delay: 0 },
    },
  });
  map.addLayer({
    id: 'hero-outline',
    type: 'line',
    source: 'hero-parcels',
    paint: {
      'line-color': '#4ade80',
      'line-width': 1.5,
      'line-opacity': 0,
      'line-opacity-transition': { duration: 1400, delay: 0 },
    },
  });
  setTimeout(() => {
    if (map.getLayer('hero-fill')) map.setPaintProperty('hero-fill', 'fill-opacity', 0.1);
    if (map.getLayer('hero-outline')) map.setPaintProperty('hero-outline', 'line-opacity', 0.35);
  }, 200);
}

// =====================================================================
// App
// =====================================================================

export function App() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [mapFeatures, setMapFeatures] = useState<GeoJSONFeature[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);

  const stats = useMemo(() => computeStats(mapFeatures), [mapFeatures]);

  useEffect(() => {
    listCollections()
      .then(setCollections)
      .catch((e: Error) => setCollectionsError(e.message));
  }, []);

  useEffect(() => {
    fetchItems('imovel')
      .then((d) => setMapFeatures(d.features))
      .catch((e: Error) => setMapError(e.message))
      .finally(() => setMapLoading(false));
  }, []);

  // Global scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible');
        }),
      { threshold: 0.1 },
    );
    document.querySelectorAll('[data-reveal]').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div>
      <TopBar />
      <HeroSection features={mapFeatures} stats={stats} />
      <StatsBar stats={stats} loading={mapLoading} />
      <ProducerSection />
      <MapSection features={mapFeatures} loading={mapLoading} error={mapError} />
      <InteropSection />
      <DevPortalSection collections={collections} collectionsError={collectionsError} />
      <Footer />
    </div>
  );
}

// ---- TopBar ----

function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="topbar" role="banner">
      <a href="#inicio" className="brand" aria-label="CAR Geo API — início">
        <div className="brand-leaf" aria-hidden="true">C</div>
        <div className="brand-text">
          <strong>CAR Geo API</strong>
          <span>Dados Geoespaciais Abertos</span>
        </div>
      </a>
      <nav
        id="topnav"
        className={`topnav${menuOpen ? ' open' : ''}`}
        aria-label="Navegação principal"
      >
        <a href="#mapa" onClick={() => setMenuOpen(false)}>Ver mapa</a>
        <a href="#dev" onClick={() => setMenuOpen(false)}>Gerar chave</a>
        <a href="#docs" onClick={() => setMenuOpen(false)}>Documentação</a>
        <a
          href={`${API_BASE_URL}/docs`}
          target="_blank"
          rel="noreferrer"
          className="ext"
          onClick={() => setMenuOpen(false)}
        >
          Swagger ↗
        </a>
      </nav>
      <button
        className={`topbar-menu-btn${menuOpen ? ' open' : ''}`}
        onClick={() => setMenuOpen((m) => !m)}
        aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={menuOpen}
        aria-controls="topnav"
      >
        <span className="hamburger-bar" />
        <span className="hamburger-bar" />
        <span className="hamburger-bar" />
      </button>
    </header>
  );
}

// ---- Hero ----

function HeroSection({ features, stats }: { features: GeoJSONFeature[]; stats: Stats }) {
  return (
    <section id="inicio" className="hero" aria-label="Apresentação">
      <div className="hero-bg" aria-hidden="true">
        <HeroMap features={features} />
      </div>
      <div className="hero-overlay" aria-hidden="true" />
      <div className="hero-content container">
        <div className="hero-badge" aria-label="Status">API pública · OGC Features</div>
        <h1>
          Meça sua propriedade sobre os{' '}
          <em>mapas oficiais</em>.{' '}
          De graça.
        </h1>
        <p className="hero-sub">
          CAR Geo API entrega polígonos do Cadastro Ambiental Rural em REST&nbsp;+&nbsp;GeoJSON,
          prontos para sobrepor medições de campo e conferir metragem com o cadastro oficial.
          Sem chave para leitura.
        </p>
        <div className="hero-ctas">
          <a href="#mapa" className="btn btn-primary">Ver imóveis no mapa</a>
          <a href="#dev" className="btn btn-ghost">Gerar chave de API</a>
        </div>
        {features.length > 0 && (
          <div className="hero-live-stats" aria-label="Estatísticas ao vivo">
            <span className="live-dot" aria-hidden="true" />
            <span>{features.length} imóveis</span>
            {stats.municipalities > 0 && (
              <>
                <span aria-hidden="true" className="hero-live-sep">·</span>
                <span>{stats.municipalities} municípios</span>
              </>
            )}
            {stats.totalHa > 0 && (
              <>
                <span aria-hidden="true" className="hero-live-sep">·</span>
                <span>{Math.round(stats.totalHa).toLocaleString('pt-BR')} ha</span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="hero-scroll-hint" aria-hidden="true">scroll</div>
    </section>
  );
}

function HeroMap({ features }: { features: GeoJSONFeature[] }) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapGL | null>(null);
  const featRef = useRef(features);
  featRef.current = features;

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    let alive = true;
    const map = new MapGL({
      container: el,
      style: makeSatStyle(),
      center: [-52, -12],
      zoom: 5,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      if (featRef.current.length) addHeroLayer(map, featRef.current);
      if (!prefersReducedMotion) {
        function spin() {
          if (!alive) return;
          map.easeTo({ bearing: map.getBearing() + 28, duration: 14000, easing: (t) => t });
        }
        map.on('moveend', spin);
        spin();
      }
    });

    return () => {
      alive = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !features.length) return;
    addHeroLayer(map, features);
  }, [features]);

  return <div ref={divRef} style={{ width: '100%', height: '100%' }} />;
}

// ---- Stats bar ----

function StatsBar({ stats, loading }: { stats: Stats; loading: boolean }) {
  return (
    <div className="stats-bar" role="region" aria-label="Estatísticas dos dados">
      <div className="container">
        <div className="stats-grid">
          <StatItem value={stats.count} label="Imóveis cadastrados" loading={loading} />
          <div className="stats-divider" aria-hidden="true" />
          <StatItem
            value={Math.round(stats.totalHa)}
            label="Hectares mapeados"
            suffix=" ha"
            loading={loading}
          />
          <div className="stats-divider" aria-hidden="true" />
          <StatItem value={stats.municipalities} label="Municípios" loading={loading} />
        </div>
      </div>
    </div>
  );
}

function StatItem({
  value,
  label,
  suffix = '',
  loading,
}: {
  value: number;
  label: string;
  suffix?: string;
  loading: boolean;
}) {
  const [displayed, setDisplayed] = useState(prefersReducedMotion ? value : 0);
  const spanRef = useRef<HTMLSpanElement>(null);
  const targetRef = useRef(value);
  targetRef.current = value;

  useEffect(() => {
    if (prefersReducedMotion) { setDisplayed(value); return; }
    if (!value) return;
    const el = spanRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        const start = performance.now();
        const dur = 1800;
        function tick(now: number) {
          const t = Math.min((now - start) / dur, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          setDisplayed(Math.round(eased * targetRef.current));
          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [value]);

  return (
    <div className="stat-item" data-reveal>
      <span
        ref={spanRef}
        className={`stat-value${loading && !value ? ' stat-loading' : ''}`}
        aria-live="polite"
      >
        {loading && !value ? '—' : `${displayed.toLocaleString('pt-BR')}${suffix}`}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

// ---- Producer ----

const PRODUCER_CARDS = [
  {
    icon: '📍',
    title: 'Mede no campo, pelo celular',
    text: 'Marque os limites da sua propriedade diretamente no campo, sem equipamento especial ou técnico no local.',
  },
  {
    icon: '🗺️',
    title: 'Confere com o cadastro oficial',
    text: 'Sobreponha sua medição aos polígonos do CAR e veja exatamente onde as metragens batem — ou diferem.',
  },
  {
    icon: '🆓',
    title: 'Sem custo, sem limite',
    text: 'Acesso livre aos dados públicos do Cadastro Ambiental Rural. Sem assinatura, sem taxa, sem teto de requisições.',
  },
  {
    icon: '📄',
    title: 'Documento inicial de regularização',
    text: 'O CAR é o primeiro passo da regularização ambiental. Use a API para integrar, validar e gerar relatórios.',
  },
] as const;

function ProducerSection() {
  return (
    <section className="producer">
      <div className="container">
        <div className="producer-header" data-reveal>
          <p className="section-label">CAR Campo</p>
          <h2 className="section-title">Para o produtor rural</h2>
          <p className="section-sub">
            Da medição no campo à conferência com o mapa oficial, tudo em um fluxo simples e gratuito.
          </p>
        </div>
        <div className="producer-grid">
          {PRODUCER_CARDS.map((card, i) => (
            <div
              key={card.title}
              className="producer-card"
              data-reveal
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <span className="producer-card-icon" aria-hidden="true">{card.icon}</span>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Interop section ----

const INTEROP_CARDS = [
  {
    icon: '🌐',
    title: 'Tudo padronizado em GeoJSON',
    text: 'Os dados do CAR — antes em shapefile, GML e WFS legados — saem aqui num único formato aberto: GeoJSON (RFC 7946), em WGS84. O mesmo shape para toda coleção.',
  },
  {
    icon: '🔌',
    title: 'Conecta com qualquer base',
    text: 'GeoJSON entra direto em PostGIS, BigQuery, MongoDB, Elasticsearch e data lakes. Faça join dos imóveis com seus próprios dados (produção, crédito, logística) pela geometria.',
  },
  {
    icon: '🧰',
    title: 'Pronto para suas ferramentas',
    text: 'Abre no QGIS, Leaflet, MapLibre, deck.gl, geopandas/Python ou um fetch() no navegador. Sem driver proprietário, sem conversão — é só consumir a URL.',
  },
  {
    icon: '📐',
    title: 'Contrato OGC previsível',
    text: 'OGC API Features com bbox, paginação e links HATEOAS. Outras plataformas integram sem adivinhar o formato: o mesmo padrão que o resto do mundo geoespacial já fala.',
  },
] as const;

function InteropSection() {
  return (
    <section className="producer" id="interop">
      <div className="container">
        <div className="producer-header" data-reveal>
          <p className="section-label">Interoperabilidade</p>
          <h2 className="section-title">Um padrão, infinitas conexões</h2>
          <p className="section-sub">
            A API normaliza os dados do CAR em GeoJSON aberto — pronto para plugar em outras bases de
            dados, ferramentas de GIS e pipelines, sem conversão.
          </p>
        </div>
        <div className="producer-grid">
          {INTEROP_CARDS.map((card, i) => (
            <div
              key={card.title}
              className="producer-card"
              data-reveal
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <span className="producer-card-icon" aria-hidden="true">{card.icon}</span>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Map section ----

function MapSection({
  features,
  loading,
  error,
}: {
  features: GeoJSONFeature[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <section id="mapa" className="map-section" aria-label="Mapa interativo de imóveis rurais">
      <div className="container">
        <div className="map-section-header" data-reveal>
          <p className="section-label">
            <span className="live-dot" aria-hidden="true" />
            Ao vivo
          </p>
          <h2 className="section-title">Veja os imóveis rurais no mapa</h2>
          <p className="section-sub">
            Arraste o divisor para comparar satélite e mapa oficial.
            Clique em um imóvel para ver área e município.
          </p>
        </div>
      </div>
      <MapSwipeWidget features={features} loading={loading} error={error} />
    </section>
  );
}

// ---- Split-screen swipe map ----

function MapSwipeWidget({
  features,
  loading,
  error,
}: {
  features: GeoJSONFeature[];
  loading: boolean;
  error: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmInnerRef = useRef<HTMLDivElement>(null);
  const satInnerRef = useRef<HTMLDivElement>(null);
  const osmMapRef = useRef<MapGL | null>(null);
  const satMapRef = useRef<MapGL | null>(null);
  const flyRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncLock = useRef(false);
  const featRef = useRef(features);
  const isDragging = useRef(false);

  const [dividerPct, setDividerPct] = useState(50);
  const [mapReady, setMapReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activeProps, setActiveProps] = useState<Record<string, unknown> | null>(null);

  featRef.current = features;

  function startFlyThrough(): void {
    if (flyRef.current) clearInterval(flyRef.current);
    let idx = 0;
    flyRef.current = setInterval(() => {
      const map = osmMapRef.current;
      const feats = featRef.current;
      if (!map || !feats.length) return;
      const bbox = featureBbox(feats[idx % feats.length]);
      if (bbox) map.fitBounds(bbox, { padding: 80, duration: 2200, maxZoom: 15 });
      idx++;
    }, 6500);
  }

  // Lazy init on intersection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();

        const osmEl = osmInnerRef.current;
        const satEl = satInnerRef.current;
        if (!osmEl || !satEl) return;

        const center: [number, number] = [-52, -14];
        const zoom = 4;

        const osmMap = new MapGL({
          container: osmEl,
          style: makeOsmStyle(),
          center,
          zoom,
          attributionControl: { compact: true },
        });
        osmMapRef.current = osmMap;

        const satMap = new MapGL({
          container: satEl,
          style: makeSatStyle(),
          center,
          zoom,
          interactive: false,
          attributionControl: false,
        });
        satMapRef.current = satMap;

        // Mirror satellite to OSM viewport
        osmMap.on('move', () => {
          if (syncLock.current) return;
          syncLock.current = true;
          satMap.jumpTo({
            center: osmMap.getCenter(),
            zoom: osmMap.getZoom(),
            bearing: osmMap.getBearing(),
            pitch: osmMap.getPitch(),
          });
          syncLock.current = false;
        });

        let osmReady = false;
        let satReady = false;
        function onBothReady() {
          setMapReady(true);
          if (featRef.current.length) {
            addGeoJSONLayer(osmMap, featRef.current);
            addGeoJSONLayer(satMap, featRef.current);
          }
          if (!prefersReducedMotion) startFlyThrough();
        }
        osmMap.on('load', () => { osmReady = true; if (satReady) onBothReady(); });
        satMap.on('load', () => { satReady = true; if (osmReady) onBothReady(); });

        osmMap.on('click', 'parcels-fill', (e) => {
          if (!e.features?.[0]) return;
          if (flyRef.current) { clearInterval(flyRef.current); flyRef.current = null; }
          setActiveProps(e.features[0].properties as Record<string, unknown>);
        });
        osmMap.on('mouseenter', 'parcels-fill', () => { osmMap.getCanvas().style.cursor = 'pointer'; });
        osmMap.on('mouseleave', 'parcels-fill', () => { osmMap.getCanvas().style.cursor = ''; });
      },
      { threshold: 0.1 },
    );
    obs.observe(container);

    return () => {
      obs.disconnect();
      if (flyRef.current) clearInterval(flyRef.current);
      osmMapRef.current?.remove();
      satMapRef.current?.remove();
      osmMapRef.current = null;
      satMapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push features to both maps if they arrive after init
  useEffect(() => {
    const osm = osmMapRef.current;
    const sat = satMapRef.current;
    if (!osm?.isStyleLoaded() || !sat?.isStyleLoaded() || !features.length) return;
    addGeoJSONLayer(osm, features);
    addGeoJSONLayer(sat, features);
    if (!flyRef.current && !prefersReducedMotion) startFlyThrough();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isDragging.current = true;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.min(95, Math.max(5, ((e.clientX - rect.left) / rect.width) * 100));
    setDividerPct(pct);
  }

  function onPointerUp() {
    isDragging.current = false;
    setDragging(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') setDividerPct((p) => Math.max(5, p - 2));
    if (e.key === 'ArrowRight') setDividerPct((p) => Math.min(95, p + 2));
  }

  return (
    <div ref={containerRef} className="swipe-container" role="region" aria-label="Mapa comparativo satélite / oficial">
      {/* OSM — interactive base */}
      <div ref={osmInnerRef} className="swipe-layer swipe-layer-base" />

      {/* Satellite — clipped overlay, non-interactive */}
      <div
        className="swipe-layer swipe-layer-top"
        style={{ clipPath: `inset(0 ${100 - dividerPct}% 0 0)` }}
        aria-hidden="true"
      >
        <div ref={satInnerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Basemap labels */}
      {mapReady && (
        <>
          <div
            className="swipe-label swipe-label-left"
            style={{ opacity: dividerPct > 12 ? 1 : 0 }}
            aria-hidden="true"
          >
            Satélite
          </div>
          <div
            className="swipe-label swipe-label-right"
            style={{ opacity: dividerPct < 88 ? 1 : 0 }}
            aria-hidden="true"
          >
            Oficial
          </div>
        </>
      )}

      {/* Drag handle */}
      {mapReady && (
        <div
          className={`swipe-handle${dragging ? ' dragging' : ''}`}
          style={{ left: `${dividerPct}%` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          role="slider"
          aria-label="Divisor satélite / oficial"
          aria-valuenow={Math.round(dividerPct)}
          aria-valuemin={5}
          aria-valuemax={95}
          tabIndex={0}
        >
          <div className="swipe-line" aria-hidden="true" />
          <div className="swipe-knob" aria-hidden="true">
            {/* ponytail: inline SVG — single use, no import needed */}
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path d="M7 11H2M2 11L5 8M2 11L5 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 11H20M20 11L17 8M20 11L17 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {!mapReady && (
        <div className="map-skeleton" aria-live="polite">
          <div className="map-skeleton-spinner" aria-hidden="true" />
          <p>{loading ? 'Carregando dados do CAR…' : 'Iniciando mapa…'}</p>
        </div>
      )}

      {/* Error */}
      {error && mapReady && (
        <div className="map-notice" role="alert">
          API offline — polígonos indisponíveis. Basemaps ativos.
        </div>
      )}

      {/* Empty */}
      {mapReady && !loading && !error && features.length === 0 && (
        <div className="map-notice map-notice-info" role="status">
          Nenhum imóvel encontrado na coleção.
        </div>
      )}

      {/* Feature info panel */}
      {activeProps && (
        <div className="map-info-panel" role="complementary" aria-label="Informações do imóvel">
          {activeProps.area_ha != null && (
            <>
              <span className="map-info-label">Área</span>
              <span className="map-info-area">{Number(activeProps.area_ha).toFixed(2)} ha</span>
            </>
          )}
          {Boolean(activeProps.municipio) && (
            <span className="map-info-mun">{String(activeProps.municipio)}</span>
          )}
          <button
            className="map-info-close"
            onClick={() => setActiveProps(null)}
            aria-label="Fechar painel de informações"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Dev portal ----

function DevPortalSection({
  collections,
  collectionsError,
}: {
  collections: Collection[];
  collectionsError: string | null;
}) {
  return (
    <section id="dev" className="dev-portal">
      <div className="container">
        <div className="dev-portal-header" data-reveal>
          <p className="section-label">Portal do desenvolvedor</p>
          <h2 className="section-title">Construa em cima</h2>
          <p className="section-sub">
            API RESTful padrão OGC, GeoJSON nativo. Leitura pública sem chave.
            Chave gratuita para rastreamento de uso e endpoints futuros.
          </p>
        </div>
        <KeySection collections={collections} />
        {collectionsError && (
          <p className="error-msg" style={{ marginBottom: 12 }}>
            ⚠ Não foi possível listar coleções: {collectionsError}
          </p>
        )}
        <DocsSection />
      </div>
    </section>
  );
}

// ---- Key section ----

function KeySection({ collections }: { collections: Collection[] }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedKey | null>(null);
  const [copied, setCopied] = useState(false);

  async function onGenerate() {
    setLoading(true);
    setError(null);
    try {
      setResult(await generateKey({ name: name || undefined, email: email || undefined }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    if (!result) return;
    navigator.clipboard.writeText(result.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="dev-card" data-reveal>
      <div className="dev-card-title">
        <span className="dev-card-title-num" aria-hidden="true">1</span>
        Gere sua chave de API
      </div>
      <p className="dev-card-sub">Grátis e instantâneo. A chave aparece uma única vez — guarde-a.</p>

      {!result ? (
        <div className="key-form">
          <label>
            Nome / equipe <span style={{ fontWeight: 400 }}>(opcional)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Equipe Panic Lobster"
              autoComplete="name"
            />
          </label>
          <label>
            E-mail <span style={{ fontWeight: 400 }}>(opcional)</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="time@exemplo.org"
              type="email"
              autoComplete="email"
            />
          </label>
          <button
            className="btn btn-primary"
            onClick={onGenerate}
            disabled={loading}
            style={{ justifyContent: 'center' }}
          >
            {loading ? 'Gerando…' : 'Gerar chave'}
          </button>
          {error && <p className="error-msg">⚠ {error}</p>}
        </div>
      ) : (
        <div className="key-result">
          <div className="key-value-box">
            <code>{result.key}</code>
            <button className="btn-copy" onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar'}</button>
          </div>
          <p className="key-warn">⚠ {result.aviso ?? 'Guarde esta chave: ela não será exibida novamente.'}</p>
          <Quickstart apiKey={result.key} collections={collections} />
          <Console apiKey={result.key} collections={collections} />
        </div>
      )}
    </div>
  );
}

// ---- Quickstart ----

function Quickstart({ apiKey, collections }: { apiKey: string; collections: Collection[] }) {
  const col = collections[0]?.id ?? 'imovel';
  const snippet = useMemo(
    () =>
      [
        `# Leitura pública — sem chave necessária`,
        `curl '${API_BASE_URL}/collections/${col}/items?limit=10'`,
        ``,
        `# Filtro espacial por bounding box (minLon,minLat,maxLon,maxLat)`,
        `curl '${API_BASE_URL}/collections/${col}/items?bbox=-55.6,-11.9,-55.4,-11.8'`,
        ``,
        `# Com chave de API (rastreamento de uso)`,
        `curl '${API_BASE_URL}/collections/${col}/items' \\`,
        `  -H 'X-API-Key: ${apiKey}'`,
      ].join('\n'),
    [apiKey, col],
  );

  return (
    <div className="snippet">
      <p className="snippet-label">Comece em 1 minuto</p>
      <pre>
        <code>{snippet}</code>
      </pre>
    </div>
  );
}

// ---- Console ----

function Console({ apiKey, collections }: { apiKey: string; collections: Collection[] }) {
  const [collectionId, setCollectionId] = useState('imovel');
  const [bbox, setBbox] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<TestResult | null>(null);

  useEffect(() => {
    if (collections[0]) setCollectionId(collections[0].id);
  }, [collections]);

  async function run() {
    setBusy(true);
    try {
      setRes(await testItems(collectionId, apiKey, bbox || undefined));
    } catch (e) {
      setRes({ status: 0, ok: false, error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="dev-card console-wrap"
      style={{ marginLeft: 0, marginTop: 20, padding: 0, background: 'transparent', border: 'none' }}
    >
      <div className="dev-card-title" style={{ marginBottom: 12 }}>
        <span className="dev-card-title-num" aria-hidden="true">3</span>
        Console de teste{' '}
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>(chave já aplicada)</span>
      </div>
      <div className="console-row">
        <select
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
          aria-label="Selecionar coleção"
        >
          {collections.length === 0 && <option value="imovel">imovel</option>}
          {collections.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <input
          value={bbox}
          onChange={(e) => setBbox(e.target.value)}
          placeholder="bbox opcional: -55.6,-11.9,-55.4,-11.8"
          aria-label="Bounding box opcional"
        />
        <button
          className="btn btn-primary"
          onClick={run}
          disabled={busy}
          style={{ whiteSpace: 'nowrap' }}
        >
          {busy ? '…' : 'GET items'}
        </button>
      </div>
      {res && (
        <div className={`console-out ${res.ok ? 'ok' : 'fail'}`} role="status">
          <div>
            <strong>HTTP {res.status}</strong>{' '}
            {res.ok
              ? `· ${res.numberReturned ?? 0} / ${res.numberMatched ?? '?'} feições`
              : `· ${res.error ?? 'Erro desconhecido'}`}
          </div>
          {res.sample != null && (
            <pre>{JSON.stringify(res.sample, null, 2).slice(0, 900)}…</pre>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Docs ----

function DocsSection() {
  return (
    <div id="docs" className="dev-card" data-reveal style={{ marginTop: 0 }}>
      <div className="dev-card-title">
        <span className="dev-card-title-num" aria-hidden="true">2</span>
        Documentação interativa (Swagger)
      </div>
      <p className="dev-card-sub">
        Especificação OpenAPI 3 completa. Use <em>Authorize</em> para testar com sua chave.{' '}
        <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">
          Abrir em nova aba ↗
        </a>
      </p>
      <iframe
        className="swagger-iframe"
        src={`${API_BASE_URL}/docs`}
        title="Swagger UI — CAR Geo API"
      />
    </div>
  );
}

// ---- Footer ----

function Footer() {
  return (
    <footer className="footer">
      <p>CAR Geo API · haCARthon · Desafio 2 · Solução 7 · Bem Público Digital</p>
      <p>
        API: <code>{API_BASE_URL}</code> ·{' '}
        <a href={`${API_BASE_URL}/openapi.json`} target="_blank" rel="noreferrer">OpenAPI JSON</a> ·{' '}
        <a href="https://openstreetmap.org" target="_blank" rel="noreferrer">© OpenStreetMap</a> ·{' '}
        Esri World Imagery
      </p>
    </footer>
  );
}
