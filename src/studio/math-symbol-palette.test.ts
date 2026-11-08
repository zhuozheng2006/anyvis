import { describe, expect, it } from 'vitest';
import { extractFormulaTokens } from './MathSymbolPalette';

describe('math formula token segmentation', () => {
  it('extracts matching double braces chunks for matching_tex', () => {
    const raw = '{{(}} {{a}} + {{b}} {{)}}^2';
    const tokens = extractFormulaTokens(raw);

    const chunks = tokens.filter(t => t.isChunk).map(t => t.text);
    expect(chunks).toEqual(['(', 'a', 'b', ')']);

    expect(tokens[0]).toEqual({ text: '(', isChunk: true });
    expect(tokens[1]).toEqual({ text: ' ', isChunk: false });
    expect(tokens[2]).toEqual({ text: 'a', isChunk: true });
  });

  it('handles strings without chunks', () => {
    const raw = 'x^2 + y^2 = r^2';
    const tokens = extractFormulaTokens(raw);
    expect(tokens).toEqual([{ text: 'x^2 + y^2 = r^2', isChunk: false }]);
  });

  it('handles empty strings', () => {
    expect(extractFormulaTokens('')).toEqual([]);
  });
});
