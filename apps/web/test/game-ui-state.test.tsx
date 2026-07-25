import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PublicGameSession, RoomId } from '@alibi/protocol';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  AccusationBuilder,
  MuseumMap,
  Notebook,
  RoomScene,
  TechnicalDetails,
  VerdictExperience,
  WarrantDesk,
} from '../src/components/investigation-experience';
import type { InvestigationHypothesis } from '../src/components/investigation-experience';
import {
  advanceOpeningPhase,
  getCreationHeading,
  getModeAvailability,
  getResponsiveShellMode,
  getWarrantPresentationState,
  getWorstCaseSurvivorCount,
  isAccusationComplete,
  isDuplicateTestimonyQuestion,
  shouldOfferContinue,
  terminalSubmissionDisabled,
} from '../src/components/game-ui-state';
import OpeningExperience from '../src/components/opening-experience';
import {
  getTrappedFocusTarget,
  getFocusableElements,
} from '../src/components/use-dialog-focus-trap';
import type { FixtureRandomSource } from '../src/server/game/random';
import { FixtureGameService } from '../src/server/game/service';
import { FixtureSessionStore } from '../src/server/game/store';

const EMPTY_HYPOTHESIS: InvestigationHypothesis = {
  suspectId: '',
  roomId: '',
  weaponId: '',
  timeWindowId: '',
};

const COMPLETE_HYPOTHESIS: InvestigationHypothesis = {
  suspectId: 'suspect_archivist',
  roomId: 'room_gallery',
  weaponId: 'weapon_dagger',
  timeWindowId: 'time_pre_blackout',
};

function deterministicRandom(hiddenCaseIndex = 0): FixtureRandomSource {
  let byte = 1;
  return {
    integer: () => hiddenCaseIndex,
    bytes: (length) =>
      Uint8Array.from({ length }, () => {
        const value = byte;
        byte += 1;
        return value;
      }),
  };
}

function createFixture(hiddenCaseIndex = 0) {
  const fixedNow = new Date('2026-07-25T01:00:00.000Z');
  const service = new FixtureGameService({
    store: new FixtureSessionStore({ now: () => fixedNow.getTime() }),
    random: deterministicRandom(hiddenCaseIndex),
    now: () => fixedNow,
  });
  const response = service.createSession();
  return { service, ...response };
}

function renderOpening(overrides: Partial<Parameters<typeof OpeningExperience>[0]> = {}) {
  return renderToStaticMarkup(
    <OpeningExperience
      runtimeLabel="Fixture"
      runtimeMode="fixture"
      runtimeAvailable
      resumable={false}
      resumeChecking={false}
      creationStage="idle"
      error={null}
      motionPreference="system"
      onMotionPreferenceChange={() => undefined}
      onBegin={async () => undefined}
      onContinue={() => undefined}
      {...overrides}
    />,
  );
}

describe('B3 opening state', () => {
  it('renders the initial loading frame, product title, case title, and main menu', () => {
    const markup = renderOpening();
    expect(markup).toContain('Opening the museum');
    expect(markup).toContain('The Last Alibi');
    expect(markup).toContain('The Last Exhibit');
    expect(markup).toContain('Begin Investigation');
  });

  it('skips the opening deterministically', () => {
    expect(advanceOpeningPhase('black', 'skip')).toBe('ready');
    expect(advanceOpeningPhase('title', 'skip')).toBe('ready');
  });

  it('removes intro pacing when reduced motion is requested', () => {
    expect(advanceOpeningPhase('black', 'reduce-motion')).toBe('ready');
    expect(renderOpening({ motionPreference: 'reduce' })).toContain('data-motion="reduced"');
  });

  it('keeps settings and technical details secondary to the primary menu action', () => {
    const markup = renderOpening();
    expect(markup.indexOf('Begin Investigation')).toBeLessThan(markup.indexOf('Settings'));
    expect(markup.indexOf('Settings')).toBeLessThan(markup.indexOf('Technical Details'));
  });

  it('offers Continue only after an active fixture session was validated', () => {
    const { session } = createFixture();
    expect(
      shouldOfferContinue({ runtimeMode: 'fixture', validatedSessionState: session.state }),
    ).toBe(true);
    expect(shouldOfferContinue({ runtimeMode: 'fixture', validatedSessionState: null })).toBe(
      false,
    );
    expect(shouldOfferContinue({ runtimeMode: 'live', validatedSessionState: 'active' })).toBe(
      false,
    );
    expect(renderOpening({ resumable: true })).toContain('Continue Investigation');
    expect(renderOpening({ resumable: false })).not.toContain('Continue Investigation');
  });

  it('enables Practice only in fixture runtime', () => {
    expect(getModeAvailability('fixture')).toEqual({
      practice: 'available',
      ranked: 'unavailable',
    });
    expect(getModeAvailability('live').practice).toBe('unavailable');
  });

  it('keeps Ranked honestly unavailable', () => {
    expect(getModeAvailability('fixture').ranked).toBe('unavailable');
    expect(getModeAvailability('live').ranked).toBe('unavailable');
  });

  it('represents pending, committing, confirmed, and failed creation stages', () => {
    expect(getCreationHeading('preparing')).toBe('Preparing case');
    expect(getCreationHeading('committing')).toBe('Committing case');
    expect(getCreationHeading('confirmed')).toBe('Case confirmed');
    expect(getCreationHeading('failed')).toBe('Case preparation failed');
  });

  it('does not expose a fixture start from an unavailable live runtime', () => {
    expect(getModeAvailability('live').practice).toBe('unavailable');
    const markup = renderOpening({ runtimeMode: 'live', runtimeLabel: 'Live' });
    expect(markup).toContain('Live runtime');
    expect(markup).toContain('Live mode · Runtime capabilities unavailable.');
    expect(markup).not.toContain('The Last Alibi · Fixture mode');
  });
});

