import { describe, expect, it } from 'vitest';

import { GUARANTEES } from '../src/lib/page-content';
import { buildPageRuntimeModel } from '../src/server/page-runtime';

describe('public page model', () => {
  it('contains the three canonical guarantees', () => {
    expect(GUARANTEES.map((guarantee) => guarantee.title)).toEqual([
      'AI cannot rewrite the truth.',
      'The detective cannot extract unlimited hidden information.',
      'The publisher cannot change the ending after committing it.',
    ]);
  });

  it('labels development fixture mode without claiming live capabilities', () => {
    expect(buildPageRuntimeModel({ NODE_ENV: 'development' })).toEqual({
      available: true,
      mode: 'fixture',
      label: 'Fixture',
      summary: 'All capabilities are clearly labelled fixtures.',
    });
  });
});
