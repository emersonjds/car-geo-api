import { useEffect, useMemo, useState } from 'react';
import {
  API_BASE_URL,
  generateKey,
  listCollections,
  testItems,
  type Collection,
  type GeneratedKey,
  type TestResult,
} from './api';

export function App() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);

  useEffect(() => {
    listCollections()
      .then(setCollections)
      .catch((e) => setCollectionsError(e.message));
  }, []);

  return (
    <div className="page">
      <Header />
      <main className="container">
        <Hero collections={collections} />
        <KeySection collections={collections} />
        <CollectionsSection collections={collections} error={collectionsError} />
        <DocsSection />
      </main>
      <footer className="footer">
        CAR Geo API · haCARthon · Desafio 2 · Solução 7 — Bem Público Digital. API base: <code>{API_BASE_URL}</code>
      </footer>
    </div>
  );
}

function Header() {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">🌎</span>
        <div>
          <strong>CAR Geo API</strong>
          <span className="brand-sub">Portal do Desenvolvedor</span>
        </div>
      </div>
      <nav className="topnav">
        <a href="#gerar-chave">Gerar chave</a>
        <a href="#colecoes">Coleções</a>
        <a href="#docs">Documentação</a>
        <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">
          Swagger ↗
        </a>
      </nav>
    </header>
  );
}

function Hero({ collections }: { collections: Collection[] }) {
  return (
    <section className="hero">
      <h1>Dados geoespaciais do CAR, em REST + GeoJSON</h1>
      <p>
        Uma fachada moderna <strong>OGC API Features</strong> sobre dados do Cadastro Ambiental Rural.
        Gere uma chave gratuita e comece a consumir em minutos — direto no navegador, no QGIS ou no seu app.
      </p>
      <div className="hero-stats">
        <Stat n={String(collections.length || '—')} label="coleções" />
        <Stat n="GeoJSON" label="formato de saída" />
        <Stat n="OGC" label="padrão aberto" />
      </div>
    </section>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="stat">
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );
}

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
      const key = await generateKey({ name: name || undefined, email: email || undefined });
      setResult(key);
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
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section id="gerar-chave" className="card">
      <h2>1. Gere sua chave de API</h2>
      <p className="muted">Grátis e instantâneo. A chave aparece uma única vez — guarde com segurança.</p>

      {!result ? (
        <div className="form">
          <label>
            Nome / equipe (opcional)
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Equipe Panic Lobster" />
          </label>
          <label>
            E-mail (opcional)
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="time@exemplo.org" />
          </label>
          <button className="btn primary" onClick={onGenerate} disabled={loading}>
            {loading ? 'Gerando…' : 'Gerar chave'}
          </button>
          {error && <p className="error">⚠ {error}</p>}
        </div>
      ) : (
        <div className="key-box">
          <div className="key-value">
            <code>{result.key}</code>
            <button className="btn" onClick={copy}>
              {copied ? 'Copiado ✓' : 'Copiar'}
            </button>
          </div>
          <p className="warn">⚠ {result.aviso ?? 'Guarde esta chave: ela não será exibida novamente.'}</p>
          <Quickstart apiKey={result.key} collections={collections} />
          <Console apiKey={result.key} collections={collections} />
        </div>
      )}
    </section>
  );
}

function Quickstart({ apiKey, collections }: { apiKey: string; collections: Collection[] }) {
  const col = collections[0]?.id ?? 'imovel';
  const snippet = useMemo(
    () =>
      [
        `# 2. Consuma a API enviando a chave no header X-API-Key`,
        `curl '${API_BASE_URL}/collections/${col}/items?limit=10' \\`,
        `  -H 'X-API-Key: ${apiKey}'`,
        ``,
        `# Filtro espacial por bounding box (minLon,minLat,maxLon,maxLat)`,
        `curl '${API_BASE_URL}/collections/${col}/items?bbox=-55.6,-11.9,-55.4,-11.8' \\`,
        `  -H 'X-API-Key: ${apiKey}'`,
      ].join('\n'),
    [apiKey, col],
  );
  return (
    <div className="snippet">
      <div className="snippet-head">Comece em 1 minuto</div>
      <pre>
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="console">
      <div className="console-head">3. Teste agora (sua chave já está aplicada)</div>
      <div className="console-row">
        <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <input value={bbox} onChange={(e) => setBbox(e.target.value)} placeholder="bbox opcional: -55.6,-11.9,-55.4,-11.8" />
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? '…' : 'GET items'}
        </button>
      </div>
      {res && (
        <div className={`console-out ${res.ok ? 'ok' : 'fail'}`}>
          <div>
            <b>HTTP {res.status}</b>{' '}
            {res.ok ? `· ${res.numberReturned}/${res.numberMatched} feições` : `· ${res.error}`}
          </div>
          {res.sample != null && <pre>{JSON.stringify(res.sample, null, 2).slice(0, 900)}…</pre>}
        </div>
      )}
    </div>
  );
}

function CollectionsSection({ collections, error }: { collections: Collection[]; error: string | null }) {
  return (
    <section id="colecoes" className="card">
      <h2>Coleções disponíveis</h2>
      {error && <p className="error">⚠ Não foi possível carregar ({error}). A API está rodando em {API_BASE_URL}?</p>}
      <div className="grid">
        {collections.map((c) => (
          <div key={c.id} className="coll">
            <div className="coll-id">{c.id}</div>
            <strong>{c.title}</strong>
            <p>{c.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DocsSection() {
  return (
    <section id="docs" className="card">
      <h2>Documentação interativa (Swagger)</h2>
      <p className="muted">
        Especificação OpenAPI 3 completa. Use o botão <em>Authorize</em> para aplicar sua chave e testar cada endpoint.{' '}
        <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">
          Abrir em nova aba ↗
        </a>
      </p>
      <iframe className="swagger" src={`${API_BASE_URL}/docs`} title="Swagger UI" />
    </section>
  );
}
