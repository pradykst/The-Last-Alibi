import { GUARANTEES, IMPLEMENTATION_FACTS } from '../lib/page-content';
import { buildPageRuntimeModel } from '../server/page-runtime';

const ARCHITECTURE_URL = 'https://github.com/pradykst/The-Last-Alibi/tree/main/docs/architecture';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const runtime = buildPageRuntimeModel();

  return (
    <main>
      <header className="site-header" aria-label="Product header">
        <a className="wordmark" href="#top" aria-label="The Last Alibi home">
          TLA
        </a>
        <div className="runtime" role="status" aria-label={`Runtime status: ${runtime.label}`}>
          <span className="runtime-dot" aria-hidden="true" />
          <span>{runtime.label}</span>
        </div>
      </header>

      <section className="hero" id="top" aria-labelledby="page-title">
        <p className="eyebrow">Verifiable AI detective game</p>
        <h1 id="page-title">The Last Alibi</h1>
        <p className="pitch">
          Every suspect can lie. The truth cannot. Investigate an AI-driven mystery whose
          commitments, disclosure limits, and final verdict remain outside the model&apos;s control.
        </p>
        <div className="hero-links" aria-label="Project links">
          <a className="primary-link" href="#guarantees">
            Read the guarantees
          </a>
          <a href={ARCHITECTURE_URL}>Architecture documentation</a>
          <a href="/api/health">Public health status</a>
        </div>
      </section>

      <section className="guarantees" id="guarantees" aria-labelledby="guarantees-title">
        <div className="section-heading">
          <p className="eyebrow">Trust model</p>
          <h2 id="guarantees-title">Three guarantees</h2>
        </div>
        <ol className="guarantee-grid">
          {GUARANTEES.map((guarantee) => (
            <li key={guarantee.number}>
              <span className="guarantee-number" aria-hidden="true">
                {guarantee.number}
              </span>
              <h3>{guarantee.title}</h3>
              <p>{guarantee.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="status-panel" aria-labelledby="status-title">
        <div>
          <p className="eyebrow">Checkpoint B1</p>
          <h2 id="status-title">Runnable baseline</h2>
          <p>
            The application shell and its public runtime boundary are operational. Partner
            integrations remain deliberately unavailable until their real adapters are implemented
            and verified.
          </p>
        </div>
        <div>
          <p className="status-label">Runtime declaration</p>
          <p className="status-value">{runtime.label}</p>
          <p className="status-detail">{runtime.summary}</p>
        </div>
        <ul aria-label="Implemented baseline capabilities">
          {IMPLEMENTATION_FACTS.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </section>

      <footer>
        <p>The Last Alibi · ETHGlobal Lisbon 2026</p>
        <p>No wallet, transaction, proof, or partner verification is claimed at this checkpoint.</p>
      </footer>
    </main>
  );
}
