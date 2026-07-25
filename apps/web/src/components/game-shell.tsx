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

import type { PendingAction } from './game-shell-helpers';
import OpeningExperience from './opening-experience';
import InvestigationExperience, { VerdictExperience } from './investigation-experience';

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

export function shortCommitment(value: string): string {
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
      await new Promise<void>((resolve) => window.setTimeout(resolve, 320));
      setCreationStage('committing');
      setAnnouncement('Generating a local fixture commitment.');
      const [response] = await Promise.all([
        requestGame('/api/game/sessions', createSessionResponseSchema, {
          method: 'POST',
        }),
        new Promise<void>((resolve) => window.setTimeout(resolve, 560)),
      ]);
      setSelectedRoomId(response.content.manifest.rooms[0]!.id);
      saveSession(response.session, response.content);
      setCreationStage('confirmed');
      setAnnouncement('Investigation opened with 64 candidate cases.');
      await new Promise<void>((resolve) => window.setTimeout(resolve, 650));
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
    return (
      <VerdictExperience
        result={session.terminalResult}
        session={session}
        runtimeLabel={runtimeLabel}
        onRestart={restart}
      />
    );
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

  return (
    <InvestigationExperience
      session={session}
      content={content}
      runtimeLabel={runtimeLabel}
      selectedRoomId={selectedRoomId}
      pendingAction={pendingAction}
      error={error}
      announcement={announcement}
      hypothesis={hypothesis}
      confirmTerminal={confirmTerminal}
      motionPreference={motionPreference}
      onMotionPreferenceChange={changeMotionPreference}
      onSelectRoom={selectRoom}
      onCollectObservation={collectObservation}
      onRequestTestimony={requestTestimony}
      onRequestWarrant={requestWarrant}
      onHypothesisChange={(key, value) =>
        setHypothesis((current) => ({
          ...current,
          [key]: value,
        }))
      }
      onConfirmTerminalChange={setConfirmTerminal}
      onSubmitAccusation={submitAccusation}
      onDismissError={() => setError(null)}
      onRestart={restart}
    />
  );
}
