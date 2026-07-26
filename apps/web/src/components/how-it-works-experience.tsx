/* eslint-disable @next/next/no-img-element -- Repository-owned game and architecture assets use stable, explicit paths. */
'use client';

import katex from 'katex';
import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useDialogFocusTrap } from './use-dialog-focus-trap';

const NAV_ITEMS = [
  ['Overview', 'overview'],
  ['Player loop', 'player-loop'],
  ['Truth model', 'truth-model'],
  ['Zero knowledge', 'zero-knowledge'],
  ['Architecture', 'architecture'],
  ['Trust boundaries', 'trust-boundaries'],
  ['Market', 'market'],
  ['GTM', 'gtm'],
  ['Status', 'status'],
] as const;

const CHAPTERS = [
  {
    index: '01 · THE PRODUCT',
    title: 'A cinematic detective game built around one unchangeable truth.',
    copy: 'Players explore a private museum, interrogate four distinct suspects, collect evidence, and commit to one final accusation. Every screen serves the mystery: observation, deduction, and consequence.',
  },
  {
    index: '02 · FIXED TRUTH',
    title: '64 possible cases. One committed truth.',
    copy: 'Every session chooses one hidden combination before the investigation begins. The same public case universe can be replayed, but each player receives a session-specific committed answer.',
  },
  {
    index: '03 · CONTROLLED DISCLOSURE',
    title: 'Five certified questions. No exact-case oracle.',
    copy: 'Natural-language testimony may guide or mislead. Only curated binary warrants change canonical knowledge, and the system blocks any warrant whose YES or NO branch would isolate the answer.',
  },
  {
    index: '04 · PRIVATE VERDICT',
    title: 'Prove the accusation. Reveal only YES or NO.',
    copy: 'The designed live path commits the accusation privately. A Groth16 proof establishes that the binary verdict was computed from the committed case and accusation without publishing either one.',
  },
  {
    index: '05 · PRODUCT WEDGE',
    title: 'Web3 that makes games more trustworthy, not more financialized.',
    copy: 'Players come for expressive characters and deduction. Studios need AI characters without surrendering narrative consistency, competitive fairness, or outcome integrity.',
  },
] as const;

const AUTHORITY_ROWS = [
  ['Game UI', 'Presentation and interaction', 'Case truth or proof validity'],
  ['API / relayer', 'Orchestration and idempotency', 'Choosing the verdict'],
  ['Sui Move', 'Canonical state and proof acceptance', 'Natural-language content'],
  ['ZK prover', 'Proof generation', 'Policy authorization'],
  ['0G', 'Verified suspect inference', 'Canonical evidence or verdict'],
  ['Walrus', 'Encrypted persistence', 'Access authorization or truth'],
  ['Seal', 'Decryption under Sui policy', 'Verdict correctness'],
  ['World AgentKit', 'Human-backed ranked authorization', 'Game outcome'],
] as const;

const THREAT_ROWS = [
  ['Publisher changes the ending', 'Pre-investigation case commitment'],
  ['AI invents canonical clues', 'AI testimony is non-authoritative'],
  ['Exact-case probing', 'Two-survivor branch check'],
  ['Repeated certified questions', 'Five-query cap and used-predicate tracking'],
  ['Reading an answer then aborting', 'State finalizes before answer delivery'],
  ['Proof replay', 'Session and nonce binding'],
  ['Wrong verifier', 'Expected verifier identity is pinned'],
  ['Ciphertext substitution', 'Blob ID and commitment binding'],
  ['False verdict capsule', 'Proof-bound verdict commitment and client check'],
  ['Unauthorized reveal', 'Seal policy checks terminal state and player'],
  ['Fake AI response', 'Verified 0G response and fail-closed rendering'],
  ['Ranked bot abuse', 'World-backed scoped permit and replay protection'],
] as const;

