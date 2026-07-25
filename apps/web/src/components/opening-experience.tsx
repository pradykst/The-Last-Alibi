/* eslint-disable @next/next/no-img-element -- Approved cinematic art is preprocessed and uses explicit intrinsic dimensions. */
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { brandAssets, interfaceAssets, proofAssets, screenAssets } from '../assets/game-assets';
import { GUARANTEES } from '../lib/page-content';

import { advanceOpeningPhase, getCreationHeading, getModeAvailability } from './game-ui-state';
import type { OpeningPhase } from './game-ui-state';
import { useDialogFocusTrap } from './use-dialog-focus-trap';
export type MotionPreference = 'system' | 'reduce';
export type SessionCreationStage = 'idle' | 'preparing' | 'committing' | 'confirmed' | 'failed';

type OpeningExperienceProps = {
  runtimeLabel: string;
  runtimeMode: 'fixture' | 'live' | null;
  runtimeAvailable: boolean;
  resumable: boolean;
  resumeChecking: boolean;
  creationStage: SessionCreationStage;
  error: string | null;
  motionPreference: MotionPreference;
  onMotionPreferenceChange: (preference: MotionPreference) => void;
  onBegin: () => Promise<void>;
  onContinue: () => void;
};

type MenuScreen = 'menu' | 'mode' | 'briefing' | 'settings' | 'technical' | 'creating';

function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button className="icon-button" type="button" aria-label={label} onClick={onClick}>
      <span aria-hidden="true">×</span>
    </button>
  );
}

