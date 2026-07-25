'use client';

import {
  accusationResponseSchema,
  createSessionResponseSchema,
  exploreResponseSchema,
  gameErrorResponseSchema,
  testimonyResponseSchema,
  getSessionResponseSchema,
  warrantResponseSchema,
} from '@alibi/protocol';
import type {
  AccusationResponse,
  PublicGameContent,
  PublicGameSession,
  RoomId,
  SuspectId,
  TimeWindowId,
  WeaponId,
} from '@alibi/protocol';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { z } from 'zod';

import { separateEvidence, submissionsAreDisabled } from './game-shell-helpers';
import type { PendingAction } from './game-shell-helpers';
import OpeningExperience from './opening-experience';
import type { MotionPreference, SessionCreationStage } from './opening-experience';

type GameShellProps = {
  runtimeLabel: string;
  runtimeMode?: 'fixture' | 'live' | null;
  runtimeAvailable: boolean;
};

type Hypothesis = {
  suspectId: SuspectId | '';
  roomId: RoomId | '';
  weaponId: WeaponId | '';
  timeWindowId: TimeWindowId | '';
};

class PublicGameRequestError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PublicGameRequestError';
  }
}

async function requestGame<TSchema extends z.ZodType>(
  url: string,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.output<TSchema>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    throw new PublicGameRequestError(
      'NETWORK_FAILURE',
      'The museum connection failed. Try the action again.',
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PublicGameRequestError(
      'MALFORMED_RESPONSE',
      'The server returned an unreadable response.',
    );
  }

  if (!response.ok) {
    const failure = gameErrorResponseSchema.safeParse(body);
    if (!failure.success) {
      throw new PublicGameRequestError(
        'MALFORMED_RESPONSE',
        'The server returned an invalid error response.',
      );
    }
    throw new PublicGameRequestError(failure.data.error.code, failure.data.error.message);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new PublicGameRequestError(
      'MALFORMED_RESPONSE',
      'The server response did not match the public game protocol.',
    );
  }
  return parsed.data;
}