const CAPABILITIES = [
  [
    'Practice investigation',
    'Live in this build',
    'Deterministic fixture session; no wallet or partner credentials required.',
  ],
  [
    'Cinematic browser game',
    'Live in this build',
    'Opening, museum, interviews, notebook, warrants, accusation, and verdicts.',
  ],
  [
    '64-case engine and predicates',
    'Locally verified',
    'Repository tests cover deterministic masks, query limits, and terminal outcomes.',
  ],
  [
    'Architecture and trust model',
    'Designed',
    'Documented as the intended live architecture, not a deployed claim.',
  ],
  [
    'Sui canonical Move state',
    'Published on testnet; web unwired',
    'The package and immutable level are live on Sui testnet. Practice sessions remain fixture-backed and do not submit transactions.',
  ],
  [
    'Groth16 verdict proof',
    'Testnet accepted; web unwired',
    'Native Groth16 acceptance and replay rejection are separately evidenced on testnet. Parameters are hackathon/testnet-only, and Practice does not invoke the prover.',
  ],
  [
    '0G verified inference',
    'Unavailable',
    'Practice uses labeled scripted testimony and never claims live 0G verification.',
  ],
  [
    'Walrus encrypted persistence',
    'Unavailable',
    'No Blob ID or live storage receipt is produced in this build.',
  ],
  [
    'Seal policy reveal',
    'Unavailable',
    'No accepted/denied live authorization flow is wired here.',
  ],
  [
    'World AgentKit ranked permit',
    'Unavailable',
    'Ranked mode remains visibly unavailable and Practice does not emulate it.',
  ],
] as const;

export type SamplePredicate = 'suspect-ada' | 'room-gallery' | 'weapon-dagger' | 'exact-case';

export function getCandidatePartition(predicate: SamplePredicate): {
  yes: number[];
  no: number[];
  authorized: boolean;
} {
  const yes = Array.from({ length: 64 }, (_, index) => index).filter((index) => {
    if (predicate === 'suspect-ada') return index < 16;
    if (predicate === 'room-gallery') return Math.floor(index / 4) % 4 === 0;
    if (predicate === 'weapon-dagger') return Math.floor(index / 2) % 2 === 0;
    return index === 0;
  });
  const yesSet = new Set(yes);
  const no = Array.from({ length: 64 }, (_, index) => index).filter((index) => !yesSet.has(index));
  return { yes, no, authorized: yes.length >= 2 && no.length >= 2 };
}

export function clampPresentationIndex(index: number): number {
  return Math.min(CHAPTERS.length - 1, Math.max(0, index));
}

