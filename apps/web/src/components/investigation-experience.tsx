/* eslint-disable @next/next/no-img-element -- Approved game sprites and paired scene layers require stable native-image sizing. */
'use client';

import type {
  PublicGameContent,
  PublicGameSession,
  RoomId,
  SuspectId,
  TimeWindowId,
  WeaponId,
} from '@alibi/protocol';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AudioSettingsControls } from '../audio/audio-settings-controls';
import { useGameAudio } from '../audio/audio-provider';

import {
  accusationAssets,
  brandAssets,
  characterAssets,
  evidenceAssets,
  interfaceAssets,
  mapAssets,
  proofAssets,
  roomAssetIdByProtocolId,
  roomAssets,
  screenAssets,
  suspectAssetIdByProtocolId,
  timeAssetIdByProtocolId,
  verdictAssets,
  weaponAssetIdByProtocolId,
} from '../assets/game-assets';
import type { CharacterEmotion, EvidenceType } from '../assets/game-assets';
import { designPointToPercent } from '../assets/scene-coordinates';
import type { PendingAction } from './game-shell-helpers';
import type { MotionPreference } from './opening-experience';
import {
  getWarrantPresentationState,
  getWorstCaseSurvivorCount,
  isAccusationComplete,
  isDuplicateTestimonyQuestion,
  terminalSubmissionDisabled,
} from './game-ui-state';

import { useDialogFocusTrap } from './use-dialog-focus-trap';
export type InvestigationHypothesis = {
  suspectId: SuspectId | '';
  roomId: RoomId | '';
  weaponId: WeaponId | '';
  timeWindowId: TimeWindowId | '';
};

type InvestigationExperienceProps = {
  session: PublicGameSession;
  content: PublicGameContent;
  runtimeLabel: string;
  selectedRoomId: RoomId;
  pendingAction: PendingAction;
  error: string | null;
  announcement: string;
  hypothesis: InvestigationHypothesis;
  confirmTerminal: boolean;
  motionPreference: MotionPreference;
  onMotionPreferenceChange: (preference: MotionPreference) => void;
  onSelectRoom: (roomId: RoomId) => void;
  onCollectObservation: (observationId: string) => void;
  onRequestTestimony: (suspectId: SuspectId, questionId: string) => void;
  onRequestWarrant: (predicateId: string) => void;
  onHypothesisChange: <K extends keyof InvestigationHypothesis>(
    key: K,
    value: InvestigationHypothesis[K],
  ) => void;
  onConfirmTerminalChange: (confirmed: boolean) => void;
  onSubmitAccusation: (event: FormEvent<HTMLFormElement>) => void;
  onDismissError: () => void;
  onRestart: () => void;
};

type GameView = 'map' | 'room' | 'warrants' | 'accusation';
type Drawer = 'notebook' | 'technical' | 'settings' | null;

const ROOM_MARKS: Record<RoomId, string> = {
  room_gallery: 'G',
  room_restoration: 'R',
  room_archive: 'A',
  room_conservatory: 'C',
};

const ROOM_TONES: Record<RoomId, string> = {
  room_gallery: 'amber',
  room_restoration: 'verdigris',
  room_archive: 'burgundy',
  room_conservatory: 'moonlight',
};

const SUSPECT_INITIALS: Record<SuspectId, string> = {
  suspect_archivist: 'AV',
  suspect_security: 'MR',
  suspect_patron: 'CM',
  suspect_restorer: 'TL',
};

const EVIDENCE_KIND: Record<
  'observation' | 'testimony' | 'certified' | 'hypothesis',
  EvidenceType
> = {
  observation: 'public-observation',
  testimony: 'unverified-testimony',
  certified: 'certified-disclosure',
  hypothesis: 'player-hypothesis',
};

function EvidenceGlyph({
  kind,
}: {
  kind: 'observation' | 'testimony' | 'certified' | 'hypothesis';
}) {
  const semanticType = EVIDENCE_KIND[kind];
  return (
    <span className={`evidence-glyph evidence-glyph-${kind}`} aria-hidden="true">
      <img src={evidenceAssets[semanticType]} width="1024" height="1024" alt="" />
    </span>
  );
}

function getPresentationEmotion(
  transcriptLength: number,
  interviewOpen: boolean,
  pendingAction: PendingAction,
): CharacterEmotion {
  if (!interviewOpen) return 'neutral';
  if (pendingAction === 'testimony') return 'anxious';
  if (transcriptLength === 0) return 'guarded';
  return (
    (['guarded', 'anxious', 'angry', 'relieved'] as const)[Math.min(transcriptLength, 4) - 1] ??
    'relieved'
  );
}

