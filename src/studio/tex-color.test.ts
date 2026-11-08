import { describe, it, expect } from 'vitest';
import {
  tokenizeTexFormula,
  applyColorsToTex,
  generateColoredMathTexPython,
  createColoredMathTexActions,
  TEX_STYLING_PRESETS,
  PALETTE_3B1B,
} from './tex-color';
import { createEmptyProject } from './core/project';

describe('LaTeX color styler engine', () => {
  it('has curated 3B1B color palette and classic presets', () => {
    expect(PALETTE_3B1B.length).toBeGreaterThanOrEqual(6);
    expect(PALETTE_3B1B.some(c => c.hex.toLowerCase() === '#e2b340')).toBe(true);

    expect(TEX_STYLING_PRESETS.length).toBeGreaterThanOrEqual(5);
    const euler = TEX_STYLING_PRESETS.find(p => p.id === 'euler-identity');
    expect(euler).toBeDefined();
    expect(euler?.rawTex).toContain('e^{i\\pi}');
  });

  it('tokenizes raw LaTeX formulas into meaningful math chunks', () => {
    const raw = 'e^{i\\pi} + 1 = 0';
    const tokens = tokenizeTexFormula(raw);
    expect(tokens.length).toBeGreaterThanOrEqual(4);
    expect(tokens.some(t => t.text.includes('e'))).toBe(true);
    expect(tokens.some(t => t.text.includes('\\pi') || t.text.includes('pi'))).toBe(true);
  });

  it('applies color map to produce isolated LaTeX chunks and styled LaTeX code', () => {
    const raw = 'a^2 + b^2 = c^2';
    const colorMap: Record<string, string> = {
      a: '#e2b340',
      b: '#58c4dd',
      c: '#83c167',
    };

    const result = applyColorsToTex(raw, colorMap);
    expect(result.coloredTex).toContain('\\color{#e2b340}{a}');
    expect(result.coloredTex).toContain('\\color{#58c4dd}{b}');
    expect(result.coloredTex).toContain('\\color{#83c167}{c}');
    expect(result.isolatedSubstrings).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('generates valid standalone Manim CE Python code for colored MathTex', () => {
    const raw = 'E = m c^2';
    const colorMap: Record<string, string> = {
      E: '#e2b340',
      m: '#58c4dd',
      c: '#83c167',
    };

    const py = generateColoredMathTexPython(raw, colorMap);
    expect(py).toContain('class ColoredTexScene(Scene):');
    expect(py).toContain('MathTex(');
    expect(py).toContain('set_color_by_tex');
    expect(py).toContain('Write(');
  });

  it('creates AnyVis project actions for styled MathTex object', () => {
    const project = createEmptyProject();
    const raw = 'f(x) = \\int_a^b g(t) dt';
    const colorMap: Record<string, string> = {
      x: '#e2b340',
      t: '#58c4dd',
    };

    const { project: nextProject, actionIds } = createColoredMathTexActions(project, raw, colorMap, '彩色微积分公式');
    expect(actionIds.length).toBeGreaterThanOrEqual(1);
    const flattened = nextProject.actions;
    expect(flattened.some(a => String(a.fields.name || '').includes('彩色微积分公式'))).toBe(true);
    expect(flattened.some(a => String(a.fields.text || '').includes('\\color'))).toBe(true);
  });
});