function Formula({ children, label }: { children: string; label?: string }) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: true, throwOnError: false, strict: false }),
    [children],
  );
  return (
    <div
      className="hiw-formula"
      role="math"
      aria-label={label ?? children}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function StatusBadge({ children }: { children: string }) {
  return (
    <span className="hiw-status" data-state={children.toLowerCase().replaceAll(' ', '-')}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

function CandidateGrid({ compact = false }: { compact?: boolean }) {
  const [predicate, setPredicate] = useState<SamplePredicate>('suspect-ada');
  const partition = useMemo(() => getCandidatePartition(predicate), [predicate]);
  const yesSet = useMemo(() => new Set(partition.yes), [partition.yes]);
  const labels: Record<SamplePredicate, string> = {
    'suspect-ada': 'Was the culprit Ada Vale?',
    'room-gallery': 'Did it happen in the Grand Gallery?',
    'weapon-dagger': 'Was the Ceremonial Dagger used?',
    'exact-case': 'Is candidate #01 the exact case?',
  };
  return (
    <div className="candidate-model" data-compact={compact}>
      <div className="candidate-model-heading">
        <div>
          <span className="hiw-kicker">Illustrative model</span>
          <h3>{labels[predicate]}</h3>
        </div>
        <strong data-authorized={partition.authorized}>
          {partition.authorized ? 'AUTHORIZED' : 'BLOCKED BEFORE SECRET EVALUATION'}
        </strong>
      </div>
      <div
        className="candidate-grid"
        role="img"
        aria-label="Eight by eight grid of 64 candidate cases divided into YES and NO branches"
      >
        {Array.from({ length: 64 }, (_, index) => (
          <span
            key={index}
            data-branch={yesSet.has(index) ? 'yes' : 'no'}
            title={`Candidate ${String(index + 1).padStart(2, '0')}: ${yesSet.has(index) ? 'YES' : 'NO'} branch`}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
        ))}
      </div>
      <div className="candidate-counts" aria-live="polite">
        <span>
          <i data-branch="yes" /> YES survivors <strong>{partition.yes.length}</strong>
        </span>
        <span>
          <i data-branch="no" /> NO survivors <strong>{partition.no.length}</strong>
        </span>
        <span>
          Current mask <code>0xffffffffffffffff</code>
        </span>
      </div>
      {!compact ? (
        <div className="predicate-picker" aria-label="Approved sample predicate">
          {(Object.keys(labels) as SamplePredicate[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={predicate === key}
              onClick={() => setPredicate(key)}
            >
              {key === 'exact-case' ? 'Try exact-case probe' : labels[key]}
            </button>
          ))}
        </div>
      ) : null}
      <p>
        Both possible branches are counted before the hidden case is read. This local explainer
        never reads or changes a game session.
      </p>
    </div>
  );
}

function Presentation({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocusTrap(dialogRef, onClose);

  useEffect(() => {
    const scrollPosition = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setIndex((current) => clampPresentationIndex(current + 1));
      if (event.key === 'ArrowLeft') setIndex((current) => clampPresentationIndex(current - 1));
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPosition, left: 0, behavior: 'auto' });
      });
    };
  }, []);

  const chapter = CHAPTERS[index]!;
  return (
    <div className="presentation-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="presentation-mode"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <img
            src="/assets/brand/the-last-alibi-wordmark.png"
            width="745"
            height="142"
            alt="The Last Alibi"
          />
          <span>
            {index + 1} / {CHAPTERS.length}
          </span>
          <button type="button" onClick={onClose} aria-label="Exit presentation">
            Exit <kbd>Esc</kbd>
          </button>
        </header>
        <div className="presentation-progress" aria-hidden="true">
          <span style={{ width: `${((index + 1) / CHAPTERS.length) * 100}%` }} />
        </div>
        <article className="presentation-slide" key={chapter.index}>
          <div className="presentation-copy">
            <p>{chapter.index}</p>
            <h2 id={titleId}>{chapter.title}</h2>
            <p>{chapter.copy}</p>
            {index === 0 ? (
              <>
                <div className="loop-line">
                  Explore <i /> Interrogate <i /> Certify <i /> Deduce <i /> Accuse
                </div>
                <small>
                  One mystery. Four rooms. Five certified questions. One terminal accusation.
                </small>
              </>
            ) : null}
            {index === 1 ? (
              <>
                <strong className="case-equation">
                  4 suspects × 4 rooms × 2 weapons × 2 time windows = 64 cases
                </strong>
                <Formula>{String.raw`i(s,r,w,t)=(((4s+r)\cdot2+w)\cdot2+t)`}</Formula>
                <Formula>{String.raw`M_0=2^{64}-1=\mathtt{0xffffffffffffffff}`}</Formula>
              </>
            ) : null}
            {index === 2 ? (
              <div className="presentation-formula-pair">
                <Formula>{String.raw`Y=M\land\mathrm{yesMask}`}</Formula>
                <Formula>{String.raw`N=M\land\mathrm{noMask}`}</Formula>
                <Formula>{String.raw`\operatorname{popcount}(Y)\ge2\;\land\;\operatorname{popcount}(N)\ge2`}</Formula>
                <Formula>{String.raw`q_{\mathrm{resolved}}<5`}</Formula>
              </div>
            ) : null}
            {index === 3 ? (
              <>
                <StatusBadge>Designed</StatusBadge>
                <Formula>{String.raw`v=\mathbf{1}\!\left[(s,r,w,t)=(\hat{s},\hat{r},\hat{w},\hat{t})\right]`}</Formula>
                <Formula>{String.raw`\operatorname{Verify}(vk,\pi,x)=1`}</Formula>
                <small>
                  Conceptual commitment notation. The live proof path is not active in this build.
                </small>
              </>
            ) : null}
            {index === 4 ? (
              <>
                <div className="market-progression">
                  Playable mystery <i /> Paid case library <i /> Creator tooling <i /> Studio trust
                  infrastructure
                </div>
                <p className="honesty-line">
                  Current evidence: playable technical wedge. Next evidence required: retention,
                  another-case intent, and creator demand.
                </p>
              </>
            ) : null}
          </div>
          <div className="presentation-visual" data-chapter={index + 1}>
            {index === 0 ? (
              <div className="presentation-game-art">
                <img
                  src="/assets/rooms/grand-gallery/background.png"
                  width="1920"
                  height="1080"
                  alt="Illustrated Grand Gallery museum room"
                />
                <img
                  src="/assets/characters/marcus-reed/sprites/neutral.png"
                  width="1024"
                  height="1024"
                  alt="Marcus Reed, head of security"
                />
              </div>
            ) : null}
            {index === 1 || index === 2 ? <CandidateGrid compact /> : null}
            {index === 3 ? (
              <div
                className="binary-verdict"
                aria-label="Private inputs flow through a verified proof to a binary output"
              >
                <span>Private case</span>
                <span>Private accusation</span>
                <b>Groth16 proof</b>
                <strong>Verified YES / NO</strong>
              </div>
            ) : null}
            {index === 4 ? (
              <div className="wedge-visual">
                <span>PLAY</span>
                <span>TRUST</span>
                <span>CREATE</span>
                <span>INTEGRATE</span>
              </div>
            ) : null}
          </div>
        </article>
        <footer>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((current) => clampPresentationIndex(current - 1))}
          >
            ← Previous
          </button>
          <span>Use ← → arrow keys</span>
          <button
            type="button"
            disabled={index === CHAPTERS.length - 1}
            onClick={() => setIndex((current) => clampPresentationIndex(current + 1))}
          >
            Next →
          </button>
        </footer>
      </section>
    </div>
  );
}