describe('B3 investigation semantics', () => {
  it('renders all four rooms as reachable map controls', () => {
    const { session, content } = createFixture();
    const markup = renderToStaticMarkup(
      <MuseumMap
        session={session}
        content={content}
        selectedRoomId="room_gallery"
        disabled={false}
        onEnterRoom={() => undefined}
      />,
    );
    for (const room of content.manifest.rooms) {
      expect(markup).toContain(room.name);
    }
    expect((markup.match(/class="map-room"/g) ?? []).length).toBe(4);
  });

  it.each(['room_gallery', 'room_restoration', 'room_archive', 'room_conservatory'] as const)(
    'renders the room and its matching suspect for %s',
    (roomId) => {
      const { session, content } = createFixture();
      const room = content.manifest.rooms.find((entry) => entry.id === roomId)!;
      const suspect = content.manifest.suspects.find((entry) => entry.primaryRoomId === roomId)!;
      const markup = renderToStaticMarkup(
        <RoomScene
          session={session}
          content={content}
          selectedRoomId={roomId}
          pendingAction={null}
          onCollectObservation={() => undefined}
          onRequestTestimony={() => undefined}
          onBackToMap={() => undefined}
        />,
      );
      expect(markup).toContain(room.name);
      expect(markup).toContain(suspect.name);
      expect(markup).toContain('Available to interview');
    },
  );

  it('keeps testimony visibly and structurally distinct from certified evidence', () => {
    const { service, session, content } = createFixture();
    const withTestimony = service.requestTestimony(session.sessionId, {
      suspectId: 'suspect_archivist',
      questionId: 'question_archivist_blackout',
    }).session;
    const markup = renderToStaticMarkup(
      <Notebook
        session={withTestimony}
        content={content}
        hypothesis={EMPTY_HYPOTHESIS}
        onWarrants={() => undefined}
        onAccusation={() => undefined}
      />,
    );
    expect(markup).toContain('Unverified testimony');
    expect(markup).toContain('no candidate effect');
    expect(markup).toContain('Certified disclosures');
    expect(markup).toContain('changes candidates');
    expect(markup).toContain('evidence-glyph-testimony');
    expect(markup).toContain('evidence-glyph-certified');
  });

  it('renders an explicit empty notebook state', () => {
    const { session, content } = createFixture();
    const markup = renderToStaticMarkup(
      <Notebook
        session={session}
        content={content}
        hypothesis={EMPTY_HYPOTHESIS}
        onWarrants={() => undefined}
        onAccusation={() => undefined}
      />,
    );
    expect(markup).toContain('Nothing pinned yet');
    expect(markup).toContain('No witness statements recorded');
    expect(markup).toContain('No certified YES or NO result requested');
  });

  it('provides notebook close, Warrant Desk, and Make Accusation controls', () => {
    const { session, content } = createFixture();
    const markup = renderToStaticMarkup(
      <Notebook
        session={session}
        content={content}
        hypothesis={EMPTY_HYPOTHESIS}
        onClose={() => undefined}
        onWarrants={() => undefined}
        onAccusation={() => undefined}
      />,
    );
    expect(markup).toContain('Close notebook');
    expect(markup).toContain('Warrant Desk');
    expect(markup).toContain('Make Accusation');
  });

  it('prevents duplicate scripted testimony questions', () => {
    const { service, session } = createFixture();
    const response = service.requestTestimony(session.sessionId, {
      suspectId: 'suspect_archivist',
      questionId: 'question_archivist_blackout',
    });
    expect(
      isDuplicateTestimonyQuestion(
        response.session.testimonyEntries,
        'question_archivist_blackout',
      ),
    ).toBe(true);
    expect(
      isDuplicateTestimonyQuestion(response.session.testimonyEntries, 'question_archivist_curator'),
    ).toBe(false);
  });

  it('renders readable long dialogue history without changing semantics', () => {
    const { service, session, content } = createFixture();
    const response = service.requestTestimony(session.sessionId, {
      suspectId: 'suspect_archivist',
      questionId: 'question_archivist_blackout',
    });
    const entry = response.session.testimonyEntries[0]!;
    const longSession: PublicGameSession = {
      ...response.session,
      testimonyEntries: Array.from({ length: 8 }, (_, index) => ({
        ...entry,
        id: `${entry.id}_${index}`,
      })),
    };
    const markup = renderToStaticMarkup(
      <Notebook
        session={longSession}
        content={content}
        hypothesis={EMPTY_HYPOTHESIS}
        onWarrants={() => undefined}
        onAccusation={() => undefined}
      />,
    );
    expect((markup.match(/Unverified testimony/g) ?? []).length).toBeGreaterThan(0);
    expect(markup).not.toContain('certified-disclosure');
  });
});

