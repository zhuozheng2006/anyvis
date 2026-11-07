import { expect, it } from 'vitest';
import { AUTHORING_PROTOCOL, engineCompatibilityError } from './protocol';
it('rejects stale and future authoring engines before submitting a project', () => {
  for (const authoringProtocol of [undefined, 0, 1, AUTHORING_PROTOCOL + 1])
    expect(engineCompatibilityError({ authoringProtocol })).toContain('版本不一致');
  expect(engineCompatibilityError({ authoringProtocol: AUTHORING_PROTOCOL })).toBeNull();
});
