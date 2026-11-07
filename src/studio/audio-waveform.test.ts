import { expect, it } from 'vitest';
import { envelope } from './AudioWaveform';
it('preserves peaks, silence and both stereo channels in the waveform envelope', () => {
  expect(envelope([new Float32Array([0, 0, -.5, .2, 0, 0]), new Float32Array([0, 0, 0, 0, .8, -.1])], 3)).toEqual([0, .5, expect.closeTo(.8)]);
  expect(envelope([])).toEqual([]);
});