describe('B3 warrant and accusation state', () => {
  it('maps safe, implied, unavailable, and confirmed warrant states', () => {
    const { session } = createFixture();
    const available = session.predicateStatuses[0]!;
    expect(getWarrantPresentationState(available, session.currentCandidateCount)).toBe('safe');
    expect(
      getWarrantPresentationState(
        { ...available, yesCandidateCount: session.currentCandidateCount },
        session.currentCandidateCount,
      ),
    ).toBe('implied');
    expect(getWarrantPresentationState({ ...available, availability: 'unsafe' }, 64)).toBe(
      'unavailable',
    );
    expect(getWarrantPresentationState({ ...available, availability: 'used' }, 64)).toBe(
      'confirmed',
    );
  });

  it('reports the worst-case survivor count', () => {
    const { session } = createFixture();
    const predicate = session.predicateStatuses[0]!;
    expect(getWorstCaseSurvivorCount(predicate)).toBe(
      Math.max(predicate.yesCandidateCount, predicate.noCandidateCount),
    );
  });

  it('renders the Warrant Desk budget and binary branch previews', () => {
    const { session } = createFixture();
    const markup = renderToStaticMarkup(
      <WarrantDesk
        session={session}
        pendingAction={null}
        onRequestWarrant={() => undefined}
        onReturn={() => undefined}
      />,
    );
    expect(markup).toContain('Warrant Desk');
    expect(markup).toContain('Budget remaining');
    expect(markup).toContain('Worst case');
    expect(markup).toContain('No certified result yet');
  });

  it('requires all four accusation dimensions', () => {
    expect(isAccusationComplete(EMPTY_HYPOTHESIS)).toBe(false);
    expect(isAccusationComplete(COMPLETE_HYPOTHESIS)).toBe(true);
  });

  it('renders every accusation dimension and terminal warning', () => {
    const { session, content } = createFixture();
    const markup = renderToStaticMarkup(
      <AccusationBuilder
        session={session}
        content={content}
        hypothesis={COMPLETE_HYPOTHESIS}
        confirmTerminal={false}
        pendingAction={null}
        onHypothesisChange={() => undefined}
        onConfirmTerminalChange={() => undefined}
        onSubmitAccusation={() => undefined}
        onReturn={() => undefined}
      />,
    );
    expect(markup).toContain('Who?');
    expect(markup).toContain('Where?');
    expect(markup).toContain('With what?');
    expect(markup).toContain('When?');
    expect(markup).toContain('This action is terminal');
  });

  it('prevents duplicate terminal submission while pending or terminal', () => {
    const { service, session } = createFixture();
    expect(
      terminalSubmissionDisabled({
        hypothesis: COMPLETE_HYPOTHESIS,
        confirmed: true,
        pendingAction: 'accusation',
        session,
      }),
    ).toBe(true);
    const terminal = service.accuse(session.sessionId, {
      ...COMPLETE_HYPOTHESIS,
      confirmTerminal: true,
    });
    expect(
      terminalSubmissionDisabled({
        hypothesis: COMPLETE_HYPOTHESIS,
        confirmed: true,
        pendingAction: null,
        session: terminal.session,
      }),
    ).toBe(true);
  });

  it.each([
    ['YES', 0, COMPLETE_HYPOTHESIS],
    ['NO', 0, { ...COMPLETE_HYPOTHESIS, suspectId: 'suspect_security' } as InvestigationHypothesis],
  ] as const)(
    'renders the terminal %s outcome without solution disclosure',
    (result, hidden, theory) => {
      const { service, session } = createFixture(hidden);
      const terminal = service.accuse(session.sessionId, {
        ...theory,
        confirmTerminal: true,
      }).session;
      const markup = renderToStaticMarkup(
        <VerdictExperience
          result={result}
          session={terminal}
          runtimeLabel="Fixture"
          onRestart={() => undefined}
        />,
      );
      expect(markup).toContain(`>${result}</h1>`);
      expect(markup).not.toContain('hiddenCase');
      expect(markup).not.toContain('suspect_archivist');
      expect(markup).not.toContain('room_gallery');
      if (result === 'NO') expect(markup).toContain('solution remains sealed');
    },
  );
});