function ArchitectureLightbox({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocusTrap(dialogRef, onClose);
  return (
    <div className="architecture-lightbox" role="presentation">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <h2 id={titleId}>Intended live architecture</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <img
          src="/assets/architecture/alibi-system.svg"
          alt="The Last Alibi intended live architecture connecting the player and game UI to API orchestration, Sui canonical state, a zero-knowledge prover, 0G inference, Walrus storage, Seal access control, and World AgentKit ranked permits."
        />
      </section>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <header className="hiw-section-heading">
      <p>{eyebrow}</p>
      <h2>{title}</h2>
      <div>{children}</div>
    </header>
  );
}

export default function HowItWorksExperience() {
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [architectureOpen, setArchitectureOpen] = useState(false);
  return (
    <main className="how-it-works">
      <header className="hiw-nav">
        <Link className="hiw-brand" href="/" aria-label="The Last Alibi home">
          <img src="/assets/brand/alibi-logo-mark.png" width="1024" height="1024" alt="" />
          <img
            src="/assets/brand/the-last-alibi-wordmark.png"
            width="745"
            height="142"
            alt="The Last Alibi"
          />
        </Link>
        <nav aria-label="How it works sections">
          {NAV_ITEMS.map(([label, id]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <Link className="hiw-nav-action" href="/">
          Begin Investigation
        </Link>
      </header>

      <section className="hiw-hero" id="overview">
        <div className="hiw-hero-atmosphere" aria-hidden="true">
          <img src="/assets/screens/landing-key-art.webp" width="1920" height="1080" alt="" />
        </div>
        <div className="hiw-hero-copy">
          <p className="hiw-kicker">A PROVABLE AI DETECTIVE GAME</p>
          <h1>
            The mystery plays like a game. <em>The truth behaves like a proof.</em>
          </h1>
          <p>
            The Last Alibi is a browser detective game where AI suspects may evade, misdirect, and
            perform, but cannot rewrite the case. Investigate one committed mystery, use five
            certified disclosures, make one private accusation, and receive only a cryptographically
            verified YES or NO.
          </p>
          <div className="hiw-hero-actions">
            <button type="button" onClick={() => setPresentationOpen(true)}>
              Present in 60 seconds <span>▶</span>
            </button>
            <a href="#deep-dive">
              Explore the deep dive <span>↓</span>
            </a>
            <Link href="/">Begin Investigation</Link>
          </div>
        </div>
        <ol className="hiw-guarantees">
          <li>
            <span>01</span>
            <strong>AI can perform.</strong> It cannot redefine truth.
          </li>
          <li>
            <span>02</span>
            <strong>Interrogate freely.</strong> Certify only five facts.
          </li>
          <li>
            <span>03</span>
            <strong>Prove the outcome.</strong> Never reveal the solution.
          </li>
        </ol>
      </section>

      <section className="hiw-runtime-note" aria-label="Current build boundary">
        <StatusBadge>Live in this build</StatusBadge>
        <p>
          <strong>Practice Investigation is playable now.</strong> It uses deterministic fixture
          state and clearly labeled scripted testimony. The partner-backed live path shown below is
          an intended architecture, not a fabricated deployment.
        </p>
      </section>

      <section className="briefing-layer" aria-labelledby="briefing-title">
        <header>
          <p className="hiw-kicker">THE 60-SECOND BRIEFING</p>
          <h2 id="briefing-title">Five ideas carry the whole case.</h2>
        </header>
        <div className="chapter-cards">
          {CHAPTERS.map((chapter, index) => (
            <article key={chapter.index}>
              <span>{chapter.index}</span>
              <h3>{chapter.title}</h3>
              <p>{chapter.copy}</p>
              <i aria-hidden="true">0{index + 1}</i>
            </article>
          ))}
        </div>
      </section>

      <div id="deep-dive" className="deep-dive-boundary">
        <span>DEEP DIVE</span>
        <p>Product · Mathematics · Architecture · Security · Market</p>
      </div>

      <section className="hiw-section" id="player-loop">
        <SectionHeading
          eyebrow="01 · WHY THIS GAME EXISTS"
          title="AI characters are expressive. Their truth is not inherently trustworthy."
        >
          <p>
            Generative suspects can contradict facts, repeated prompting can leak a secret, and an
            operator could change the answer after seeing an accusation. Fully deterministic
            dialogue avoids those failures but gives up natural performance.
          </p>
          <strong>
            AI controls performance. Deterministic and cryptographic systems control truth.
          </strong>
        </SectionHeading>
        <div className="control-comparison">
          <div>
            <h3>AI may control</h3>
            {[
              'Wording and tone',
              'Emotion and evasion',
              'Approved leads',
              'Character performance',
              'Bounded testimony',
            ].map((item) => (
              <span key={item}>✓ {item}</span>
            ))}
          </div>
          <div>
            <h3>AI may not control</h3>
            {[
              'Selected hidden case',
              'Canonical evidence',
              'Candidate-mask transitions',
              'Disclosure authorization',
              'Proof acceptance or verdict',
            ].map((item) => (
              <span key={item}>◇ {item}</span>
            ))}
          </div>
        </div>
        <div className="player-journey">
          {[
            'Commit one case',
            'Explore four rooms',
            'Interrogate suspects',
            'Separate testimony from evidence',
            'Spend up to five warrants',
            'Commit one accusation',
            'Prove a binary verdict',
            'Authorize the reveal',
          ].map((item, index) => (
            <div key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item}</strong>
            </div>
          ))}
        </div>
        <div className="case-file-grid">
          <article>
            <h3>Four suspects</h3>
            <p>Ada Vale · Marcus Reed · Celeste Moreau · Theo Lin</p>
          </article>
          <article>
            <h3>Four rooms</h3>
            <p>Grand Gallery · Restoration Lab · Archive Vault · Rooftop Conservatory</p>
          </article>
          <article>
            <h3>Two weapons</h3>
            <p>Ceremonial Dagger · Bronze Bust</p>
          </article>
          <article>
            <h3>Two windows</h3>
            <p>Before the blackout · After the blackout</p>
          </article>
        </div>
      </section>

      <section className="hiw-section hiw-section-dark" id="truth-model">
        <SectionHeading
          eyebrow="02 · DISCLOSURE MATHEMATICS"
          title="A 64-bit universe with a deliberately narrow certified channel."
        >
          <p>
            Each case occupies one bit of a <code>u64</code>. Public observations and informal
            testimony can guide a theory, but only a registered binary predicate updates the
            canonical candidate mask.
          </p>
        </SectionHeading>
        <div className="truth-math-grid">
          <div className="formula-stack">
            <Formula label="Canonical case index">{String.raw`i(s,r,w,t)=(((4s+r)\cdot2+w)\cdot2+t)`}</Formula>
            <Formula label="Initial candidate mask">{String.raw`M_0=2^{64}-1=\mathtt{0xffffffffffffffff}`}</Formula>
            <Formula label="YES and NO branch masks">{String.raw`Y=M\land\mathrm{yesMask},\qquad N=M\land\mathrm{noMask}`}</Formula>
            <Formula label="Two survivor safety rule">{String.raw`\operatorname{popcount}(Y)\ge2\quad\land\quad\operatorname{popcount}(N)\ge2`}</Formula>
            <Formula label="Five resolved questions maximum">{String.raw`q_{\mathrm{resolved}}<5`}</Formula>
          </div>
          <CandidateGrid />
        </div>
        <div className="math-rules">
          {[
            'Both branches are checked before the secret is evaluated.',
            'Accepted certified queries consume one of five units.',
            'An implied answer with an empty branch should not call the prover or consume budget.',
            'Certified state cannot fall below two survivors.',
            'Informal testimony never updates the mask.',
          ].map((rule) => (
            <p key={rule}>
              <span>◆</span>
              {rule}
            </p>
          ))}
        </div>
        <details className="information-estimate">
          <summary>Optional information estimate</summary>
          <Formula>{String.raw`H_2(p)=-p\log_2p-(1-p)\log_2(1-p)`}</Formula>
          <p>
            Explanatory information estimate only. Enforcement uses candidate counts, not fractional
            entropy.
          </p>
        </details>
      </section>

      <section className="hiw-section" id="zero-knowledge">
        <SectionHeading
          eyebrow="03 · COMMITMENTS AND GROTH16"
          title="Prove the binary result without publishing the case or accusation."
        >
          <p>
            The intended live claim is: there exists a hidden case and accusation that open the
            public commitments, and the committed verdict bit equals one if and only if every
            accusation field matches the case.
          </p>
        </SectionHeading>
        <div className="commitment-objects">
          {[
            'Case commitment',
            'Accusation commitment',
            'Session-attempt domain binding',
            'Verdict commitment',
          ].map((item, index) => (
            <article key={item}>
              <span>0{index + 1}</span>
              <h3>{item}</h3>
              <p>
                {index === 0
                  ? 'Binds the ending selected before investigation.'
                  : index === 1
                    ? 'Binds one private, terminal theory.'
                    : index === 2
                      ? 'Prevents proof reuse across sessions or attempts.'
                      : 'Binds the proof result to one hidden bit.'}
              </p>
            </article>
          ))}
        </div>
        <div className="proof-split">
          <article>
            <p className="hiw-kicker">PUBLIC STATEMENT</p>
            <ul>
              <li>Case commitment</li>
              <li>Accusation commitment</li>
              <li>Session and attempt binding</li>
              <li>Verdict commitment</li>
            </ul>
          </article>
          <div className="proof-core">
            <Formula>{String.raw`v=\mathbf{1}\!\left[(s,r,w,t)=(\hat{s},\hat{r},\hat{w},\hat{t})\right]`}</Formula>
            <span>GROTH16</span>
            <Formula>{String.raw`\operatorname{Verify}(vk,\pi,x)=1`}</Formula>
          </div>
          <article>
            <p className="hiw-kicker">PRIVATE WITNESS</p>
            <ul>
              <li>Hidden case and salt</li>
              <li>Private accusation and salt</li>
              <li>Verdict bit and salt</li>
              <li>No losing solution output</li>
            </ul>
          </article>
        </div>
        <div className="proof-limits">
          <div>
            <h3>The proof establishes</h3>
            <p>
              Commitment openings, equality evaluation, verdict commitment, and the correct
              session/attempt binding.
            </p>
          </div>
          <div>
            <h3>It does not establish</h3>
            <p>
              Unbiased case randomness, truthful arbitrary dialogue, storage availability, or
              authorization to decrypt.
            </p>
          </div>
        </div>
        <p className="limitation-callout">
          <StatusBadge>Unavailable</StatusBadge>
          <strong>Development limitation:</strong> the live Groth16 path and production
          trusted-setup policy are not integrated on this branch. Commitment notation here is
          conceptual; no unconfirmed Poseidon encoding, field layout, or domain separator is
          published.
        </p>
      </section>

      <section className="hiw-section hiw-section-dark" id="architecture">
        <SectionHeading eyebrow="04 · ARCHITECTURE" title="Every system has one narrow authority.">
          <p>
            Player → Game UI → API / relayer → verified services → Sui terminal state → authorized
            binary reveal.
          </p>
        </SectionHeading>
        <button
          className="architecture-preview"
          type="button"
          onClick={() => setArchitectureOpen(true)}
          aria-label="Expand intended live architecture diagram"
        >
          <img
            src="/assets/architecture/alibi-system.svg"
            alt="Intended live architecture for The Last Alibi, showing the player, game UI, orchestration, Sui, zero knowledge, 0G, Walrus, Seal, and World AgentKit trust boundaries."
          />
          <span>Expand architecture ↗</span>
        </button>
        <p className="architecture-caption">
          <StatusBadge>Designed</StatusBadge> This repository diagram describes the intended live
          architecture and fail-closed boundaries. It is not evidence that partner services are
          deployed in this branch.
        </p>
        <div className="table-scroll">
          <table>
            <caption>Authority matrix</caption>
            <thead>
              <tr>
                <th>Component</th>
                <th>Authoritative for</th>
                <th>Not authoritative for</th>
              </tr>
            </thead>
            <tbody>
              {AUTHORITY_ROWS.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell) => (
                    <td key={cell}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="hiw-section" id="trust-boundaries">
        <SectionHeading
          eyebrow="05 · LOAD-BEARING ROLES"
          title="Infrastructure stays underneath the game—and fails closed."
        >
          <p>
            No integration silently degrades into a mock or conventional fallback while presenting
            itself as live.
          </p>
        </SectionHeading>
        <div className="partner-roles">
          <article>
            <span>SUI</span>
            <h3>Canonical game state</h3>
            <p>
              Designed to hold commitments, candidate mask, counters, nonces, proof results,
              permits, terminal state, verdict commitment, and Blob ID; verify the proof; and
              prevent replay or mutation.
            </p>
          </article>
          <article>
            <span>0G</span>
            <h3>Verified character performance</h3>
            <p>
              Designed for bounded, schema-checked suspect inference. It must never determine
              evidence, candidate transitions, or the verdict.
            </p>
          </article>
          <article>
            <span>WALRUS</span>
            <h3>Encrypted artifact persistence</h3>
            <p>
              Designed to store the exact encrypted verdict capsule. A missing or mismatched
              content-derived Blob ID blocks progression.
            </p>
          </article>
          <article>
            <span>SEAL</span>
            <h3>Policy-controlled reveal</h3>
            <p>
              Designed to release decryption only to the recorded player after terminal Sui state
              and exact commitment/session checks.
            </p>
          </article>
          <article>
            <span>WORLD</span>
            <h3>Human-backed ranked attempts</h3>
            <p>
              Designed to grant a scarce, scoped permit bound to player, agent, level, version,
              nonce, and expiry—not a decorative badge.
            </p>
          </article>
        </div>
        <div className="table-scroll">
          <table>
            <caption>Threat and control model</caption>
            <thead>
              <tr>
                <th>Threat</th>
                <th>Control</th>
              </tr>
            </thead>
            <tbody>
              {THREAT_ROWS.map(([threat, control]) => (
                <tr key={threat}>
                  <td>{threat}</td>
                  <td>{control}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="hiw-section hiw-section-dark" id="market">
        <SectionHeading
          eyebrow="06 · PRODUCT-MARKET THESIS"
          title="The opportunity is not “blockchain gaming.” It is trustworthy AI-native play."
        >
          <p>
            Players come for expressive characters and fair deduction. Studios need generative
            characters without giving models, operators, or repeated prompts authority over
            canonical state.
          </p>
        </SectionHeading>
        <div className="market-columns">
          <article>
            <p className="hiw-kicker">PRIMARY PLAYER</p>
            <h3>Mystery and puzzle fans</h3>
            <p>
              Deduction players, escape-room fans, and people attracted to expressive AI characters.
              No prior blockchain knowledge is assumed.
            </p>
          </article>
          <article>
            <p className="hiw-kicker">FUTURE CUSTOMER</p>
            <h3>Narrative creators and studios</h3>
            <p>
              AI-character platforms, puzzle creators, and UGC platforms that need hidden-state
              integrity and bounded disclosure.
            </p>
          </article>
          <article>
            <p className="hiw-kicker">PRODUCT WEDGE</p>
            <h3>One excellent browser mystery</h3>
            <p>
              A polished case that demonstrates the trust model while remaining fun without
              understanding the infrastructure.
            </p>
          </article>
        </div>
        <div className="market-path">
          <span>Playable mystery</span>
          <i>→</i>
          <span>Paid case library</span>
          <i>→</i>
          <span>Creator tooling</span>
          <i>→</i>
          <span>Studio trust infrastructure</span>
        </div>
        <blockquote>
          We have demonstrated a product thesis and technical feasibility. Product-market fit must
          be earned through repeated player use and creator adoption.
        </blockquote>
      </section>

      <section className="hiw-section" id="gtm">
        <SectionHeading
          eyebrow="07 · GO-TO-MARKET"
          title="Prove play first. Earn infrastructure demand later."
        >
          <p>
            The roadmap starts with frictionless Practice mode and player behavior—not a token or a
            marketplace.
          </p>
        </SectionHeading>
        <div className="roadmap">
          <article>
            <span>PHASE 1</span>
            <h3>Prove the game loop</h3>
            <p>
              Public browser release, one polished case, hackathon and browser-game distribution,
              completion and trust-comprehension tests.
            </p>
          </article>
          <article>
            <span>PHASE 2</span>
            <h3>Build repeat play</h3>
            <p>
              Premium case packs, seasonal mysteries, streamer challenges, and non-spoiler
              completion receipts.
            </p>
          </article>
          <article>
            <span>PHASE 3</span>
            <h3>Enable creators</h3>
            <p>
              Case compiler, predicate safety, reusable schemas, managed proof infrastructure,
              analytics, and publishing workflow.
            </p>
          </article>
          <article>
            <span>PHASE 4</span>
            <h3>Serve studios</h3>
            <p>
              Hosted integrity APIs for committed narrative state, bounded disclosure, private
              verdicts, and controlled reveals.
            </p>
          </article>
        </div>
        <div className="business-grid">
          <article>
            <h3>B2C</h3>
            <p>Premium case packs or a curated mystery library. Never sell deduction advantages.</p>
          </article>
          <article>
            <h3>B2B</h3>
            <p>
              Hosted infrastructure, usage-based orchestration, licensing, and integration support.
            </p>
          </article>
          <article>
            <h3>Possible moat</h3>
            <p>
              Validated case compilation, cross-language commitment tooling, creator workflow,
              tested cases, and integration experience—not blockchain alone.
            </p>
          </article>
        </div>
        <details className="pmf-metrics" open>
          <summary>How we will test the thesis</summary>
          <div>
            {[
              'Activation',
              'Completion',
              'Engagement',
              'Trust comprehension',
              'Another-case intent',
              'Retention',
              'Paid conversion',
              'Creator demand',
              'External integration time',
            ].map((metric) => (
              <span key={metric}>{metric}</span>
            ))}
          </div>
          <p>PMF is not a slide. It is repeat use, retention, payment, and creator adoption.</p>
        </details>
      </section>

      <section className="hiw-section hiw-section-dark" id="status">
        <SectionHeading
          eyebrow="08 · BUILD STATUS & LIMITATIONS"
          title="Playable now. Honest about what is not live yet."
        >
          <p>
            This matrix is based on evidence in the current branch. It does not infer a capability
            from a product requirement or a diagram.
          </p>
        </SectionHeading>
        <div className="status-matrix">
          {CAPABILITIES.map(([capability, status, note]) => (
            <article key={capability}>
              <div>
                <h3>{capability}</h3>
                <StatusBadge>{status}</StatusBadge>
              </div>
              <p>{note}</p>
            </article>
          ))}
        </div>
        <div className="known-limits">
          <h3>Known limitations</h3>
          <ul>
            <li>Practice is fixture-backed and produces no live partner receipt.</li>
            <li>The MVP contains one complete 64-case mystery.</li>
            <li>Production trusted setup and external deployments are not complete.</li>
            <li>Case commitment does not by itself prove unbiased randomness.</li>
            <li>Ranked mode remains unavailable.</li>
            <li>
              This checkout is missing the repository’s pinned sui-pilot documentation prerequisite,
              so ecosystem API validation is degraded until <code>scripts/setup-sui-pilot.ps1</code>{' '}
              is run.
            </li>
          </ul>
        </div>
        <div className="deliberate-exclusions">
          <h3>Deliberately not built</h3>
          {[
            'No speculative economy',
            'No gameplay NFTs',
            'No token-gated core mystery',
            'No trading dashboard',
            'No purchasable advantage',
            'No losing-solution leakage',
            'No AI authority over truth',
            'No generic agent shell pretending to be a game',
          ].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <footer className="hiw-footer">
        <img src="/assets/brand/alibi-logo-mark.png" width="1024" height="1024" alt="" />
        <p>Players should notice a better mystery before they notice a blockchain.</p>
        <Link href="/">
          Begin Investigation <span>→</span>
        </Link>
      </footer>

      {presentationOpen ? <Presentation onClose={() => setPresentationOpen(false)} /> : null}
      {architectureOpen ? (
        <ArchitectureLightbox onClose={() => setArchitectureOpen(false)} />
      ) : null}
    </main>
  );
}
