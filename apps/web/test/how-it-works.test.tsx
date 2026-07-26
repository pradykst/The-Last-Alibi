import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import HowItWorksExperience, {
  clampPresentationIndex,
  getCandidatePartition,
} from '../src/components/how-it-works-experience';

describe('How It Works presentation and documentation', () => {
  it('renders the 60-second briefing before the deep dive', () => {
    const markup = renderToStaticMarkup(<HowItWorksExperience />);
    expect(markup).toContain('A PROVABLE AI DETECTIVE GAME');
    expect(markup).toContain('The mystery plays like a game.');
    expect(markup).toContain('A cinematic detective game built around one unchangeable truth.');
    expect(markup).not.toContain('crypto dashboard');
    expect(markup).toContain('Present in 60 seconds');
    expect(markup.indexOf('THE 60-SECOND BRIEFING')).toBeLessThan(markup.indexOf('DEEP DIVE'));
    expect(markup).toContain('01 · THE PRODUCT');
    expect(markup).toContain('05 · PRODUCT WEDGE');
  });

  it('provides every deep-link section and a return to the playable investigation', () => {
    const markup = renderToStaticMarkup(<HowItWorksExperience />);
    for (const id of [
      'overview',
      'player-loop',
      'truth-model',
      'zero-knowledge',
      'architecture',
      'trust-boundaries',
      'market',
      'gtm',
      'status',
    ]) {
      expect(markup).toContain(`id="${id}"`);
    }
    expect(markup).toContain('href="/"');
    expect(markup).toContain('Begin Investigation');
  });

  it('keeps the candidate explainer local, deterministic, and safety-gated', () => {
    const suspect = getCandidatePartition('suspect-ada');
    expect([suspect.yes.length, suspect.no.length, suspect.authorized]).toEqual([16, 48, true]);
    const room = getCandidatePartition('room-gallery');
    expect([room.yes.length, room.no.length, room.authorized]).toEqual([16, 48, true]);
    const weapon = getCandidatePartition('weapon-dagger');
    expect([weapon.yes.length, weapon.no.length, weapon.authorized]).toEqual([32, 32, true]);
    const exact = getCandidatePartition('exact-case');
    expect([exact.yes.length, exact.no.length, exact.authorized]).toEqual([1, 63, false]);
  });

  it('bounds presentation navigation to five chapters', () => {
    expect(clampPresentationIndex(-1)).toBe(0);
    expect(clampPresentationIndex(0)).toBe(0);
    expect(clampPresentationIndex(4)).toBe(4);
    expect(clampPresentationIndex(5)).toBe(4);
  });

  it('renders formulas as KaTeX and the approved architecture as an expandable control', () => {
    const markup = renderToStaticMarkup(<HowItWorksExperience />);
    expect(markup).toContain('class="katex-display"');
    expect(markup).toContain('/assets/architecture/authority-execution.png');
    expect(markup).toContain('Expand architecture');
    expect(markup).toContain('aria-label="Expand authority and execution architecture diagram"');
  });

  it('states fixture and live capability boundaries without fabricated partner success', () => {
    const markup = renderToStaticMarkup(<HowItWorksExperience />);
    expect(markup).toContain('Practice Investigation is playable now.');
    expect(markup).toContain('deterministic fixture state');
    expect(markup).toContain('BUILD STATUS &amp; LIMITATIONS');
    expect(markup).toContain('Sui canonical Move state');
    expect(markup).toContain('0G verified inference');
    expect(markup).toContain('Unavailable');
    expect(markup).toContain('Published on testnet; web unwired');
    expect(markup).toContain('Testnet accepted; web unwired');
    expect(markup).not.toContain('Live testnet verified');
    expect(markup).not.toContain('0x123');
  });

  it('uses text as well as iconography for all capability statuses', () => {
    const markup = renderToStaticMarkup(<HowItWorksExperience />);
    expect(markup).toContain('Live in this build');
    expect(markup).toContain('Locally verified');
    expect(markup).toContain('Designed');
    expect(markup).toContain('Unavailable');
    expect(markup).toContain('<i aria-hidden="true"></i>');
  });
});