function OpeningDialog({
  title,
  eyebrow,
  children,
  onClose,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogFocusTrap(dialogRef, onClose);

  return (
    <div className="opening-modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="opening-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <CloseButton onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

export default function OpeningExperience({
  runtimeLabel,
  runtimeMode,
  runtimeAvailable,
  resumable,
  resumeChecking,
  creationStage,
  error,
  motionPreference,
  onMotionPreferenceChange,
  onBegin,
  onContinue,
}: OpeningExperienceProps) {
  const [introPhase, setIntroPhase] = useState<OpeningPhase>('black');
  const [screen, setScreen] = useState<MenuScreen>(
    creationStage === 'failed' ? 'creating' : 'menu',
  );
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const reduceMotion = motionPreference === 'reduce' || systemReducedMotion;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const modeAvailability = getModeAvailability(runtimeMode);

  useEffect(() => {
    if (reduceMotion) {
      const readyTimer = window.setTimeout(
        () => setIntroPhase((current) => advanceOpeningPhase(current, 'reduce-motion')),
        0,
      );
      return () => window.clearTimeout(readyTimer);
    }
    const titleTimer = window.setTimeout(
      () => setIntroPhase((current) => advanceOpeningPhase(current, 'title-timer')),
      420,
    );
    const menuTimer = window.setTimeout(
      () => setIntroPhase((current) => advanceOpeningPhase(current, 'menu-timer')),
      3300,
    );
    return () => {
      window.clearTimeout(titleTimer);
      window.clearTimeout(menuTimer);
    };
  }, [reduceMotion]);

  const beginPractice = async () => {
    setScreen('creating');
    await onBegin();
  };

  const closeOverlay = () => setScreen('menu');

  return (
    <main
      className="opening-experience"
      data-intro-phase={introPhase}
      data-motion={reduceMotion ? 'reduced' : 'full'}
    >
      <div className="opening-ambient" aria-hidden="true">
        <img
          className="opening-key-art"
          src={screenAssets.landing}
          width="1920"
          height="1080"
          alt=""
          fetchPriority="high"
        />
        <div className="museum-arch museum-arch-left" />
        <div className="museum-arch museum-arch-right" />
        <p className="opening-status-copy">
          The Last Alibi ·{' '}
          {runtimeMode === 'fixture'
            ? 'Fixture mode · Begin investigation from the main menu.'
            : 'Live mode · Runtime capabilities unavailable.'}
        </p>
        <div className="museum-floor" />
        <div className="museum-clock">
          <span />
        </div>
        <div className="museum-figure" />
      </div>

      <div className="opening-black-frame" aria-hidden={introPhase !== 'black'}>
        <span className="loading-mark" aria-hidden="true" />
        <p>Opening the museum</p>
      </div>

      <section className="title-reveal" aria-hidden={introPhase !== 'title'}>
        <p className="title-kicker">A mystery in four rooms</p>
        <div className="title-lockup">
          <img
            className="title-logo-mark"
            src={brandAssets.logoMark}
            width="1024"
            height="1024"
            alt=""
          />
          <img
            className="title-wordmark"
            src={brandAssets.wordmark}
            width="745"
            height="142"
            alt="The Last Alibi"
          />
        </div>
        <div className="case-title-card">
          <span>Case 001</span>
          <strong>The Last Exhibit</strong>
          <p>
            Forty-seven seconds of darkness. Four witnesses. One story that cannot be rewritten.
          </p>
        </div>
      </section>

      <button
        className="skip-intro"
        type="button"
        hidden={introPhase === 'ready'}
        onClick={() => setIntroPhase((current) => advanceOpeningPhase(current, 'skip'))}
      >
        Skip opening
      </button>

      <section
        className="main-menu"
        aria-label="Main menu"
        aria-hidden={introPhase !== 'ready' || screen !== 'menu'}
      >
        <div className="menu-brand">
          <p className="title-kicker">Every suspect can lie. The truth cannot.</p>
          <div className="menu-brand-lockup">
            <img
              className="menu-logo-mark"
              src={brandAssets.logoMark}
              width="1024"
              height="1024"
              alt=""
            />
            <img
              className="menu-wordmark"
              src={brandAssets.wordmark}
              width="745"
              height="142"
              alt="The Last Alibi"
            />
          </div>
          <div className="case-rule" aria-hidden="true">
            <span />
            <i />
            <span />
          </div>
          <p className="menu-case">Case 001 · The Last Exhibit</p>
        </div>

        <nav className="menu-actions" aria-label="Game options">
          <button
            className="menu-primary"
            type="button"
            disabled={introPhase !== 'ready'}
            onClick={() => setScreen('mode')}
          >
            <span aria-hidden="true">01</span>
            Begin Investigation
          </button>
          {resumable ? (
            <button type="button" onClick={onContinue}>
              <span aria-hidden="true">02</span>
              Continue Investigation
            </button>
          ) : null}
          <button type="button" onClick={() => setScreen('settings')}>
            <span aria-hidden="true">{resumable ? '03' : '02'}</span>
            Settings
          </button>
          <button className="menu-technical" type="button" onClick={() => setScreen('technical')}>
            <span aria-hidden="true">{resumable ? '04' : '03'}</span>
            Technical Details
          </button>
          {resumeChecking ? (
            <p className="resume-check">Checking for a saved investigation…</p>
          ) : null}
        </nav>

        <div className="runtime-corner" data-state={runtimeAvailable ? 'available' : 'blocked'}>
          <span aria-hidden="true" />
          {runtimeLabel} runtime
        </div>
      </section>

      {introPhase === 'ready' && screen === 'mode' ? (
        <section className="opening-panel mode-panel" aria-labelledby="mode-title">
          <button className="back-button" type="button" onClick={closeOverlay}>
            <span aria-hidden="true">←</span> Main menu
          </button>
          <div className="panel-heading">
            <p className="eyebrow">Choose your investigation</p>
            <h1 id="mode-title">How will you enter the museum?</h1>
            <p>
              Practice uses the existing local fixture case. Ranked play requires live canonical
              services and never falls back to a fixture.
            </p>
          </div>
          <div className="mode-options">
            <button
              className="mode-card mode-practice"
              type="button"
              disabled={!runtimeAvailable || modeAvailability.practice !== 'available'}
              onClick={() => setScreen('briefing')}
            >
              <span className="mode-number" aria-hidden="true">
                I
              </span>
              <span className="mode-copy">
                <small>Available in fixture runtime</small>
                <strong>Practice Investigation</strong>
                <span>
                  A complete local case using scripted testimony and certified fixture simulations.
                </span>
              </span>
              <span className="mode-arrow" aria-hidden="true">
                →
              </span>
            </button>
            <div className="mode-card mode-ranked" aria-disabled="true">
              <span className="mode-number" aria-hidden="true">
                <img
                  src={interfaceAssets.rankedAgent}
                  width="1024"
                  height="1024"
                  alt=""
                  loading="lazy"
                />
              </span>
              <span className="mode-copy">
                <small>Unavailable in this runtime</small>
                <strong>Ranked Agent</strong>
                <span>
                  Requires the future live Sui, proof, partner, and eligibility path. No fixture
                  fallback is permitted.
                </span>
              </span>
              <span className="unavailable-seal">Unavailable</span>
            </div>
          </div>
          {runtimeMode !== 'fixture' ? (
            <p className="mode-warning" role="status">
              <span aria-hidden="true">!</span>
              Practice cannot start because this runtime is not an available fixture runtime.
            </p>
          ) : null}
        </section>
      ) : null}

      {introPhase === 'ready' && screen === 'briefing' ? (
        <section className="opening-panel briefing-panel" aria-labelledby="briefing-title">
          <button className="back-button" type="button" onClick={() => setScreen('mode')}>
            <span aria-hidden="true">←</span> Mode selection
          </button>
          <div className="briefing-layout">
            <div className="briefing-copy">
              <img
                className="briefing-key-art"
                src={screenAssets.caseIntroduction}
                width="1920"
                height="1080"
                alt="The museum during the private exhibition"
                loading="lazy"
              />
              <p className="eyebrow">Case file · 001</p>
              <h1 id="briefing-title">The Last Exhibit</h1>
              <p className="briefing-lede">
                During a private evening exhibition, the museum curator is killed. A security
                blackout fractures the timeline.
              </p>
              <p>
                Interview Ada Vale, Marcus Reed, Celeste Moreau, and Theo Lin. Search the Grand
                Gallery, Restoration Lab, Archive Vault, and Rooftop Conservatory. When your theory
                is complete, accuse once.
              </p>
              <div className="case-parameters" aria-label="Case parameters">
                <span>
                  <strong>4</strong> suspects
                </span>
                <span>
                  <strong>4</strong> rooms
                </span>
                <span>
                  <strong>2</strong> weapons
                </span>
                <span>
                  <strong>2</strong> time windows
                </span>
              </div>
            </div>
            <aside className="guarantee-dossier" aria-label="The three guarantees">
              <p className="eyebrow">The rules of truth</p>
              {GUARANTEES.map((guarantee) => (
                <article key={guarantee.number}>
                  <span aria-hidden="true">{guarantee.number}</span>
                  <div>
                    <h2>{guarantee.title}</h2>
                    <p>{guarantee.detail}</p>
                  </div>
                </article>
              ))}
              <div className="fixture-honesty" role="note">
                <span aria-hidden="true">F</span>
                <p>
                  <strong>Practice is fixture-backed.</strong>
                  No wallet, live partner verification, Sui transaction, or production proof is
                  claimed.
                </p>
              </div>
              <button className="primary-action" type="button" onClick={() => void beginPractice()}>
                Prepare the case
                <span aria-hidden="true">→</span>
              </button>
            </aside>
          </div>
        </section>
      ) : null}

      {(introPhase === 'ready' || creationStage === 'failed') && screen === 'creating' ? (
        <section className="session-creation" aria-labelledby="creation-title">
          <div className="commitment-animation" aria-hidden="true">
            <img
              src={creationStage === 'failed' ? proofAssets.failed : proofAssets.pending}
              width="1024"
              height="1024"
              alt=""
            />
            <span />
            <span />
            <span />
          </div>
          <p className="eyebrow">Practice investigation</p>
          <h1 id="creation-title">{getCreationHeading(creationStage)}</h1>
          <ol className="creation-steps">
            <li data-state={creationStage === 'preparing' ? 'active' : 'complete'}>
              <span aria-hidden="true">1</span>
              <div>
                <strong>Preparing case</strong>
                <small>Creating a bounded fixture session</small>
              </div>
            </li>
            <li
              data-state={
                creationStage === 'committing'
                  ? 'active'
                  : creationStage === 'confirmed'
                    ? 'complete'
                    : 'waiting'
              }
            >
              <span aria-hidden="true">2</span>
              <div>
                <strong>Committing case</strong>
                <small>Generating the local fixture commitment</small>
              </div>
            </li>
            <li data-state={creationStage === 'confirmed' ? 'complete' : 'waiting'}>
              <span aria-hidden="true">3</span>
              <div>
                <strong>Confirmed</strong>
                <small>Ready to enter the museum</small>
              </div>
            </li>
          </ol>
          {creationStage === 'failed' ? (
            <div className="creation-error" role="alert">
              <strong>The museum could not be opened.</strong>
              <p>{error ?? 'The fixture session could not be created.'}</p>
              <div>
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => void beginPractice()}
                >
                  Try again
                </button>
                <button type="button" onClick={closeOverlay}>
                  Return to menu
                </button>
              </div>
            </div>
          ) : (
            <p className="creation-status" role="status" aria-live="polite">
              {creationStage === 'confirmed'
                ? 'Local fixture commitment confirmed. Entering the Grand Gallery.'
                : 'Keep this window open while the case is prepared.'}
            </p>
          )}
        </section>
      ) : null}

      {introPhase === 'ready' && screen === 'settings' ? (
        <OpeningDialog title="Settings" eyebrow="Player preferences" onClose={closeOverlay}>
          <fieldset className="settings-group">
            <legend>Motion</legend>
            <p>Reduce cinematic movement while keeping every state change visible.</p>
            <label>
              <input
                type="radio"
                name="motion"
                checked={motionPreference === 'system'}
                onChange={() => onMotionPreferenceChange('system')}
              />
              <span>
                <strong>Follow system</strong>
                Use your device’s reduced-motion preference.
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="motion"
                checked={motionPreference === 'reduce'}
                onChange={() => onMotionPreferenceChange('reduce')}
              />
              <span>
                <strong>Reduce motion</strong>
                Remove nonessential pans, fades, and ambient loops.
              </span>
            </label>
          </fieldset>
          <div className="audio-unavailable" role="note">
            <span aria-hidden="true">♪</span>
            <p>
              <strong>Audio unavailable</strong>
              No approved music or sound-effect assets are present in this build.
            </p>
          </div>
        </OpeningDialog>
      ) : null}

      {introPhase === 'ready' && screen === 'technical' ? (
        <OpeningDialog
          title="Technical details"
          eyebrow="Secondary information"
          onClose={closeOverlay}
        >
          <img
            className="technical-drawer-mark"
            src={interfaceAssets.technicalDrawer}
            width="1024"
            height="1024"
            alt=""
            loading="lazy"
          />
          <dl className="technical-list">
            <div>
              <dt>Runtime</dt>
              <dd>{runtimeLabel}</dd>
            </div>
            <div>
              <dt>Practice behavior</dt>
              <dd>{runtimeMode === 'fixture' ? 'Available · fixture-backed' : 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Ranked behavior</dt>
              <dd>Unavailable · live integrations not present</dd>
            </div>
            <div>
              <dt>Commitment policy</dt>
              <dd>Local fixture commitment only</dd>
            </div>
          </dl>
          <p className="technical-disclaimer">
            This build does not fabricate transaction hashes, proof receipts, provider addresses,
            partner response IDs, explorer links, or onchain confirmation.
          </p>
        </OpeningDialog>
      ) : null}
    </main>
  );
}