function shortCommitment(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function TerminalView({
  result,
  onRestart,
}: {
  result: 'YES' | 'NO';
  onRestart: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="terminal-screen">
      <p className="eyebrow">Fixture verdict</p>
      <h1 ref={headingRef} tabIndex={-1}>
        {result}
      </h1>
      <p>
        The accusation is terminal. This binary result was evaluated locally in fixture mode; no Sui
        transaction, proof, Walrus record, or Seal release occurred.
      </p>
      <button className="primary-action" type="button" onClick={onRestart}>
        Begin a new investigation
      </button>
    </main>
  );
}

export function Intro({
  runtimeLabel,
  runtimeAvailable,
  pending,
  error,
  onBegin,
}: {
  runtimeLabel: string;
  runtimeAvailable: boolean;
  pending: boolean;
  error: string | null;
  onBegin: () => void;
}) {
  return (
    <main className="intro-shell">
      <header className="intro-header">
        <span className="wordmark">TLA / 02</span>
        <span className="mode-badge" data-mode={runtimeAvailable ? 'fixture' : 'blocked'}>
          <span aria-hidden="true" />
          {runtimeLabel}
        </span>
      </header>
      <section className="intro-stage" aria-labelledby="intro-title">
        <div>
          <p className="eyebrow">The Last Exhibit · Fixture investigation</p>
          <h1 id="intro-title">The Last Alibi</h1>
          <p className="intro-pitch">
            The curator is dead. The museum went dark for forty-seven seconds. Question four
            suspects, inspect four rooms, and spend your five certified disclosures carefully.
          </p>
        </div>
        <aside className="case-brief" aria-label="Case briefing">
          <p className="case-number">Case / 001</p>
          <h2>A private exhibition. Sixty-four possible truths.</h2>
          <p>
            Scripted testimony can misdirect. Only accepted binary disclosures reduce the public
            candidate set.
          </p>
          <div className="fixture-warning" role="note">
            <strong>Fixture mode</strong>
            <span>No wallet. No live partner verification. Sessions reset with the server.</span>
          </div>
          <button className="primary-action" type="button" disabled={pending} onClick={onBegin}>
            {pending ? 'Opening the museum…' : 'Begin investigation'}
          </button>
          {error === null ? null : (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </aside>
      </section>
    </main>
  );
}

const SAVED_SESSION_KEY = 'the-last-alibi.fixture-session.v1';
const MOTION_PREFERENCE_KEY = 'the-last-alibi.motion.v1';

type SavedFixtureSession = {
  sessionId: string;
  content: PublicGameContent;
};

export default function GameShell({
  runtimeLabel,
  runtimeAvailable,
  runtimeMode = runtimeLabel === 'Fixture' ? 'fixture' : null,
}: GameShellProps) {
  const [session, setSession] = useState<PublicGameSession | null>(null);
  const [content, setContent] = useState<PublicGameContent | null>(null);
  const [resumableSession, setResumableSession] = useState<{
    session: PublicGameSession;
    content: PublicGameContent;
  } | null>(null);
  const [resumeChecking, setResumeChecking] = useState(true);
  const [creationStage, setCreationStage] = useState<SessionCreationStage>('idle');
  const [motionPreference, setMotionPreference] = useState<MotionPreference>('system');
  const [selectedRoomId, setSelectedRoomId] = useState<RoomId>('room_gallery');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('Ready to begin.');
  const [predicateDimension, setPredicateDimension] = useState<
    'suspect' | 'room' | 'weapon' | 'time'
  >('suspect');
  const [confirmTerminal, setConfirmTerminal] = useState(false);
  const [hypothesis, setHypothesis] = useState<Hypothesis>({
    suspectId: '',
    roomId: '',
    weaponId: '',
    timeWindowId: '',
  });
  useEffect(() => {
    const savedMotion = window.localStorage.getItem(MOTION_PREFERENCE_KEY);
    if (savedMotion === 'reduce' || savedMotion === 'system') {
      window.queueMicrotask(() => setMotionPreference(savedMotion));
    }

    if (runtimeMode !== 'fixture') {
      window.queueMicrotask(() => setResumeChecking(false));
      return;
    }

    const rawSaved = window.localStorage.getItem(SAVED_SESSION_KEY);
    if (rawSaved === null) {
      window.queueMicrotask(() => setResumeChecking(false));
      return;
    }

    let saved: SavedFixtureSession;
    try {
      saved = JSON.parse(rawSaved) as SavedFixtureSession;
    } catch {
      window.localStorage.removeItem(SAVED_SESSION_KEY);
      window.queueMicrotask(() => setResumeChecking(false));
      return;
    }

    void requestGame(
      `/api/game/sessions/${encodeURIComponent(saved.sessionId)}`,
      getSessionResponseSchema,
    )
      .then((response) => {
        if (response.session.state === 'active') {
          setResumableSession({ session: response.session, content: saved.content });
        } else {
          window.localStorage.removeItem(SAVED_SESSION_KEY);
        }
      })
      .catch(() => window.localStorage.removeItem(SAVED_SESSION_KEY))
      .finally(() => setResumeChecking(false));
  }, [runtimeMode]);

  const saveSession = (nextSession: PublicGameSession, nextContent: PublicGameContent) => {
    if (nextSession.state !== 'active') {
      window.localStorage.removeItem(SAVED_SESSION_KEY);
      return;
    }
    window.localStorage.setItem(
      SAVED_SESSION_KEY,
      JSON.stringify({ sessionId: nextSession.sessionId, content: nextContent }),
    );
  };

  const changeMotionPreference = (preference: MotionPreference) => {
    setMotionPreference(preference);
    window.localStorage.setItem(MOTION_PREFERENCE_KEY, preference);
  };

  const begin = async () => {
    setPendingAction('create');
    setCreationStage('preparing');
    setError(null);
    setAnnouncement('Preparing a new fixture session.');
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
      setCreationStage('committing');
      setAnnouncement('Generating a local fixture commitment.');
      const response = await requestGame('/api/game/sessions', createSessionResponseSchema, {
        method: 'POST',
      });
      setSelectedRoomId(response.content.manifest.rooms[0]!.id);
      saveSession(response.session, response.content);
      setCreationStage('confirmed');
      setAnnouncement('Investigation opened with 64 candidate cases.');
      await new Promise<void>((resolve) => window.setTimeout(resolve, 520));
      setSession(response.session);
      setContent(response.content);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'The investigation could not be started.',
      );
      setCreationStage('failed');
      setAnnouncement('Session creation failed.');
    } finally {
      setPendingAction(null);
    }
  };

  const runSessionAction = async <T,>(
    action: Exclude<PendingAction, 'create' | null>,
    operation: () => Promise<T>,
    apply: (response: T) => void,
    pendingMessage: string,
    successMessage: string,
  ) => {
    if (pendingAction !== null) {
      return;
    }
    setPendingAction(action);
    setError(null);
    setAnnouncement(pendingMessage);
    try {
      const response = await operation();
      apply(response);
      setAnnouncement(successMessage);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : 'The action could not be completed.',
      );
      setAnnouncement('The action was not accepted.');
    } finally {
      setPendingAction(null);
    }
  };

  const selectRoom = (roomId: RoomId) => {
    if (session === null) {
      return;
    }
    setSelectedRoomId(roomId);
    void runSessionAction(
      'explore',
      () =>
        requestGame(`/api/game/sessions/${session.sessionId}/explore`, exploreResponseSchema, {
          method: 'POST',
          body: JSON.stringify({ roomId }),
        }),
      (response) => setSession(response.session),
      'Entering the selected room.',
      'Room explored. Candidate count unchanged.',
    );
  };

  const collectObservation = (observationId: string) => {
    if (session === null) {
      return;
    }
    void runSessionAction(
      'observe',
      () =>
        requestGame(`/api/game/sessions/${session.sessionId}/explore`, exploreResponseSchema, {
          method: 'POST',
          body: JSON.stringify({ roomId: selectedRoomId, observationId }),
        }),
      (response) => setSession(response.session),
      'Recording a public observation.',
      'Public observation recorded. Candidate count unchanged.',
    );
  };

  const requestTestimony = (suspectId: SuspectId, questionId: string) => {
    if (session === null) {
      return;
    }
    void runSessionAction(
      'testimony',
      () =>
        requestGame(`/api/game/sessions/${session.sessionId}/testimony`, testimonyResponseSchema, {
          method: 'POST',
          body: JSON.stringify({ suspectId, questionId }),
        }),
      (response) => setSession(response.session),
      'Requesting scripted fixture testimony.',
      'Unverified testimony added. Candidate count unchanged.',
    );
  };

  const requestWarrant = (predicateId: string) => {
    if (session === null) {
      return;
    }
    void runSessionAction(
      'warrant',
      () =>
        requestGame(`/api/game/sessions/${session.sessionId}/warrants`, warrantResponseSchema, {
          method: 'POST',
          body: JSON.stringify({ predicateId }),
        }),
      (response) => setSession(response.session),
      'Evaluating registered disclosure safety.',
      'Fixture certified simulation accepted. Candidate count updated.',
    );
  };

  const submitAccusation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      session === null ||
      hypothesis.suspectId === '' ||
      hypothesis.roomId === '' ||
      hypothesis.weaponId === '' ||
      hypothesis.timeWindowId === '' ||
      !confirmTerminal
    ) {
      setError('Complete every accusation field and confirm the terminal action.');
      return;
    }

    void runSessionAction<AccusationResponse>(
      'accusation',
      () =>
        requestGame(
          `/api/game/sessions/${session.sessionId}/accusations`,
          accusationResponseSchema,
          {
            method: 'POST',
            body: JSON.stringify({
              ...hypothesis,
              confirmTerminal: true,
            }),
          },
        ),
      (response) => setSession(response.session),
      'Submitting the terminal fixture accusation.',
      'Fixture verdict received.',
    );
  };

  const restart = () => {
    window.localStorage.removeItem(SAVED_SESSION_KEY);
    setSession(null);
    setContent(null);
    setResumableSession(null);
    setError(null);
    setPendingAction(null);
    setCreationStage('idle');
    setConfirmTerminal(false);
    setHypothesis({
      suspectId: '',
      roomId: '',
      weaponId: '',
      timeWindowId: '',
    });
    setAnnouncement('Ready to begin a new investigation.');
  };

  if (session?.state === 'terminal') {
    return <TerminalView result={session.terminalResult} onRestart={restart} />;
  }

  if (session === null || content === null) {
    return (
      <OpeningExperience
        runtimeLabel={runtimeLabel}
        runtimeMode={runtimeMode}
        runtimeAvailable={runtimeAvailable}
        resumable={resumableSession !== null}
        resumeChecking={resumeChecking}
        creationStage={creationStage}
        error={error}
        motionPreference={motionPreference}
        onMotionPreferenceChange={changeMotionPreference}
        onBegin={begin}
        onContinue={() => {
          if (resumableSession === null) return;
          setSession(resumableSession.session);
          setContent(resumableSession.content);
          setSelectedRoomId(
            resumableSession.session.exploredRoomIds.at(-1) ??
              resumableSession.content.manifest.rooms[0]!.id,
          );
          setAnnouncement('Saved fixture investigation resumed.');
        }}
      />
    );
  }

  const selectedRoom = content.manifest.rooms.find((room) => room.id === selectedRoomId)!;
  const roomSuspect = content.manifest.suspects.find(
    (suspect) => suspect.primaryRoomId === selectedRoomId,
  )!;
  const suspectQuestions = content.testimonyQuestions.filter(
    (question) => question.suspectId === roomSuspect.id,
  );
  const activePredicates = session.predicateStatuses.filter(
    (predicate) => predicate.dimension === predicateDimension,
  );
  const hypothesisLabels = [
    content.manifest.suspects.find((entry) => entry.id === hypothesis.suspectId)?.name,
    content.manifest.rooms.find((entry) => entry.id === hypothesis.roomId)?.name,
    content.manifest.weapons.find((entry) => entry.id === hypothesis.weaponId)?.name,
    content.manifest.timeWindows.find((entry) => entry.id === hypothesis.timeWindowId)?.name,
  ].filter((entry): entry is string => entry !== undefined);
  const evidence = separateEvidence({
    collectedObservationIds: session.collectedObservationIds,
    testimonyEntries: session.testimonyEntries,
    certifiedDisclosures: session.certifiedDisclosures,
    playerHypothesis: hypothesisLabels,
  });
  const allDisabled = submissionsAreDisabled(pendingAction, false);

  return (
    <main className="game-shell">
      <p className="sr-announcement" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <header className="investigation-header">
        <div>
          <span className="wordmark">TLA / THE LAST EXHIBIT</span>
          <span className="session-state">Session active</span>
        </div>
        <dl className="session-metrics">
          <div>
            <dt>Candidate cases</dt>
            <dd>{session.currentCandidateCount}</dd>
          </div>
          <div>
            <dt>Certified disclosures</dt>
            <dd>
              {session.usedDisclosureCount} / {session.maximumDisclosureCount}
            </dd>
          </div>
          <div>
            <dt>Runtime</dt>
            <dd>{runtimeLabel}</dd>
          </div>
        </dl>
        <div className="commitment-chip" title={session.caseCommitment.value}>
          <span>{session.caseCommitment.label}</span>
          <code>{shortCommitment(session.caseCommitment.value)}</code>
        </div>
      </header>

      <nav className="room-navigation" aria-label="Museum rooms">
        {content.manifest.rooms.map((room, index) => (
          <button
            key={room.id}
            type="button"
            aria-current={room.id === selectedRoomId ? 'page' : undefined}
            disabled={allDisabled}
            onClick={() => selectRoom(room.id)}
          >
            <span>0{index + 1}</span>
            {room.name}
            {session.exploredRoomIds.includes(room.id) ? <small>Explored</small> : null}
          </button>
        ))}
      </nav>

      <div className="investigation-grid">
        <section className="room-scene" aria-labelledby="room-title">
          <p className="eyebrow">Current location</p>
          <h1 id="room-title">{selectedRoom.name}</h1>
          <p className="room-description">{selectedRoom.description}</p>
          <div className="observation-list">
            {selectedRoom.observations.map((observation) => {
              const collected = session.collectedObservationIds.includes(observation.id);
              return (
                <article key={observation.id}>
                  <div>
                    <span className="evidence-label">Public observation</span>
                    <h2>{observation.title}</h2>
                    <p>{observation.description}</p>
                  </div>
                  <button
                    type="button"
                    disabled={allDisabled || collected}
                    onClick={() => collectObservation(observation.id)}
                  >
                    {collected ? 'Recorded' : 'Record observation'}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="interrogation-panel" aria-labelledby="interrogation-title">
          <p className="eyebrow">Person of interest</p>
          <h2 id="interrogation-title">{roomSuspect.name}</h2>
          <p className="suspect-role">{roomSuspect.role}</p>
          <p>{roomSuspect.publicDirection}</p>
          <div className="testimony-note" role="note">
            <strong>Unverified testimony</strong>
            <span>
              Scripted fixture dialogue. It never changes the candidate set and will later be
              replaced by verified 0G inference.
            </span>
          </div>
          <div className="question-list">
            {suspectQuestions.map((question) => (
              <button
                key={question.id}
                type="button"
                disabled={allDisabled}
                onClick={() => requestTestimony(roomSuspect.id, question.id)}
              >
                {question.question}
              </button>
            ))}
          </div>
          <div className="transcript" aria-label="Testimony transcript">
            {session.testimonyEntries
              .filter((entry) => entry.suspectId === roomSuspect.id)
              .map((entry) => (
                <article key={entry.id}>
                  <p className="transcript-question">{entry.question}</p>
                  <p>{entry.answer}</p>
                  <span>Unverified testimony · Fixture response</span>
                </article>
              ))}
          </div>
        </aside>
      </div>

      <section className="evidence-board" aria-labelledby="evidence-title">
        <div className="section-intro">
          <p className="eyebrow">Evidence board</p>
          <h2 id="evidence-title">Keep the classes separate.</h2>
          <p>
            Atmosphere and testimony may guide your theory. Only accepted certified disclosures
            reduce the public candidate count.
          </p>
        </div>
        <div className="evidence-columns">
          <article>
            <span className="evidence-index">A</span>
            <h3>Public observations</h3>
            <p>Inspectable facts shared by every fixture session.</p>
            <ul>
              {evidence.publicObservations.map((id) => (
                <li key={id}>
                  {
                    content.manifest.rooms
                      .flatMap((room) => room.observations)
                      .find((entry) => entry.id === id)?.title
                  }
                </li>
              ))}
              {evidence.publicObservations.length === 0 ? <li>None recorded yet.</li> : null}
            </ul>
          </article>
          <article>
            <span className="evidence-index">B</span>
            <h3>Unverified testimony</h3>
            <p>Character statements that may be evasive or contradictory.</p>
            <ul>
              {evidence.unverifiedTestimony.map((entry) => (
                <li key={entry.id}>{entry.question}</li>
              ))}
              {evidence.unverifiedTestimony.length === 0 ? <li>No testimony yet.</li> : null}
            </ul>
          </article>
          <article>
            <span className="evidence-index">C</span>
            <h3>Certified disclosures</h3>
            <p>Registered fixture simulations that change candidate state.</p>
            <ul>
              {evidence.certifiedDisclosures.map((entry) => (
                <li key={entry.predicateId}>
                  {entry.result} · {entry.question}
                </li>
              ))}
              {evidence.certifiedDisclosures.length === 0 ? (
                <li>No certified disclosures yet.</li>
              ) : null}
            </ul>
          </article>
          <article>
            <span className="evidence-index">D</span>
            <h3>Player hypothesis</h3>
            <p>Your working theory. It has no authority until accused.</p>
            <ul>
              {evidence.playerHypothesis.map((label) => (
                <li key={label}>{label}</li>
              ))}
              {evidence.playerHypothesis.length === 0 ? <li>No theory selected.</li> : null}
            </ul>
          </article>
        </div>
      </section>

      <section className="warrant-panel" aria-labelledby="warrant-title">
        <div className="section-intro">
          <p className="eyebrow">Certified channel</p>
          <h2 id="warrant-title">Registered binary warrants</h2>
          <p>
            Safety is previewed from the public candidate mask. Unsafe, repeated, and sixth
            disclosures are rejected before the hidden fixture result is evaluated.
          </p>
        </div>
        <div className="predicate-tabs" role="tablist" aria-label="Predicate dimensions">
          {(['suspect', 'room', 'weapon', 'time'] as const).map((dimension) => (
            <button
              key={dimension}
              type="button"
              role="tab"
              aria-selected={predicateDimension === dimension}
              onClick={() => setPredicateDimension(dimension)}
            >
              {dimension}
            </button>
          ))}
        </div>
        <div className="predicate-list">
          {activePredicates.map((predicate) => (
            <article key={predicate.predicateId} data-state={predicate.availability}>
              <div>
                <span className="predicate-state">{predicate.availability}</span>
                <h3>{predicate.question}</h3>
                <p>
                  YES → {predicate.yesCandidateCount} · NO → {predicate.noCandidateCount} candidates
                </p>
              </div>
              <button
                type="button"
                disabled={allDisabled || predicate.availability !== 'available'}
                onClick={() => requestWarrant(predicate.predicateId)}
              >
                {predicate.availability === 'used'
                  ? 'Already used'
                  : predicate.availability === 'unsafe'
                    ? 'Unsafe now'
                    : pendingAction === 'warrant'
                      ? 'Pending…'
                      : 'Request warrant'}
              </button>
            </article>
          ))}
        </div>
        {session.certifiedDisclosures.at(-1) === undefined ? null : (
          <div className="latest-disclosure" role="status">
            <span>Fixture certified simulation</span>
            <strong>{session.certifiedDisclosures.at(-1)!.result}</strong>
            <p>{session.certifiedDisclosures.at(-1)!.question}</p>
          </div>
        )}
      </section>

      <section className="accusation-panel" aria-labelledby="accusation-title">
        <div className="section-intro">
          <p className="eyebrow">Terminal action</p>
          <h2 id="accusation-title">Form your accusation</h2>
          <p>
            Choose all four dimensions. The server compares them with the committed fixture case and
            returns only YES or NO.
          </p>
        </div>
        <form onSubmit={submitAccusation}>
          <label>
            Suspect
            <select
              value={hypothesis.suspectId}
              onChange={(event) =>
                setHypothesis((current) => ({
                  ...current,
                  suspectId: event.target.value as SuspectId | '',
                }))
              }
            >
              <option value="">Select a suspect</option>
              {content.manifest.suspects.map((suspect) => (
                <option key={suspect.id} value={suspect.id}>
                  {suspect.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Room
            <select
              value={hypothesis.roomId}
              onChange={(event) =>
                setHypothesis((current) => ({
                  ...current,
                  roomId: event.target.value as RoomId | '',
                }))
              }
            >
              <option value="">Select a room</option>
              {content.manifest.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Weapon
            <select
              value={hypothesis.weaponId}
              onChange={(event) =>
                setHypothesis((current) => ({
                  ...current,
                  weaponId: event.target.value as WeaponId | '',
                }))
              }
            >
              <option value="">Select a weapon</option>
              {content.manifest.weapons.map((weapon) => (
                <option key={weapon.id} value={weapon.id}>
                  {weapon.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Time
            <select
              value={hypothesis.timeWindowId}
              onChange={(event) =>
                setHypothesis((current) => ({
                  ...current,
                  timeWindowId: event.target.value as TimeWindowId | '',
                }))
              }
            >
              <option value="">Select a time window</option>
              {content.manifest.timeWindows.map((timeWindow) => (
                <option key={timeWindow.id} value={timeWindow.id}>
                  {timeWindow.name}
                </option>
              ))}
            </select>
          </label>
          <label className="terminal-confirmation">
            <input
              type="checkbox"
              checked={confirmTerminal}
              onChange={(event) => setConfirmTerminal(event.target.checked)}
            />
            <span>I understand this accusation ends the fixture session.</span>
          </label>
          <button
            className="danger-action"
            type="submit"
            disabled={
              allDisabled ||
              !confirmTerminal ||
              Object.values(hypothesis).some((value) => value === '')
            }
          >
            {pendingAction === 'accusation' ? 'Submitting…' : 'Commit final accusation'}
          </button>
        </form>
      </section>

      {error === null ? null : (
        <div className="floating-error" role="alert">
          <strong>Action denied</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <footer className="game-footer">
        <details>
          <summary>Technical status · B2 fixture</summary>
          <p>
            The deterministic case engine and local session loop are implemented. Sui, Groth16, 0G,
            Walrus, Seal, and World are not connected. Testimony, disclosures, commitments, and
            verdicts on this page are explicitly fixture-generated.
          </p>
          <a href="https://github.com/pradykst/The-Last-Alibi/tree/main/docs/architecture">
            Review the intended architecture
          </a>
        </details>
        <button type="button" onClick={restart}>
          Restart investigation
        </button>
      </footer>
    </main>
  );
}
