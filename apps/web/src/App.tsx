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

const ESRI_SAT =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// =====================================================================
// Stats + GeoJSON helpers
// =====================================================================

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

function makeSatStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      sat: {
        type: 'raster',
        tiles: [ESRI_SAT],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri — World Imagery',
      },
    },
    layers: [{ id: 'sat-bg', type: 'raster', source: 'sat' }],
  };
}

// Basemap único com satélite + OSM; alterna por visibilidade (sem recriar estilo).
function makeBaseStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [OSM],
        tileSize: 256,
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
      sat: {
        type: 'raster',
        tiles: [ESRI_SAT],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri — World Imagery',
      },
    },
    layers: [
      { id: 'osm-bg', type: 'raster', source: 'osm' },
      { id: 'sat-bg', type: 'raster', source: 'sat', layout: { visibility: 'none' } },
    ],
  };
}

function getCoords(geometry: { type: string; coordinates: unknown }): number[][] {
  const out: number[][] = [];
  function walk(v: unknown): void {
    if (!Array.isArray(v)) return;
    if (typeof v[0] === 'number') out.push(v as number[]);
    else (v as unknown[]).forEach(walk);
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

// Adiciona (ou atualiza) as feições como fill + outline. `prefix` evita colisão
// entre o mapa do hero e o mapa principal.
function addParcels(
  map: MapGL,
  features: GeoJSONFeature[],
  prefix: string,
  opts: { fillOpacity: number; lineColor: string },
): void {
  if (!features.length) return;
  const data = { type: 'FeatureCollection' as const, features } as unknown as GeoJSON.FeatureCollection;
  const srcId = `${prefix}-src`;
  if (map.getSource(srcId)) {
    (map.getSource(srcId) as GeoJSONSource).setData(data);
    return;
  }
  map.addSource(srcId, { type: 'geojson', data });
  map.addLayer({
    id: `${prefix}-fill`,
    type: 'fill',
    source: srcId,
    paint: {
      'fill-color': '#1b6b46',
      'fill-opacity': 0,
      'fill-opacity-transition': { duration: 900, delay: 0 },
    },
  });
  map.addLayer({
    id: `${prefix}-outline`,
    type: 'line',
    source: srcId,
    paint: { 'line-color': opts.lineColor, 'line-width': 1.8 },
  });
  setTimeout(() => {
    if (map.getLayer(`${prefix}-fill`)) {
      map.setPaintProperty(`${prefix}-fill`, 'fill-opacity', opts.fillOpacity);
    }
  }, 80);
}

// =====================================================================
// Material Symbol
// =====================================================================

function Sym({
  name,
  className = '',
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span className={`material-symbols-outlined${filled ? ' filled' : ''} ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

// =====================================================================
// App
// =====================================================================

export function App() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [features, setFeatures] = useState<GeoJSONFeature[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);

  const stats = useMemo(() => computeStats(features), [features]);

  useEffect(() => {
    listCollections()
      .then(setCollections)
      .catch((e: Error) => setCollectionsError(e.message));
  }, []);

  useEffect(() => {
    fetchItems('imovel')
      .then((d) => setFeatures(d.features))
      .catch((e: Error) => setMapError(e.message))
      .finally(() => setMapLoading(false));
  }, []);

  // Reveal por seção
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible');
        }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    document.querySelectorAll('[data-reveal]').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="overflow-x-hidden">
      <TopBar />
      <main>
        <HeroSection features={features} stats={stats} />
        <MapSection features={features} loading={mapLoading} error={mapError} />
        <ApiSection />
        <ReportSection />
        <DevPortalSection collections={collections} collectionsError={collectionsError} />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}

// =====================================================================
// TopAppBar
// =====================================================================

const NAV = [
  { label: 'Início', href: '#inicio' },
  { label: 'Mapa', href: '#mapa' },
  { label: 'API', href: '#api' },
] as const;

function TopBar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 h-20 w-full border-b border-outline-variant bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6 md:px-12">
        <a href="#inicio" className="group flex items-center gap-3" aria-label="CAR Geo — início">
          <Sym name="eco" filled className="text-3xl text-primary transition-transform group-hover:scale-110" />
          <span className="font-headline-md text-2xl font-bold tracking-tight text-primary">CAR Geo</span>
        </a>

        <nav className="hidden items-center gap-10 md:flex" aria-label="Navegação principal">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="font-medium text-on-surface-variant transition-colors hover:text-primary"
            >
              {n.label}
            </a>
          ))}
          <a
            href={`${API_BASE_URL}/consulta`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-on-surface-variant transition-colors hover:text-primary"
          >
            Consultar
          </a>
        </nav>

        <div className="flex items-center gap-4">
          <a
            href="#dev"
            className="hidden rounded-xl bg-primary px-6 py-2.5 font-bold text-on-primary transition-all hover:bg-primary-container lg:block"
          >
            Portal do desenvolvedor
          </a>
          <button
            className="p-2 text-on-surface-variant md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            <Sym name={open ? 'close' : 'menu'} />
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          className="flex flex-col gap-1 border-t border-outline-variant bg-surface px-6 py-4 md:hidden"
          aria-label="Navegação móvel"
        >
          {[...NAV, { label: 'Consultar', href: `${API_BASE_URL}/consulta` }, { label: 'Portal do desenvolvedor', href: '#dev' }].map(
            (n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 font-medium text-on-surface-variant hover:bg-surface-container hover:text-primary"
              >
                {n.label}
              </a>
            ),
          )}
        </nav>
      )}
    </header>
  );
}

// =====================================================================
// Hero
// =====================================================================

function HeroSection({ features, stats }: { features: GeoJSONFeature[]; stats: Stats }) {
  return (
    <section id="inicio" className="relative overflow-hidden py-20 md:py-28" data-reveal>
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 md:px-12 lg:grid-cols-2">
        <div className="z-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-primary">
            <Sym name="public" className="text-base" />
            <span className="font-label-sm text-xs font-bold uppercase tracking-widest">
              API pública · OGC Features
            </span>
          </div>
          <h1 className="mb-6 font-headline-lg text-headline-lg-mobile leading-[1.1] text-primary md:text-headline-lg">
            Um auxílio inicial para o pequeno produtor medir sua terra.
          </h1>
          <p className="mb-8 max-w-xl font-body-lg text-body-lg text-on-surface-variant">
            O app <strong className="text-primary">CAR Campo</strong> ajuda o produtor a desenhar o perímetro
            do imóvel caminhando com o celular e aponta sobreposições com camadas ambientais oficiais. A{' '}
            <strong className="text-primary">CAR Geo API</strong> serve esses dados do Cadastro Ambiental Rural
            em REST + GeoJSON — leitura pública, sem chave.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <a
              href="#mapa"
              className="rounded-xl bg-primary px-8 py-4 text-center font-bold text-on-primary shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              Ver imóveis no mapa
            </a>
            <a
              href="#dev"
              className="rounded-xl border-2 border-primary px-8 py-4 text-center font-bold text-primary transition-all hover:bg-primary/5"
            >
              Portal do desenvolvedor
            </a>
          </div>
          {features.length > 0 && (
            <div className="mt-8 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-outline-variant bg-surface-container-lowest px-5 py-2.5 text-sm font-semibold text-on-surface-variant shadow-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-secondary" />
              </span>
              <span className="text-primary">{features.length} imóveis</span>
              {stats.municipalities > 0 && (
                <>
                  <span aria-hidden="true" className="text-outline">·</span>
                  <span>{stats.municipalities} municípios</span>
                </>
              )}
              {stats.totalHa > 0 && (
                <>
                  <span aria-hidden="true" className="text-outline">·</span>
                  <span>{Math.round(stats.totalHa).toLocaleString('pt-BR')} ha</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="relative hidden lg:block">
          <div className="relative z-10 overflow-hidden rounded-3xl border-8 border-white shadow-2xl">
            <div className="aspect-[4/3] w-full bg-primary/5">
              <HeroMap features={features} />
            </div>
          </div>
          <div className="absolute -right-12 -top-12 -z-10 h-64 w-64 rounded-full bg-secondary-container/40 blur-3xl" />
          <div className="absolute -bottom-12 -left-12 -z-10 h-64 w-64 rounded-full bg-primary-fixed/50 blur-3xl" />
        </div>
      </div>
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
      zoom: 4.4,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      if (featRef.current.length) addParcels(map, featRef.current, 'hero', { fillOpacity: 0.2, lineColor: '#86efac' });
      if (!prefersReducedMotion) {
        const spin = () => {
          if (!alive) return;
          map.easeTo({ bearing: map.getBearing() + 26, duration: 16000, easing: (t) => t });
        };
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
    addParcels(map, features, 'hero', { fillOpacity: 0.2, lineColor: '#86efac' });
  }, [features]);

  return <div ref={divRef} className="h-full w-full" />;
}

// =====================================================================
// Map section — "Imóveis do CAR no mapa"
// =====================================================================

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
    <section id="mapa" className="bg-surface-container-low py-24" data-reveal>
      <div className="mx-auto max-w-7xl px-6 md:px-12">
        <div className="mb-14 flex flex-col items-center text-center">
          <span className="mb-4 rounded-full bg-secondary/10 px-4 py-1.5 font-label-sm uppercase tracking-widest text-secondary">
            Inteligência territorial
          </span>
          <h2 className="font-headline-md text-3xl text-primary md:text-4xl">Imóveis do CAR no mapa</h2>
          <p className="mt-4 max-w-2xl text-body-md text-on-surface-variant">
            Polígonos do Cadastro Ambiental Rural servidos em GeoJSON pela API pública. Alterne entre satélite
            e mapa de ruas; clique em um imóvel para ver área e município.
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <LiveMap features={features} loading={loading} error={error} />
          </div>

          <div className="flex flex-col gap-8 lg:col-span-4">
            <FeatureCard
              icon="straighten"
              title="Medição geodésica"
              text="Área e perímetro calculados a partir da divisa percorrida a pé com o GPS do celular — em hectares e metros, nunca em graus. Funciona offline."
            />
            <FeatureCard
              icon="warning"
              title="Alertas de sobreposição oficial"
              text="Cruza o imóvel com Terra Indígena (FUNAI), Unidade de Conservação (ICMBio), embargo do IBAMA, desmatamento (PRODES/INPE) e APP, a partir de camadas oficiais."
            />
            <div className="flex items-center gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4">
              <Sym name="info" className="text-primary" />
              <span className="text-xs font-semibold uppercase text-primary/80">
                Dados de exemplo · GeoJSON em WGS84 (RFC 7946)
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10">
          <Sym name={icon} className="text-2xl text-secondary" />
        </div>
        <h3 className="text-xl font-bold text-primary">{title}</h3>
      </div>
      <p className="text-body-md leading-relaxed text-on-surface-variant">{text}</p>
    </div>
  );
}

function LiveMap({
  features,
  loading,
  error,
}: {
  features: GeoJSONFeature[];
  loading: boolean;
  error: string | null;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapGL | null>(null);
  const featRef = useRef(features);
  featRef.current = features;

  const [ready, setReady] = useState(false);
  const [sat, setSat] = useState(false);
  const [active, setActive] = useState<Record<string, unknown> | null>(null);

  // Init quando visível (IntersectionObserver) — evita custo se nunca chega ao mapa.
  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    let map: MapGL | null = null;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || map) return;
        map = new MapGL({
          container: el,
          style: makeBaseStyle(),
          center: [-52, -13],
          zoom: 4,
          attributionControl: { compact: true },
        });
        mapRef.current = map;

        map.on('load', () => {
          const m = map;
          if (!m) return;
          setReady(true);
          if (featRef.current.length) {
            addParcels(m, featRef.current, 'main', { fillOpacity: 0.4, lineColor: '#bbf7d0' });
            const bbox = collectionBbox(featRef.current);
            if (bbox) m.fitBounds(bbox, { padding: 50, duration: 1400, maxZoom: 13 });
          }
        });

        map.on('click', 'main-fill', (e) => {
          if (e.features?.[0]) setActive(e.features[0].properties as Record<string, unknown>);
        });
        map.on('mouseenter', 'main-fill', () => {
          if (map) map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'main-fill', () => {
          if (map) map.getCanvas().style.cursor = '';
        });
      },
      { threshold: 0.15 },
    );
    obs.observe(el);

    return () => {
      obs.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Feições que chegam depois do init.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !features.length) return;
    addParcels(map, features, 'main', { fillOpacity: 0.4, lineColor: '#bbf7d0' });
    const bbox = collectionBbox(features);
    if (bbox) map.fitBounds(bbox, { padding: 50, duration: 1400, maxZoom: 13 });
  }, [features]);

  function toggle(next: boolean) {
    setSat(next);
    const map = mapRef.current;
    if (!map) return;
    map.setLayoutProperty('sat-bg', 'visibility', next ? 'visible' : 'none');
    map.setLayoutProperty('osm-bg', 'visibility', next ? 'none' : 'visible');
  }

  return (
    <div className="group relative aspect-[16/10] overflow-hidden rounded-2xl border border-outline-variant shadow-2xl sm:aspect-[16/9]">
      <div ref={divRef} className="absolute inset-0 h-full w-full" />

      {/* Toggle satélite / mapa */}
      {ready && (
        <div className="absolute left-4 top-4 flex overflow-hidden rounded-full border border-outline-variant shadow-lg map-control-overlay">
          <button
            onClick={() => toggle(false)}
            className={`px-4 py-1.5 text-xs font-bold transition-colors ${!sat ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-primary'}`}
            aria-pressed={!sat}
          >
            Mapa
          </button>
          <button
            onClick={() => toggle(true)}
            className={`px-4 py-1.5 text-xs font-bold transition-colors ${sat ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-primary'}`}
            aria-pressed={sat}
          >
            Satélite
          </button>
        </div>
      )}

      {/* Loading */}
      {!ready && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-container" aria-live="polite">
          <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-outline-variant border-t-primary" aria-hidden="true" />
          <p className="text-sm text-on-surface-variant">{loading ? 'Carregando dados do CAR…' : 'Iniciando mapa…'}</p>
        </div>
      )}

      {/* Erro */}
      {error && ready && (
        <div
          className="absolute right-4 top-4 rounded-lg border border-error/30 bg-surface-container-lowest/95 px-3 py-2 text-xs font-semibold text-error shadow-lg"
          role="alert"
        >
          API offline — basemap ativo, polígonos indisponíveis.
        </div>
      )}

      {/* Vazio */}
      {ready && !loading && !error && features.length === 0 && (
        <div
          className="absolute right-4 top-4 rounded-lg border border-outline-variant bg-surface-container-lowest/95 px-3 py-2 text-xs font-semibold text-on-surface-variant shadow-lg"
          role="status"
        >
          Nenhum imóvel na coleção.
        </div>
      )}

      {/* Painel da feição */}
      {active && (
        <div className="absolute bottom-4 left-4 min-w-[180px] rounded-xl border border-outline-variant bg-surface-container-lowest/95 p-4 shadow-xl backdrop-blur map-control-overlay">
          <button
            onClick={() => setActive(null)}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
            aria-label="Fechar informações do imóvel"
          >
            <Sym name="close" className="text-base" />
          </button>
          {active.area_ha != null && (
            <>
              <span className="text-[11px] uppercase tracking-wide text-outline">Área</span>
              <p className="font-headline-md text-2xl font-bold tabular-nums text-primary">
                {Number(active.area_ha).toFixed(2)} ha
              </p>
            </>
          )}
          {Boolean(active.municipio) && (
            <p className="mt-1 text-sm text-on-surface-variant">
              {String(active.municipio)}
              {active.uf ? ` · ${String(active.uf)}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// API section — bloco de código real
// =====================================================================

function ApiSection() {
  return (
    <section id="api" className="py-24 md:py-32" data-reveal>
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 md:px-12 lg:grid-cols-2 lg:gap-20">
        <CodeBlock />

        <div className="order-1 lg:order-2">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-tertiary-fixed px-3 py-1 text-xs font-bold uppercase tracking-wider text-on-tertiary-fixed-variant">
            Developer first
          </div>
          <h2 className="mb-6 font-headline-md text-3xl text-primary md:text-4xl">
            Leitura pública em GeoJSON padrão
          </h2>
          <p className="mb-10 font-body-lg text-body-lg text-on-surface-variant">
            Os polígonos do CAR são servidos como OGC API Features (REST + GeoJSON), com bbox, paginação e
            links. Consuma direto no QGIS, Leaflet, MapLibre, geopandas ou um <code className="font-mono text-base text-primary">fetch()</code> no
            navegador — sem driver proprietário.
          </p>
          <div className="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <Sym name="lock_open" className="text-2xl text-secondary" />
              <div>
                <span className="block font-bold text-primary">Leitura pública, sem chave</span>
                <span className="text-sm text-on-surface-variant">Endpoints de dados abertos.</span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Sym name="public" className="text-2xl text-secondary" />
              <div>
                <span className="block font-bold text-primary">GeoJSON padrão OGC</span>
                <span className="text-sm text-on-surface-variant">RFC 7946 em WGS84.</span>
              </div>
            </div>
          </div>
          <a
            href={`${API_BASE_URL}/docs`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-4 rounded-xl bg-primary px-8 py-4 font-bold text-on-primary shadow-lg transition-all hover:gap-6"
          >
            Acessar o Swagger
            <Sym name="arrow_forward" />
          </a>
        </div>
      </div>
    </section>
  );
}

function CodeBlock() {
  return (
    <div className="relative order-2 overflow-hidden rounded-2xl bg-[#0d1117] p-8 font-mono text-sm leading-relaxed text-[#e6edf3] shadow-2xl lg:order-1">
      <div className="relative z-10">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
            <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
            <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
          </div>
          <span className="rounded bg-white/5 px-2 py-0.5 font-label-sm text-[10px] uppercase tracking-widest text-[#8b949e]">
            OGC API Features
          </span>
        </div>
        <div className="space-y-0.5 overflow-x-auto">
          <p>
            <span className="text-[#7ee787]">GET</span>{' '}
            <span className="text-[#79c0ff]">/collections/imovel/items?limit=1</span>
          </p>
          <p className="pb-2 text-[#8b949e]"># leitura pública — sem X-API-Key</p>
          <p className="text-[#7ee787]">200 OK · application/geo+json</p>
          <p className="text-[#8b949e]">{'{'}</p>
          <p className="pl-4">
            "<span className="text-[#7ee787]">type</span>": <span className="text-[#a5d6ff]">"FeatureCollection"</span>,
          </p>
          <p className="pl-4">
            "<span className="text-[#7ee787]">features</span>": [{'{'}
          </p>
          <p className="pl-8">
            "<span className="text-[#7ee787]">type</span>": <span className="text-[#a5d6ff]">"Feature"</span>,
          </p>
          <p className="pl-8">
            "<span className="text-[#7ee787]">geometry</span>": {'{'} "<span className="text-[#7ee787]">type</span>":{' '}
            <span className="text-[#a5d6ff]">"Polygon"</span>, … {'}'},
          </p>
          <p className="pl-8">
            "<span className="text-[#7ee787]">properties</span>": {'{'}
          </p>
          <p className="pl-12">
            "<span className="text-[#7ee787]">municipio</span>": <span className="text-[#a5d6ff]">"Sorriso"</span>,{' '}
            "<span className="text-[#7ee787]">uf</span>": <span className="text-[#a5d6ff]">"MT"</span>,
          </p>
          <p className="pl-12">
            "<span className="text-[#7ee787]">area_ha</span>": <span className="text-[#ff7b72]">52.7</span>,{' '}
            "<span className="text-[#7ee787]">situacao</span>": <span className="text-[#a5d6ff]">"Ativo"</span>
          </p>
          <p className="pl-8">{'}'}</p>
          <p className="pl-4">{'}'}],</p>
          <p className="pl-4">
            "<span className="text-[#7ee787]">numberMatched</span>": <span className="text-[#ff7b72]">128</span>
          </p>
          <p className="text-[#8b949e]">{'}'}</p>
        </div>
      </div>
      <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-secondary/20 opacity-30 blur-3xl" />
    </div>
  );
}

// =====================================================================
// Relatório / consulta
// =====================================================================

function ReportSection() {
  return (
    <section id="relatorio" className="overflow-hidden bg-surface-container-high py-24" data-reveal>
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 md:px-12 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-5">
          <h2 className="mb-6 font-headline-md text-3xl text-primary md:text-4xl">
            Relatório preliminar da sua medição
          </h2>
          <p className="mb-8 font-body-lg text-body-lg text-on-surface-variant">
            Concluída a medição no campo, o CAR Campo gera um relatório técnico <strong className="text-primary">preliminar </strong>
            em PDF e um código de consulta. Consulte sua medição preliminar para a visita do técnico.
          </p>

          <div className="mb-10 rounded-2xl border-l-8 border-tertiary bg-surface-container-lowest p-8 shadow-md">
            <div className="mb-3 flex gap-4">
              <Sym name="warning" className="text-tertiary" />
              <h3 className="font-bold text-primary">Nota de conformidade</h3>
            </div>
            <p className="font-body-md italic leading-relaxed text-on-surface-variant">
              Este documento constitui uma <strong className="not-italic text-primary">verificação técnica preliminar</strong> —
              não substitui o laudo oficial. A documentação oficial é emitida por <strong className="not-italic text-primary">analistas de campo parceiros</strong>.
            </p>
          </div>

          <a
            href={`${API_BASE_URL}/consulta`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-3 rounded-xl bg-primary px-8 py-4 font-bold text-on-primary shadow-lg transition-all hover:gap-5"
          >
            Consultar minha medição
            <Sym name="open_in_new" className="text-xl" />
          </a>
          <p className="mt-4 text-sm text-on-surface-variant">
            <Sym name="lock" className="align-middle text-base text-secondary" /> Acesso protegido por CPF + código.
          </p>
        </div>

        <div className="flex justify-center lg:col-span-7 lg:justify-end">
          <ReportPreview />
        </div>
      </div>
    </section>
  );
}

function ReportPreview() {
  const ALERTS = [
    { label: 'Terra Indígena (FUNAI)', tone: 'crit' },
    { label: 'Embargo IBAMA', tone: 'crit' },
    { label: 'APP — faixa de rio', tone: 'info' },
  ] as const;

  return (
    <div className="relative w-full max-w-lg">
      <div className="absolute inset-0 -z-10 translate-x-4 translate-y-4 rotate-3 rounded-2xl bg-primary/5" />
      <div className="absolute inset-0 -z-20 translate-x-8 translate-y-8 rotate-6 rounded-2xl bg-primary/10" />

      <div className="paper-shadow relative rounded-xl bg-white p-6 transition-all duration-500 hover:-translate-y-2">
        {/* Badge */}
        <div className="absolute -right-5 -top-5 flex items-center gap-3 rounded-2xl border-4 border-white bg-secondary px-5 py-3 font-bold text-on-secondary shadow-xl">
          <Sym name="description" filled className="text-2xl" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-tighter opacity-80">Relatório</span>
            <span className="text-base leading-tight">PRELIMINAR</span>
          </div>
        </div>

        <div className="mb-5 flex items-center gap-2 border-b border-outline-variant pb-4">
          <Sym name="eco" filled className="text-primary" />
          <span className="font-headline-md text-lg font-bold text-primary">CAR Campo</span>
          <span className="ml-auto text-xs text-outline">Medição #SRR-2049</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-surface-container-low p-4">
            <span className="text-xs uppercase tracking-wide text-outline">Área</span>
            <p className="font-headline-md text-2xl font-bold tabular-nums text-primary">52,7 ha</p>
          </div>
          <div className="rounded-xl bg-surface-container-low p-4">
            <span className="text-xs uppercase tracking-wide text-outline">Perímetro</span>
            <p className="font-headline-md text-2xl font-bold tabular-nums text-primary">3.140 m</p>
          </div>
        </div>

        <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
          Sobreposições detectadas
        </p>
        <ul className="flex flex-col gap-2">
          {ALERTS.map((a) => (
            <li
              key={a.label}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                a.tone === 'crit'
                  ? 'bg-error-container text-on-error-container'
                  : 'bg-secondary-container text-on-secondary-container'
              }`}
            >
              <Sym name={a.tone === 'crit' ? 'block' : 'info'} className="text-base" />
              {a.label}
            </li>
          ))}
        </ul>

        <p className="mt-5 border-t border-outline-variant pt-4 text-xs italic text-outline">
          Documento preliminar e informativo · valores de exemplo · não substitui o laudo oficial.
        </p>
      </div>
    </div>
  );
}

// =====================================================================
// Portal do desenvolvedor
// =====================================================================

function DevPortalSection({
  collections,
  collectionsError,
}: {
  collections: Collection[];
  collectionsError: string | null;
}) {
  return (
    <section id="dev" className="bg-surface-container-low py-24" data-reveal>
      <div className="mx-auto max-w-7xl px-6 md:px-12">
        <div className="mb-14 flex flex-col items-center text-center">
          <span className="mb-4 rounded-full bg-secondary/10 px-4 py-1.5 font-label-sm uppercase tracking-widest text-secondary">
            Portal do desenvolvedor
          </span>
          <h2 className="font-headline-md text-3xl text-primary md:text-4xl">Construa em cima dos dados</h2>
          <p className="mt-4 max-w-2xl text-body-md text-on-surface-variant">
            Leitura pública sem chave. Gere uma chave gratuita para rastrear seu uso e habilitar endpoints
            futuros.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6">
          <KeySection collections={collections} />
          {collectionsError && (
            <p className="text-sm font-semibold text-error">
              <Sym name="warning" className="align-middle text-base" /> Não foi possível listar coleções: {collectionsError}
            </p>
          )}
          <DocsSection />
        </div>
      </div>
    </section>
  );
}

function devCardClass(): string {
  return 'rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 shadow-sm';
}

function StepTitle({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-lg font-bold text-primary">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        {num}
      </span>
      {children}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

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
    <div className={devCardClass()}>
      <StepTitle num={1}>Gere sua chave de API</StepTitle>
      <p className="mb-6 ml-10 mt-1 text-sm text-on-surface-variant">
        Grátis e instantâneo. A chave aparece uma única vez — guarde-a.
      </p>

      {!result ? (
        <div className="ml-0 grid max-w-md gap-4 md:ml-10">
          <label className="grid gap-1.5 text-sm font-semibold text-on-surface-variant">
            Nome / equipe <span className="font-normal text-outline">(opcional)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Equipe Panic Lobster"
              autoComplete="organization"
              className={inputClass}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-on-surface-variant">
            E-mail <span className="font-normal text-outline">(opcional)</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="time@exemplo.org"
              type="email"
              autoComplete="email"
              className={inputClass}
            />
          </label>
          <button
            onClick={onGenerate}
            disabled={loading}
            className="justify-center rounded-xl bg-primary px-6 py-3 font-bold text-on-primary transition-all hover:bg-primary-container disabled:opacity-50"
          >
            {loading ? 'Gerando…' : 'Gerar chave'}
          </button>
          {error && (
            <p className="text-sm font-semibold text-error">
              <Sym name="error" className="align-middle text-base" /> {error}
            </p>
          )}
        </div>
      ) : (
        <div className="ml-0 md:ml-10">
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-secondary/30 bg-[#0d1117] px-4 py-3.5">
            <code className="flex-1 break-all text-sm leading-relaxed text-[#7ee787]">{result.key}</code>
            <button
              onClick={copy}
              className="flex-shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-[#e6edf3] hover:bg-white/10"
            >
              {copied ? 'Copiado ✓' : 'Copiar'}
            </button>
          </div>
          <p className="mb-6 rounded-lg border border-tertiary/30 bg-tertiary-fixed/40 px-3 py-2.5 text-xs text-on-tertiary-fixed-variant">
            <Sym name="warning" className="align-middle text-sm" />{' '}
            {result.aviso ?? 'Guarde esta chave: ela não será exibida novamente.'}
          </p>
          <Quickstart apiKey={result.key} collections={collections} />
          <Console apiKey={result.key} collections={collections} />
        </div>
      )}
    </div>
  );
}

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
        `# Com chave (rastreamento de uso)`,
        `curl '${API_BASE_URL}/collections/${col}/items' \\`,
        `  -H 'X-API-Key: ${apiKey}'`,
      ].join('\n'),
    [apiKey, col],
  );

  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-outline">Comece em 1 minuto</p>
      <pre className="overflow-x-auto rounded-xl bg-[#0d1117] p-4 font-mono text-[12.5px] leading-relaxed text-[#7ee787]">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}

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
    <div>
      <StepTitle num={2}>
        Console de teste{' '}
        <span className="text-sm font-normal text-outline">(chave já aplicada)</span>
      </StepTitle>
      <div className="ml-0 mt-4 flex flex-wrap items-center gap-2 md:ml-10">
        <select
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
          aria-label="Selecionar coleção"
          className={`${inputClass} min-w-[150px] flex-none cursor-pointer`}
        >
          {collections.length === 0 && <option value="imovel">imovel</option>}
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <input
          value={bbox}
          onChange={(e) => setBbox(e.target.value)}
          placeholder="bbox opcional: -55.6,-11.9,-55.4,-11.8"
          aria-label="Bounding box opcional"
          className={`${inputClass} min-w-[200px] flex-1`}
        />
        <button
          onClick={run}
          disabled={busy}
          className="whitespace-nowrap rounded-xl bg-primary px-5 py-3 font-bold text-on-primary transition-all hover:bg-primary-container disabled:opacity-50"
        >
          {busy ? '…' : 'GET items'}
        </button>
      </div>
      {res && (
        <div
          className={`ml-0 mt-3 rounded-xl border p-4 text-sm md:ml-10 ${
            res.ok
              ? 'border-secondary/30 bg-secondary/5 text-on-secondary-container'
              : 'border-error/30 bg-error-container/40 text-on-error-container'
          }`}
          role="status"
        >
          <div>
            <strong>HTTP {res.status}</strong>{' '}
            {res.ok
              ? `· ${res.numberReturned ?? 0} / ${res.numberMatched ?? '?'} feições`
              : `· ${res.error ?? 'Erro desconhecido'}`}
          </div>
          {res.sample != null && (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-[#0d1117] p-3 font-mono text-xs text-[#7ee787]">
              {JSON.stringify(res.sample, null, 2).slice(0, 900)}…
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function DocsSection() {
  return (
    <div id="docs" className={devCardClass()}>
      <StepTitle num={3}>Documentação interativa (Swagger)</StepTitle>
      <p className="mb-5 ml-10 mt-1 text-sm text-on-surface-variant">
        Especificação OpenAPI 3 completa. Use <em>Authorize</em> para testar com sua chave.{' '}
        <a
          href={`${API_BASE_URL}/docs`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-primary underline"
        >
          Abrir em nova aba ↗
        </a>
      </p>
      <iframe
        className="block h-[640px] w-full rounded-xl border border-outline-variant bg-white"
        src={`${API_BASE_URL}/docs`}
        title="Swagger UI — CAR Geo API"
      />
    </div>
  );
}

// =====================================================================
// CTA final
// =====================================================================

function CtaSection() {
  return (
    <section className="relative overflow-hidden px-6 py-28 text-center md:py-32" data-reveal>
      <div className="relative z-10 mx-auto max-w-3xl">
        <h2 className="mb-6 font-headline-md text-4xl text-primary md:text-5xl">Comece a medir sua terra</h2>
        <p className="mb-10 text-body-lg text-xl text-on-surface-variant">
          Um auxílio inicial e gratuito para o pequeno produtor. Veja os imóveis no mapa ou explore a API
          pública — sem cadastro, sem chave.
        </p>
        <div className="flex flex-col justify-center gap-5 sm:flex-row">
          <a
            href="#mapa"
            className="rounded-xl bg-primary px-10 py-4 text-lg font-bold text-on-primary shadow-2xl transition-all hover:scale-105"
          >
            Ver imóveis no mapa
          </a>
          <a
            href={`${API_BASE_URL}/docs`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border-2 border-primary px-10 py-4 text-lg font-bold text-primary transition-all hover:bg-primary/5"
          >
            Acessar o Swagger
          </a>
        </div>
      </div>
      <div className="absolute left-1/2 top-1/2 -z-10 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
    </section>
  );
}

// =====================================================================
// Footer
// =====================================================================

function Footer() {
  return (
    <footer className="bg-inverse-surface py-16 text-surface">
      <div className="mx-auto max-w-7xl px-6 md:px-12">
        <div className="mb-12 grid grid-cols-1 gap-12 md:grid-cols-12">
          <div className="space-y-5 md:col-span-5">
            <div className="flex items-center gap-3">
              <Sym name="eco" filled className="text-3xl text-primary-fixed-dim" />
              <span className="font-headline-md text-2xl font-bold">CAR Geo · CAR Campo</span>
            </div>
            <p className="max-w-sm leading-relaxed text-surface-variant">
              Um auxílio inicial e gratuito para o pequeno produtor medir sua terra — e uma API aberta que
              serve os dados do Cadastro Ambiental Rural em GeoJSON.
            </p>
          </div>

          <div className="md:col-span-7">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-2">
              <div>
                <h3 className="mb-5 font-bold text-primary-fixed-dim">API</h3>
                <ul className="space-y-3 text-surface-variant">
                  <li>
                    <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer" className="hover:text-white">
                      Documentação (Swagger)
                    </a>
                  </li>
                  <li>
                    <a href={`${API_BASE_URL}/collections`} target="_blank" rel="noreferrer" className="hover:text-white">
                      Coleções
                    </a>
                  </li>
                  <li>
                    <a href={`${API_BASE_URL}/openapi.json`} target="_blank" rel="noreferrer" className="hover:text-white">
                      OpenAPI JSON
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mb-5 font-bold text-primary-fixed-dim">Produtor</h3>
                <ul className="space-y-3 text-surface-variant">
                  <li>
                    <a href={`${API_BASE_URL}/consulta`} target="_blank" rel="noreferrer" className="hover:text-white">
                      Consultar minha medição
                    </a>
                  </li>
                  <li>
                    <a href="#mapa" className="hover:text-white">
                      Imóveis no mapa
                    </a>
                  </li>
                  <li>
                    <a href="#dev" className="hover:text-white">
                      Portal do desenvolvedor
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-sm text-surface-variant md:flex-row">
          <p>haCARthon · Desafio 2 · Solução 7 — Bem Público Digital</p>
          <p className="flex flex-wrap items-center gap-2">
            <span>Basemaps:</span>
            <a href="https://openstreetmap.org" target="_blank" rel="noreferrer" className="underline hover:text-white">
              © OpenStreetMap
            </a>
            <span aria-hidden="true">·</span>
            <span>Esri World Imagery</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