function Modal({
  eyebrow,
  title,
  children,
  onClose,
  className = '',
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  useDialogFocusTrap(modalRef, onClose);

  return (
    <div className="game-modal-backdrop" role="presentation">
      <section
        ref={modalRef}
        className={`game-modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="game-modal-header">
          <div>
            <p className="game-eyebrow">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            className="square-control"
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function TechnicalDetails({
  session,
  runtimeLabel,
  onClose,
}: {
  session: PublicGameSession;
  runtimeLabel: string;
  onClose: () => void;
}) {
  return (
    <Modal eyebrow="Optional receipt" title="Technical details" onClose={onClose}>
      <img
        className="technical-drawer-mark"
        src={interfaceAssets.technicalDrawer}
        width="1024"
        height="1024"
        alt=""
        aria-hidden="true"
      />
      <dl className="receipt-list">
        <div>
          <dt>Runtime mode</dt>
          <dd>{runtimeLabel} · fixture-backed</dd>
        </div>
        <div>
          <dt>Session identifier</dt>
          <dd>
            <code>{session.sessionId}</code>
          </dd>
        </div>
        <div>
          <dt>Candidate count</dt>
          <dd>{session.currentCandidateCount}</dd>
        </div>
        <div>
          <dt>Commitment</dt>
          <dd>
            <code>{session.caseCommitment.value}</code>
          </dd>
        </div>
        <div>
          <dt>Commitment status</dt>
          <dd>{session.caseCommitment.label}</dd>
        </div>
        <div>
          <dt>Disclosure verification</dt>
          <dd>
            {session.certifiedDisclosures.length === 0
              ? 'Idle · no disclosure requested'
              : 'Fixture certified simulation'}
          </dd>
        </div>
        <div>
          <dt>Live partners</dt>
          <dd>Unavailable · no live identifiers exist</dd>
        </div>
      </dl>
      <p className="receipt-note">
        No Sui transaction, proof, 0G response, Walrus blob, Seal release, explorer link, or partner
        receipt is claimed by this fixture session.
      </p>
    </Modal>
  );
}

export function Settings({
  motionPreference,
  onMotionPreferenceChange,
  onClose,
}: {
  motionPreference: MotionPreference;
  onMotionPreferenceChange: (preference: MotionPreference) => void;
  onClose: () => void;
}) {
  return (
    <Modal eyebrow="Player preferences" title="Settings" onClose={onClose}>
      <fieldset className="game-settings">
        <legend>Motion</legend>
        <label>
          <input
            type="radio"
            name="game-motion"
            checked={motionPreference === 'system'}
            onChange={() => onMotionPreferenceChange('system')}
          />
          <span>
            <strong>Follow system</strong>
            Honor the device reduced-motion preference.
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="game-motion"
            checked={motionPreference === 'reduce'}
            onChange={() => onMotionPreferenceChange('reduce')}
          />
          <span>
            <strong>Reduce motion</strong>
            Remove nonessential scene movement and ambient loops.
          </span>
        </label>
      </fieldset>
      <AudioSettingsControls />
    </Modal>
  );
}

export function Notebook({
  session,
  content,
  hypothesis,
  onClose,
  onWarrants,
  onAccusation,
}: {
  session: PublicGameSession;
  content: PublicGameContent;
  hypothesis: InvestigationHypothesis;
  onClose?: () => void;
  onWarrants: () => void;
  onAccusation: () => void;
}) {
  const observations = content.manifest.rooms
    .flatMap((room) => room.observations)
    .filter((observation) => session.collectedObservationIds.includes(observation.id));
  const hypothesisEntries = [
    content.manifest.suspects.find((entry) => entry.id === hypothesis.suspectId)?.name,
    content.manifest.rooms.find((entry) => entry.id === hypothesis.roomId)?.name,
    content.manifest.weapons.find((entry) => entry.id === hypothesis.weaponId)?.name,
    content.manifest.timeWindows.find((entry) => entry.id === hypothesis.timeWindowId)?.name,
  ].filter((entry): entry is string => entry !== undefined);

  return (
    <aside className="detective-notebook" aria-labelledby="notebook-title">
      <header className="notebook-heading">
        <div>
          <p className="game-eyebrow">Detective’s notebook</p>
          <h2 id="notebook-title">Case notes</h2>
        </div>
        {onClose ? (
          <button
            className="square-control"
            type="button"
            aria-label="Close notebook"
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
      </header>

      <div className="notebook-meter">
        <div>
          <span>Candidate cases</span>
          <strong>{session.currentCandidateCount}</strong>
        </div>
        <div>
          <span>Disclosures left</span>
          <strong>{session.maximumDisclosureCount - session.usedDisclosureCount}</strong>
        </div>
      </div>

      <div className="notebook-scroll">
        <section className="note-section" aria-labelledby="observations-note">
          <header>
            <EvidenceGlyph kind="observation" />
            <div>
              <h3 id="observations-note">Public observations</h3>
              <small>Shared facts · no candidate effect</small>
            </div>
          </header>
          {observations.length === 0 ? (
            <p className="empty-note">Nothing pinned yet. Inspect a room observation.</p>
          ) : (
            <ul>
              {observations.map((observation) => (
                <li key={observation.id}>
                  <strong>{observation.title}</strong>
                  <span>{observation.description}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="note-section testimony-notes" aria-labelledby="testimony-note">
          <header>
            <EvidenceGlyph kind="testimony" />
            <div>
              <h3 id="testimony-note">Unverified testimony</h3>
              <small>Scripted fixture dialogue · no candidate effect</small>
            </div>
          </header>
          {session.testimonyEntries.length === 0 ? (
            <p className="empty-note">No witness statements recorded.</p>
          ) : (
            <ul>
              {session.testimonyEntries.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.question}</strong>
                  <span>{entry.answer}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="note-section certified-notes" aria-labelledby="certified-note">
          <header>
            <EvidenceGlyph kind="certified" />
            <div>
              <h3 id="certified-note">Certified disclosures</h3>
              <small>Accepted fixture simulations · changes candidates</small>
            </div>
          </header>
          {session.certifiedDisclosures.length === 0 ? (
            <p className="empty-note">No certified YES or NO result requested.</p>
          ) : (
            <ul>
              {session.certifiedDisclosures.map((entry) => (
                <li key={entry.predicateId}>
                  <strong>
                    {entry.result} · {entry.question}
                  </strong>
                  <span>{entry.candidateCount} candidates remain</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="note-section hypothesis-notes" aria-labelledby="hypothesis-note">
          <header>
            <EvidenceGlyph kind="hypothesis" />
            <div>
              <h3 id="hypothesis-note">Working hypothesis</h3>
              <small>Player theory · not canonical</small>
            </div>
          </header>
          {hypothesisEntries.length === 0 ? (
            <p className="empty-note">No theory assembled.</p>
          ) : (
            <ul>
              {hypothesisEntries.map((entry) => (
                <li key={entry}>
                  <strong>{entry}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="notebook-actions">
        <button type="button" onClick={onWarrants}>
          <span aria-hidden="true">⌁</span>
          Warrant Desk
        </button>
        <button className="accuse-shortcut" type="button" onClick={onAccusation}>
          <span aria-hidden="true">!</span>
          Make Accusation
        </button>
      </footer>
    </aside>
  );
}

export function MuseumMap({
  session,
  content,
  selectedRoomId,
  disabled,
  onEnterRoom,
}: {
  session: PublicGameSession;
  content: PublicGameContent;
  selectedRoomId: RoomId;
  disabled: boolean;
  onEnterRoom: (roomId: RoomId) => void;
}) {
  return (
    <section className="museum-map-screen" aria-labelledby="map-title">
      <header className="scene-heading map-heading">
        <div>
          <p className="game-eyebrow">Museum floor plan · private exhibition</p>
          <h1 id="map-title">Choose a room to investigate</h1>
        </div>
        <p>
          Four witnesses remain inside. Public observations and testimony may guide your theory;
          neither changes the candidate count.
        </p>
      </header>
      <div className="museum-map" aria-label="Museum rooms">
        <div className="museum-map-scene">
          <img
            className="museum-map-image"
            src={mapAssets.base}
            width="1920"
            height="1080"
            alt="Illustrated floor plan of the museum's four investigation rooms"
          />
          {content.manifest.rooms.map((room) => {
            const assetRoom = roomAssets[roomAssetIdByProtocolId[room.id]];
            const explored = session.exploredRoomIds.includes(room.id);
            return (
              <button
                key={`hotspot-${room.id}`}
                className="map-scene-hotspot"
                style={designPointToPercent(assetRoom.mapHotspot)}
                type="button"
                disabled={disabled}
                aria-label={`Enter ${room.name}. ${explored ? 'Explored' : 'Unexplored'}.`}
                onClick={() => onEnterRoom(room.id)}
              >
                <span aria-hidden="true">{ROOM_MARKS[room.id]}</span>
                <strong>{room.name}</strong>
                <small>{explored ? 'Explored' : 'Enter room'}</small>
              </button>
            );
          })}
        </div>
        <div className="map-room-list">
          <div className="map-spine" aria-hidden="true">
            <span />
          </div>
          {content.manifest.rooms.map((room, index) => {
            const suspect = content.manifest.suspects.find(
              (entry) => entry.primaryRoomId === room.id,
            )!;
            const explored = session.exploredRoomIds.includes(room.id);
            return (
              <button
                key={room.id}
                className="map-room"
                data-room={room.id}
                data-current={selectedRoomId === room.id}
                type="button"
                disabled={disabled}
                onClick={() => onEnterRoom(room.id)}
              >
                <span className="map-room-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <span className="map-room-art" data-tone={ROOM_TONES[room.id]} aria-hidden="true">
                  <img
                    src={roomAssets[roomAssetIdByProtocolId[room.id]].thumbnail}
                    width="960"
                    height="540"
                    alt=""
                    loading="lazy"
                  />
                  <i>{ROOM_MARKS[room.id]}</i>
                </span>
                <span className="map-room-copy">
                  <small>{explored ? 'Explored' : 'Unexplored'}</small>
                  <strong>{room.name}</strong>
                  <span>
                    {suspect.name} · {suspect.role}
                  </span>
                </span>
                <span className="map-enter">
                  Enter <i aria-hidden="true">→</i>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function RoomScene({
  session,
  content,
  selectedRoomId,
  pendingAction,
  onCollectObservation,
  onRequestTestimony,
  onBackToMap,
}: {
  session: PublicGameSession;
  content: PublicGameContent;
  selectedRoomId: RoomId;
  pendingAction: PendingAction;
  onCollectObservation: (observationId: string) => void;
  onRequestTestimony: (suspectId: SuspectId, questionId: string) => void;
  onBackToMap: () => void;
}) {
  const room = content.manifest.rooms.find((entry) => entry.id === selectedRoomId)!;
  const suspect = content.manifest.suspects.find(
    (entry) => entry.primaryRoomId === selectedRoomId,
  )!;
  const questions = content.testimonyQuestions.filter((entry) => entry.suspectId === suspect.id);
  const transcript = session.testimonyEntries.filter((entry) => entry.suspectId === suspect.id);
  const [selectedQuestionId, setSelectedQuestionId] = useState(questions[0]?.id ?? '');
  const selectedQuestionAlreadyAsked = isDuplicateTestimonyQuestion(transcript, selectedQuestionId);
  const audio = useGameAudio();
  const [interviewOpen, setInterviewOpen] = useState(false);
  const disabled = pendingAction !== null;
  const assetRoom = roomAssets[roomAssetIdByProtocolId[room.id]];
  const assetCharacterId = suspectAssetIdByProtocolId[suspect.id];
  const assetCharacter = characterAssets[assetCharacterId];
  const presentationEmotion = getPresentationEmotion(
    transcript.length,
    interviewOpen,
    pendingAction,
  );
  const presentationSprite = assetCharacter.sprites[presentationEmotion];

  const askQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedQuestionId === '' || disabled || selectedQuestionAlreadyAsked) return;
    onRequestTestimony(suspect.id, selectedQuestionId);
  };

  return (
    <section
      className="room-screen"
      data-room={room.id}
      data-interview={interviewOpen}
      aria-labelledby="room-scene-title"
    >
      <div className="room-artwork" aria-hidden="true">
        <img
          className="room-layer room-background-layer"
          src={assetRoom.background}
          width="1920"
          height="1080"
          alt=""
        />
        <div className="room-light room-light-left" />
        <div className="room-light room-light-right" />
        <img
          className="room-character-sprite"
          src={presentationSprite}
          width="1024"
          height="1024"
          alt=""
          data-emotion={presentationEmotion}
        />
        <img
          className="room-layer room-foreground-layer"
          src={assetRoom.foreground}
          width="1920"
          height="1080"
          alt=""
        />
      </div>

      <header className="room-heading">
        <button className="back-to-map" type="button" onClick={onBackToMap}>
          <span aria-hidden="true">←</span>
          Museum map
        </button>
        <div>
          <p className="game-eyebrow">Current location</p>
          <h1 id="room-scene-title">{room.name}</h1>
          <p>{room.description}</p>
        </div>
      </header>

      <div className="scene-hotspots" aria-label="Inspectable observations">
        {room.observations.map((observation, index) => {
          const collected = session.collectedObservationIds.includes(observation.id);
          const hotspot = (
            assetRoom.observationHotspots as Record<string, { x: number; y: number }>
          )[observation.id];
          return (
            <button
              key={observation.id}
              className="observation-hotspot"
              data-index={index}
              style={hotspot ? designPointToPercent(hotspot) : undefined}
              type="button"
              disabled={disabled || collected}
              onClick={() => onCollectObservation(observation.id)}
            >
              <span className="hotspot-mark" aria-hidden="true">
                {collected ? '✓' : '+'}
              </span>
              <span>
                <small>{collected ? 'Pinned observation' : 'Public observation'}</small>
                <strong>{observation.title}</strong>
                <span>{observation.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <aside className="suspect-presence" aria-labelledby="suspect-name">
        <button
          className="suspect-focus"
          type="button"
          aria-expanded={interviewOpen}
          onClick={() => {
            audio.select();
            setInterviewOpen((current) => !current);
          }}
        >
          <span className="suspect-portrait" aria-hidden="true">
            <img src={assetCharacter.portrait} width="1024" height="1024" alt="" loading="lazy" />
            <i>{SUSPECT_INITIALS[suspect.id]}</i>
          </span>
          <span className="suspect-copy">
            <small>Available to interview</small>
            <strong id="suspect-name">{suspect.name}</strong>
            <span>{suspect.role}</span>
          </span>
          <span aria-hidden="true">{interviewOpen ? '×' : 'Speak →'}</span>
        </button>

        {interviewOpen ? (
          <div className="interview-dossier">
            <div className="demeanor-line">
              <small className="presentation-mood">
                Presentation mood · {presentationEmotion} · not evidence
              </small>
              <span>Demeanor</span>
              <p>{suspect.publicDirection}</p>
            </div>
            <div className="testimony-boundary" role="note">
              <EvidenceGlyph kind="testimony" />
              <p>
                <strong>Unverified scripted testimony</strong>
                Fixture dialogue may misdirect. It never changes candidate state and is not live 0G
                inference.
              </p>
            </div>

            <div className="dialogue-history" aria-label={`${suspect.name} dialogue history`}>
              {transcript.length === 0 ? (
                <p className="dialogue-empty">Select a prepared question to begin.</p>
              ) : (
                transcript.map((entry) => (
                  <article key={entry.id}>
                    <p className="player-line">
                      <span>You</span>
                      {entry.question}
                    </p>
                    <p className="suspect-line">
                      <span>{suspect.name}</span>
                      {entry.answer}
                    </p>
                    <small>
                      <span aria-hidden="true">“</span> Unverified testimony · fixture response
                    </small>
                  </article>
                ))
              )}
              {pendingAction === 'testimony' ? (
                <div className="dialogue-pending" role="status">
                  <span aria-hidden="true" />
                  Waiting for scripted fixture response…
                </div>
              ) : null}
            </div>

            <form className="question-composer" onSubmit={askQuestion}>
              <label htmlFor={`question-${suspect.id}`}>Your question</label>
              <div>
                <select
                  id={`question-${suspect.id}`}
                  value={selectedQuestionId}
                  disabled={disabled}
                  onChange={(event) => {
                    audio.select();
                    setSelectedQuestionId(event.target.value);
                  }}
                >
                  {questions.map((question) => {
                    const alreadyAsked = transcript.some(
                      (entry) => entry.questionId === question.id,
                    );
                    return (
                      <option key={question.id} value={question.id} disabled={alreadyAsked}>
                        {alreadyAsked ? 'Asked · ' : ''}
                        {question.question}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="submit"
                  disabled={disabled || selectedQuestionId === '' || selectedQuestionAlreadyAsked}
                >
                  {pendingAction === 'testimony' ? 'Waiting…' : 'Ask question'}
                </button>
              </div>
              <small>Practice mode supports the case’s curated questions only.</small>
            </form>
          </div>
        ) : null}
      </aside>
    </section>
  );
}

export function WarrantDesk({
  session,
  pendingAction,
  onRequestWarrant,
  onReturn,
}: {
  session: PublicGameSession;
  pendingAction: PendingAction;
  onRequestWarrant: (predicateId: string) => void;
  onReturn: () => void;
}) {
  const [dimension, setDimension] = useState<'suspect' | 'room' | 'weapon' | 'time'>('suspect');
  const predicates = session.predicateStatuses.filter((entry) => entry.dimension === dimension);
  const latest = session.certifiedDisclosures.at(-1);
  const audio = useGameAudio();
  const remaining = session.maximumDisclosureCount - session.usedDisclosureCount;

  return (
    <section className="warrant-desk" aria-labelledby="warrant-desk-title">
      <header className="desk-heading">
        <button className="back-to-map" type="button" onClick={onReturn}>
          <span aria-hidden="true">←</span>
          Return to investigation
        </button>
        <img
          className="desk-emblem"
          src={interfaceAssets.warrantRequest}
          width="1024"
          height="1024"
          alt=""
          aria-hidden="true"
        />
        <div>
          <p className="game-eyebrow">Certified disclosure channel</p>
          <h1 id="warrant-desk-title">Warrant Desk</h1>
          <p>
            Ask one registered binary question. Safety comes from the current public candidate set;
            accepted fixture results alone reduce it.
          </p>
        </div>
        <div className="budget-stamp">
          <span>Budget remaining</span>
          <strong>{remaining}</strong>
          <small>of {session.maximumDisclosureCount}</small>
        </div>
      </header>

      <div className="dossier-tabs" role="tablist" aria-label="Warrant question dimensions">
        {(['suspect', 'room', 'weapon', 'time'] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={dimension === entry}
            onClick={() => {
              audio.select();
              setDimension(entry);
            }}
          >
            {entry === 'time' ? 'Time window' : entry}
          </button>
        ))}
      </div>

      <div className="warrant-files">
        {predicates.map((predicate, index) => {
          const state = getWarrantPresentationState(predicate, session.currentCandidateCount);
          const implied = state === 'implied';
          const worstCase = getWorstCaseSurvivorCount(predicate);
          return (
            <article key={predicate.predicateId} className="warrant-file" data-state={state}>
              <span className="file-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="file-copy">
                <span className="file-state">
                  <img
                    src={
                      pendingAction === 'warrant'
                        ? proofAssets.pending
                        : state === 'unavailable'
                          ? proofAssets.failed
                          : state === 'confirmed'
                            ? proofAssets.verified
                            : interfaceAssets.warrantRequest
                    }
                    width="1024"
                    height="1024"
                    alt=""
                  />
                  <i aria-hidden="true">
                    {state === 'safe'
                      ? '◇'
                      : state === 'confirmed'
                        ? '✓'
                        : state === 'implied'
                          ? '≈'
                          : '×'}
                  </i>
                  {state === 'safe'
                    ? 'Safe to request'
                    : state === 'confirmed'
                      ? 'Confirmed'
                      : state === 'implied'
                        ? 'Implied by current record'
                        : 'Unavailable · unsafe branch'}
                </span>
                <h2>{predicate.question}</h2>
                <div className="branch-preview" aria-label="Candidate survivor preview">
                  <span>
                    <strong>YES</strong>
                    {predicate.yesCandidateCount} survive
                  </span>
                  <span>
                    <strong>NO</strong>
                    {predicate.noCandidateCount} survive
                  </span>
                  <span>
                    <strong>Worst case</strong>
                    {worstCase} survive
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={
                  pendingAction !== null ||
                  predicate.availability !== 'available' ||
                  implied ||
                  remaining === 0
                }
                onClick={() => onRequestWarrant(predicate.predicateId)}
              >
                {pendingAction === 'warrant'
                  ? 'Pending…'
                  : state === 'confirmed'
                    ? 'Seal broken'
                    : state === 'implied'
                      ? 'No proof needed'
                      : state === 'unavailable'
                        ? 'Request denied'
                        : 'Request warrant'}
              </button>
            </article>
          );
        })}
      </div>

      {latest ? (
        <div className="warrant-result" role="status">
          <div className="wax-seal" aria-hidden="true">
            <img src={proofAssets.verified} width="1024" height="1024" alt="" />
            <span>{latest.result}</span>
          </div>
          <div>
            <p className="game-eyebrow">Fixture certified simulation · confirmed</p>
            <h2>{latest.result}</h2>
            <p>{latest.question}</p>
            <small>{latest.candidateCount} candidate cases remain.</small>
          </div>
        </div>
      ) : (
        <div className="warrant-empty" role="note">
          <span aria-hidden="true">
            <img
              src={
                pendingAction === 'warrant' ? proofAssets.pending : interfaceAssets.warrantRequest
              }
              width="1024"
              height="1024"
              alt=""
            />
          </span>
          <p>
            <strong>No certified result yet.</strong>
            Review both branches before spending the limited disclosure budget.
          </p>
        </div>
      )}
    </section>
  );
}
export function AccusationBuilder({
  session,
  content,
  hypothesis,
  confirmTerminal,
  pendingAction,
  onHypothesisChange,
  onConfirmTerminalChange,
  onSubmitAccusation,
  onReturn,
}: Pick<
  InvestigationExperienceProps,
  | 'content'
  | 'session'
  | 'hypothesis'
  | 'confirmTerminal'
  | 'pendingAction'
  | 'onHypothesisChange'
  | 'onConfirmTerminalChange'
  | 'onSubmitAccusation'
> & { onReturn: () => void }) {
  const audio = useGameAudio();
  const [reviewOpen, setReviewOpen] = useState(false);
  const complete = isAccusationComplete(hypothesis);
  const labels = {
    suspect:
      content.manifest.suspects.find((entry) => entry.id === hypothesis.suspectId)?.name ??
      'Not selected',
    room:
      content.manifest.rooms.find((entry) => entry.id === hypothesis.roomId)?.name ??
      'Not selected',
    weapon:
      content.manifest.weapons.find((entry) => entry.id === hypothesis.weaponId)?.name ??
      'Not selected',
    time:
      content.manifest.timeWindows.find((entry) => entry.id === hypothesis.timeWindowId)?.name ??
      'Not selected',
  };

  return (
    <section className="accusation-desk" aria-labelledby="accusation-builder-title">
      <header className="desk-heading accusation-heading">
        <button className="back-to-map" type="button" onClick={onReturn}>
          <span aria-hidden="true">←</span>
          Return to investigation
        </button>
        <div>
          <p className="game-eyebrow">Terminal action</p>
          <h1 id="accusation-builder-title">Make your accusation</h1>
          <p>Assemble one complete theory. Submission ends this case and returns only YES or NO.</p>
        </div>
        <div className="terminal-stamp">
          <span aria-hidden="true">!</span>
          One submission
        </div>
      </header>

      <div className="accusation-layout">
        <div className="accusation-fields">
          <fieldset>
            <legend>
              <span>01</span> Who?
            </legend>
            <div className="choice-grid">
              {content.manifest.suspects.map((suspect) => (
                <label key={suspect.id}>
                  <input
                    type="radio"
                    name="suspect"
                    value={suspect.id}
                    checked={hypothesis.suspectId === suspect.id}
                    onChange={() => {
                      audio.select();
                      onHypothesisChange('suspectId', suspect.id);
                    }}
                  />
                  <span>
                    <img
                      className="choice-portrait"
                      src={characterAssets[suspectAssetIdByProtocolId[suspect.id]].portrait}
                      width="1024"
                      height="1024"
                      alt=""
                      loading="lazy"
                    />
                    <i aria-hidden="true">{SUSPECT_INITIALS[suspect.id]}</i>
                    <strong>{suspect.name}</strong>
                    <small>{suspect.role}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>
              <span>02</span> Where?
            </legend>
            <div className="choice-grid room-choices">
              {content.manifest.rooms.map((room) => (
                <label key={room.id}>
                  <input
                    type="radio"
                    name="room"
                    value={room.id}
                    checked={hypothesis.roomId === room.id}
                    onChange={() => {
                      audio.select();
                      onHypothesisChange('roomId', room.id);
                    }}
                  />
                  <span>
                    <img
                      className="choice-room"
                      src={roomAssets[roomAssetIdByProtocolId[room.id]].thumbnail}
                      width="960"
                      height="540"
                      alt=""
                      loading="lazy"
                    />
                    <i aria-hidden="true">{ROOM_MARKS[room.id]}</i>
                    <strong>{room.name}</strong>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="split-fields">
            <fieldset>
              <legend>
                <span>03</span> With what?
              </legend>
              <div className="choice-stack">
                {content.manifest.weapons.map((weapon) => (
                  <label key={weapon.id}>
                    <input
                      type="radio"
                      name="weapon"
                      value={weapon.id}
                      checked={hypothesis.weaponId === weapon.id}
                      onChange={() => {
                        audio.select();
                        onHypothesisChange('weaponId', weapon.id);
                      }}
                    />
                    <span>
                      <img
                        className="choice-icon"
                        src={accusationAssets.weapons[weaponAssetIdByProtocolId[weapon.id]]}
                        width="1024"
                        height="1024"
                        alt=""
                        loading="lazy"
                      />
                      <strong>{weapon.name}</strong>
                      <small>{weapon.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>
                <span>04</span> When?
              </legend>
              <div className="choice-stack">
                {content.manifest.timeWindows.map((timeWindow) => (
                  <label key={timeWindow.id}>
                    <input
                      type="radio"
                      name="time"
                      value={timeWindow.id}
                      checked={hypothesis.timeWindowId === timeWindow.id}
                      onChange={() => {
                        audio.select();
                        onHypothesisChange('timeWindowId', timeWindow.id);
                      }}
                    />
                    <span>
                      <img
                        className="choice-icon"
                        src={accusationAssets.times[timeAssetIdByProtocolId[timeWindow.id]]}
                        width="1024"
                        height="1024"
                        alt=""
                        loading="lazy"
                      />
                      <strong>{timeWindow.name}</strong>
                      <small>{timeWindow.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        <aside className="accusation-summary">
          <p className="game-eyebrow">Your theory</p>
          <h2>Accusation summary</h2>
          <ol>
            <li>
              <span>Suspect</span>
              <strong>{labels.suspect}</strong>
            </li>
            <li>
              <span>Room</span>
              <strong>{labels.room}</strong>
            </li>
            <li>
              <span>Weapon</span>
              <strong>{labels.weapon}</strong>
            </li>
            <li>
              <span>Time</span>
              <strong>{labels.time}</strong>
            </li>
          </ol>
          <div className="terminal-warning" role="note">
            <span aria-hidden="true">!</span>
            <p>
              <strong>This action is terminal.</strong>
              An incorrect result will not reveal the hidden solution.
            </p>
          </div>
          <button
            className="review-accusation"
            type="button"
            disabled={!complete || pendingAction !== null}
            onClick={() => {
              audio.select();
              setReviewOpen(true);
            }}
          >
            Review final accusation
            <span aria-hidden="true">→</span>
          </button>
        </aside>
      </div>

      {reviewOpen ? (
        <Modal
          eyebrow="Final confirmation"
          title="This ends the investigation"
          className="accusation-confirm-modal"
          onClose={() => {
            if (pendingAction !== 'accusation') {
              audio.back();
              setReviewOpen(false);
            }
          }}
        >
          <p className="confirmation-sentence">
            You accuse <strong>{labels.suspect}</strong>, in the <strong>{labels.room}</strong>,
            with the <strong>{labels.weapon}</strong>, <strong>{labels.time.toLowerCase()}</strong>.
          </p>
          <img
            className="accusation-seal-art"
            src={verdictAssets.sealed}
            width="1024"
            height="1024"
            alt=""
            aria-hidden="true"
          />
          <div className="binary-promise">
            <span>Result</span>
            <strong>YES or NO only</strong>
            <small>The hidden case is never disclosed after a loss.</small>
          </div>
          <form onSubmit={onSubmitAccusation}>
            <label className="terminal-check">
              <input
                type="checkbox"
                checked={confirmTerminal}
                disabled={pendingAction === 'accusation'}
                onChange={(event) => onConfirmTerminalChange(event.target.checked)}
              />
              <span>I understand this accusation permanently ends this fixture session.</span>
            </label>
            <button
              className="commit-accusation"
              type="submit"
              disabled={terminalSubmissionDisabled({
                hypothesis,
                confirmed: confirmTerminal,
                pendingAction,
                session,
              })}
            >
              {pendingAction === 'accusation' ? (
                <>
                  <span className="button-spinner" aria-hidden="true" />
                  Evaluating fixture verdict…
                </>
              ) : (
                <>
                  Commit final accusation <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

function NotebookOverlay({
  session,
  content,
  hypothesis,
  onClose,
  onWarrants,
  onAccusation,
}: {
  session: PublicGameSession;
  content: PublicGameContent;
  hypothesis: InvestigationHypothesis;
  onClose: () => void;
  onWarrants: () => void;
  onAccusation: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(overlayRef, onClose);

  return (
    <div className="drawer-backdrop" role="presentation">
      <div
        ref={overlayRef}
        className="notebook-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Detective’s notebook"
      >
        <Notebook
          session={session}
          content={content}
          hypothesis={hypothesis}
          onClose={onClose}
          onWarrants={onWarrants}
          onAccusation={onAccusation}
        />
      </div>
    </div>
  );
}

export function VerdictExperience({
  result,
  session,
  runtimeLabel,
  onRestart,
}: {
  result: 'YES' | 'NO';
  session: PublicGameSession;
  runtimeLabel: string;
  onRestart: () => void;
}) {
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const audio = useGameAudio();

  useEffect(() => {
    headingRef.current?.focus();
    audio.verdict(result, session.sessionId);
  }, [audio, result, session.sessionId]);

  return (
    <main className="verdict-screen" data-result={result}>
      <div className="verdict-atmosphere" aria-hidden="true">
        <img
          className="verdict-background"
          src={result === 'YES' ? screenAssets.verdictYes : screenAssets.verdictNo}
          width="1920"
          height="1080"
          alt=""
        />
        <span />
        <span />
        <span />
      </div>
      <section className="verdict-card">
        <img
          className="verdict-brand"
          src={brandAssets.wordmark}
          width="745"
          height="142"
          alt="The Last Alibi"
        />
        <p className="game-eyebrow">Fixture verdict · terminal</p>
        <div className="verdict-mark" aria-hidden="true">
          <img
            src={result === 'YES' ? verdictAssets.yes : verdictAssets.no}
            width="1024"
            height="1024"
            alt=""
          />
        </div>
        <h1 ref={headingRef} tabIndex={-1}>
          {result}
        </h1>
        <h2>{result === 'YES' ? 'The last alibi falls.' : 'The case closes in doubt.'}</h2>
        <p>
          {result === 'YES'
            ? 'Your four-part accusation matches the committed fixture case.'
            : 'Your accusation does not match the committed fixture case. The hidden solution remains sealed.'}
        </p>
        <div className="verdict-boundary" role="note">
          <span aria-hidden="true">{result}</span>
          <p>
            <strong>{result === 'YES' ? 'Investigation succeeded' : 'Investigation ended'}</strong>
            Binary fixture result only. No Sui transaction, production proof, partner verification,
            Walrus record, or Seal release occurred.
          </p>
        </div>
        <div className="verdict-actions">
          <button className="new-case-button" type="button" onClick={onRestart}>
            Begin a new investigation
          </button>
          <button type="button" onClick={() => setTechnicalOpen(true)}>
            View technical receipt
          </button>
        </div>
      </section>
      {technicalOpen ? (
        <TechnicalDetails
          session={session}
          runtimeLabel={runtimeLabel}
          onClose={() => setTechnicalOpen(false)}
        />
      ) : null}
    </main>
  );
}

export default function InvestigationExperience({
  session,
  content,
  runtimeLabel,
  selectedRoomId,
  pendingAction,
  error,
  announcement,
  hypothesis,
  confirmTerminal,
  motionPreference,
  onMotionPreferenceChange,
  onSelectRoom,
  onCollectObservation,
  onRequestTestimony,
  onRequestWarrant,
  onHypothesisChange,
  onConfirmTerminalChange,
  onSubmitAccusation,
  onDismissError,
  onRestart,
}: InvestigationExperienceProps) {
  const [view, setView] = useState<GameView>('map');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const audio = useGameAudio();
  const notebookOpenCount = useRef(0);
  const reduceMotion = motionPreference === 'reduce' || systemReducedMotion;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const leaveRoomAmbience = () => {
    if (view === 'room') audio.returnToMap();
  };

  const returnToMap = () => {
    leaveRoomAmbience();
    audio.back();
    setDrawer(null);
    setView('map');
  };

  const enterRoom = (roomId: RoomId) => {
    audio.select();
    onSelectRoom(roomId);
    setView('room');
  };

  const openWarrants = () => {
    leaveRoomAmbience();
    audio.select();
    setDrawer(null);
    setView('warrants');
  };

  const openAccusation = () => {
    leaveRoomAmbience();
    audio.select();
    setDrawer(null);
    setView('accusation');
  };

  const openNotebook = () => {
    notebookOpenCount.current += 1;
    audio.notebookOpened(`${session.sessionId}:${notebookOpenCount.current}`);
    setDrawer('notebook');
  };

  const currentRoom = content.manifest.rooms.find((room) => room.id === selectedRoomId)!;
  const closeDrawer = () => {
    audio.back();
    setDrawer(null);
  };

  const disabled = pendingAction !== null;

  return (
    <main
      className="cinematic-game"
      data-view={view}
      data-motion={reduceMotion ? 'reduced' : 'full'}
    >
      <p className="screen-reader-status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <header className="case-hud">
        <button
          className="case-insignia"
          type="button"
          aria-label="Open museum map"
          onClick={returnToMap}
        >
          <span aria-hidden="true">
            <img src={brandAssets.logoMark} width="1024" height="1024" alt="" />
          </span>
          <div className="case-brand-lockup">
            <img
              className="case-brand-wordmark"
              src={brandAssets.wordmark}
              width="745"
              height="142"
              alt="The Last Alibi"
            />
            <small>Case 001</small>
          </div>
        </button>
        <div className="hud-location" aria-live="polite">
          <span aria-hidden="true">{view === 'map' ? '⌂' : ROOM_MARKS[selectedRoomId]}</span>
          <div>
            <small>{view === 'map' ? 'Museum overview' : 'Current location'}</small>
            <strong>{view === 'map' ? 'Museum map' : currentRoom.name}</strong>
          </div>
        </div>
        <dl className="hud-metrics">
          <div>
            <dt>Session</dt>
            <dd>
              <span className="status-dot" aria-hidden="true" />
              Active · fixture
            </dd>
          </div>
          <div>
            <dt>Candidates</dt>
            <dd>{session.currentCandidateCount}</dd>
          </div>
          <div>
            <dt>Disclosure budget</dt>
            <dd>
              {session.maximumDisclosureCount - session.usedDisclosureCount} /{' '}
              {session.maximumDisclosureCount}
            </dd>
          </div>
        </dl>
        <div className="hud-controls">
          <button
            className="square-control notebook-toggle"
            type="button"
            aria-label="Open detective notebook"
            onClick={openNotebook}
          >
            <img src={evidenceAssets['player-hypothesis']} width="1024" height="1024" alt="" />
          </button>
          <button
            className="square-control"
            type="button"
            aria-label="Open settings"
            onClick={() => {
              audio.select();
              setDrawer('settings');
            }}
          >
            <span aria-hidden="true">⚙</span>
          </button>
          <button
            className="square-control"
            type="button"
            aria-label="Open technical details"
            onClick={() => {
              audio.select();
              setDrawer('technical');
            }}
          >
            <img src={interfaceAssets.technicalDrawer} width="1024" height="1024" alt="" />
          </button>
        </div>
      </header>

      <nav className="room-rail" aria-label="Museum room navigation">
        <button
          className="rail-map"
          type="button"
          aria-current={view === 'map' ? 'page' : undefined}
          onClick={returnToMap}
        >
          <span aria-hidden="true">⌂</span>
          <strong>Map</strong>
        </button>
        {content.manifest.rooms.map((room, index) => (
          <button
            key={room.id}
            type="button"
            disabled={disabled}
            aria-current={view === 'room' && selectedRoomId === room.id ? 'page' : undefined}
            onClick={() => enterRoom(room.id)}
          >
            <span aria-hidden="true">{ROOM_MARKS[room.id]}</span>
            <strong>{room.name}</strong>
            <small>
              {session.exploredRoomIds.includes(room.id) ? 'Explored' : `0${index + 1}`}
            </small>
          </button>
        ))}
        <button
          className="rail-warrant"
          type="button"
          aria-current={view === 'warrants' ? 'page' : undefined}
          onClick={openWarrants}
        >
          <span aria-hidden="true">
            <img src={interfaceAssets.warrantRequest} width="1024" height="1024" alt="" />
          </span>
          <strong>Warrant Desk</strong>
        </button>
      </nav>

      <div className="game-stage">
        {view === 'map' ? (
          <MuseumMap
            session={session}
            content={content}
            selectedRoomId={selectedRoomId}
            disabled={disabled}
            onEnterRoom={enterRoom}
          />
        ) : null}
        {view === 'room' ? (
          <RoomScene
            key={selectedRoomId}
            session={session}
            content={content}
            selectedRoomId={selectedRoomId}
            pendingAction={pendingAction}
            onCollectObservation={onCollectObservation}
            onRequestTestimony={onRequestTestimony}
            onBackToMap={returnToMap}
          />
        ) : null}
        {view === 'warrants' ? (
          <WarrantDesk
            session={session}
            pendingAction={pendingAction}
            onRequestWarrant={onRequestWarrant}
            onReturn={returnToMap}
          />
        ) : null}
        {view === 'accusation' ? (
          <AccusationBuilder
            content={content}
            hypothesis={hypothesis}
            session={session}
            confirmTerminal={confirmTerminal}
            pendingAction={pendingAction}
            onHypothesisChange={onHypothesisChange}
            onConfirmTerminalChange={onConfirmTerminalChange}
            onSubmitAccusation={onSubmitAccusation}
            onReturn={returnToMap}
          />
        ) : null}
      </div>

      <div className="desktop-notebook">
        <Notebook
          session={session}
          content={content}
          hypothesis={hypothesis}
          onWarrants={openWarrants}
          onAccusation={openAccusation}
        />
      </div>

      <footer className="context-bar">
        <div>
          <span className="context-icon" aria-hidden="true">
            {pendingAction ? '…' : '◇'}
          </span>
          <p>
            <strong>{pendingAction ? 'Canonical action pending' : 'Investigation ready'}</strong>
            {pendingAction
              ? 'Wait for this fixture action to finish before choosing another.'
              : view === 'map'
                ? 'Choose a room, open your notebook, or visit the Warrant Desk.'
                : view === 'room'
                  ? 'Inspect public observations or focus on the room’s witness.'
                  : view === 'warrants'
                    ? 'Certified results spend budget and update candidates.'
                    : 'Review all four accusation dimensions before continuing.'}
          </p>
        </div>
        <button type="button" onClick={openAccusation}>
          Make accusation
          <span aria-hidden="true">→</span>
        </button>
      </footer>

      {drawer === 'notebook' ? (
        <NotebookOverlay
          session={session}
          content={content}
          hypothesis={hypothesis}
          onClose={closeDrawer}
          onWarrants={openWarrants}
          onAccusation={openAccusation}
        />
      ) : null}
      {drawer === 'technical' ? (
        <TechnicalDetails session={session} runtimeLabel={runtimeLabel} onClose={closeDrawer} />
      ) : null}
      {drawer === 'settings' ? (
        <Settings
          motionPreference={motionPreference}
          onMotionPreferenceChange={onMotionPreferenceChange}
          onClose={closeDrawer}
        />
      ) : null}

      {error ? (
        <div className="game-error" role="alert">
          <span aria-hidden="true">!</span>
          <p>
            <strong>Action not completed</strong>
            {error} Your investigation state was not advanced.
          </p>
          <button type="button" onClick={onDismissError}>
            Dismiss
          </button>
        </div>
      ) : null}

      <button className="restart-session" type="button" onClick={onRestart}>
        End practice session
      </button>
    </main>
  );
}