describe('B3 accessibility, technical policy, and responsiveness', () => {
  it('keeps the technical receipt optional and free of fabricated live identifiers', () => {
    const { session } = createFixture();
    const markup = renderToStaticMarkup(
      <TechnicalDetails session={session} runtimeLabel="Fixture" onClose={() => undefined} />,
    );
    expect(markup).toContain('Optional receipt');
    expect(markup).toContain('no live identifiers exist');
    expect(markup).not.toContain('0x');
    expect(markup).not.toContain('https://');
  });

  it('labels fixture testimony without claiming live partner verification', () => {
    const { service, session } = createFixture();
    const response = service.requestTestimony(session.sessionId, {
      suspectId: 'suspect_archivist',
      questionId: 'question_archivist_blackout',
    });
    expect(response.entry.evidenceClass).toBe('unverified-testimony');
    expect(JSON.stringify(response)).not.toContain('verified-0g');
  });

  it('cycles focus at both edges of a modal and leaves middle focus unchanged', () => {
    const first = {} as HTMLElement;
    const middle = {} as HTMLElement;
    const last = {} as HTMLElement;
    expect(getTrappedFocusTarget([first, middle, last], first, true)).toBe(last);
    expect(getTrappedFocusTarget([first, middle, last], last, false)).toBe(first);
    expect(getTrappedFocusTarget([first, middle, last], middle, false)).toBeNull();
  });

  it('filters hidden controls out of the focus trap', () => {
    const visible = { hidden: false, getAttribute: () => null } as unknown as HTMLElement;
    const hidden = { hidden: true, getAttribute: () => null } as unknown as HTMLElement;
    const container = {
      querySelectorAll: () => [visible, hidden],
    } as unknown as HTMLElement;
    expect(getFocusableElements(container)).toEqual([visible]);
  });

  it('uses text and iconography for critical states instead of color alone', () => {
    const { session } = createFixture();
    const markup = renderToStaticMarkup(
      <WarrantDesk
        session={session}
        pendingAction={null}
        onRequestWarrant={() => undefined}
        onReturn={() => undefined}
      />,
    );
    expect(markup).toContain('Safe to request');
    expect(markup).toContain('file-state');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('defines desktop, tablet, and mobile shell modes at supported widths', () => {
    expect(getResponsiveShellMode(1440)).toBe('desktop');
    expect(getResponsiveShellMode(1280)).toBe('desktop');
    expect(getResponsiveShellMode(768)).toBe('mobile');
    expect(getResponsiveShellMode(390)).toBe('mobile');
    expect(getResponsiveShellMode(900)).toBe('tablet');
  });

  it('contains explicit responsive and overflow guards in the game stylesheet', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'app', 'investigation.css'), 'utf8');
    expect(css).toContain('@media (max-width: 1120px)');
    expect(css).toContain('@media (max-width: 780px)');
    expect(css).toContain('minmax(0, 1fr)');
    expect(css).toContain('overflow: hidden');
  });

  it('does not introduce positive tabindex values into the game controls', () => {
    const opening = renderOpening();
    expect(opening).not.toMatch(/tabindex="[1-9]/);
  });

  it('renders plain-language failure feedback with a safe next action', () => {
    const markup = renderOpening({
      creationStage: 'failed',
      error: 'The fixture session could not be created.',
    });
    expect(markup).toContain('Case preparation failed');
    expect(markup).toContain('Try again');
    expect(markup).toContain('Return to menu');
  });
});
