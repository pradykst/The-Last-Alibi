import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import GameShell, { TerminalView } from '../src/components/game-shell';
import { separateEvidence, submissionsAreDisabled } from '../src/components/game-shell-helpers';

describe('playable game shell', () => {
  it('renders the fixture intro and playable start control', () => {
    const markup = renderToStaticMarkup(<GameShell runtimeLabel="Fixture" runtimeAvailable />);

    expect(markup).toContain('The Last Alibi');
    expect(markup).toContain('Begin investigation');
    expect(markup).toContain('Fixture mode');
    expect(markup).not.toContain('Connect wallet');
  });

  it('keeps evidence classes structurally separate', () => {
    const evidence = separateEvidence({
      collectedObservationIds: ['observation_gallery_clock'],
      testimonyEntries: [],
      certifiedDisclosures: [],
      playerHypothesis: ['Ada Vale'],
    });

    expect(evidence.publicObservations).toEqual(['observation_gallery_clock']);
    expect(evidence.unverifiedTestimony).toEqual([]);
    expect(evidence.certifiedDisclosures).toEqual([]);
    expect(evidence.playerHypothesis).toEqual(['Ada Vale']);
  });

  it('disables duplicate submissions while any action is pending', () => {
    expect(submissionsAreDisabled('warrant', false)).toBe(true);
    expect(submissionsAreDisabled(null, false)).toBe(false);
    expect(submissionsAreDisabled(null, true)).toBe(true);
  });

  it.each(['YES', 'NO'] as const)('renders only the binary %s fixture verdict', (result) => {
    const markup = renderToStaticMarkup(
      <TerminalView result={result} onRestart={() => undefined} />,
    );

    expect(markup).toContain(`>${result}</h1>`);
    expect(markup).not.toContain('suspect_archivist');
    expect(markup).not.toContain('room_gallery');
    expect(markup).not.toContain('hidden');
  });
});
