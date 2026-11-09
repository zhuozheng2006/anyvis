import { describe, it, expect } from 'vitest';
import { createEmptyProject, validateProject } from './core/project.ts';
import { compileProject } from './core/compiler.ts';
import { createSurfaceActions, SURFACE_PRESETS } from './surface3d';
import { createProbabilityActions, DISTRIBUTION_PRESETS, sampleDistribution } from './probability';
import { createPolarParametricActions, POLAR_PARAMETRIC_PRESETS } from './polar-parametric';
import { evaluateScalarExpressionAt } from './ExpressionPlotPreview';

const fresh = () => ({ ...createEmptyProject(), workspace: { blocks: 'stale Blockly snapshot' } });
describe('workbench production insertion', () => {
  for (const preset of SURFACE_PRESETS) it(`compiles real ${preset.id} surface geometry`, () => {
    const result = createSurfaceActions(fresh(), preset);
    expect(result.project.workspace).toBeUndefined();
    expect(validateProject(result.project)).toEqual(result.project);
    const compiled = compileProject(result.project);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.requiresTrust).toBe(false);
    const surface = result.project.actions.find(a => a.type === 'surface')!;
    const point = ['xExpr','yExpr','zExpr'].map(field => evaluateScalarExpressionAt(String(surface.fields[field]), {u: 0.4, v: 0.7}));
    point.forEach((v,i) => expect(v).toBeCloseTo(preset.func(0.4,0.7)[i], 9));
  });
  for (const preset of POLAR_PARAMETRIC_PRESETS) it(`preserves ${preset.id} preview parameters`, () => {
    const params = Object.fromEntries(preset.params.map(p => [p.key, p.max]));
    const result = createPolarParametricActions(fresh(), preset, params);
    const curve = result.project.actions[0];
    expect(compileProject(result.project).diagnostics).toEqual([]);
    for (const t of [0, 0.8, 2.1]) {
      const expected = preset.evalPoint(t, params);
      expect(evaluateScalarExpressionAt(String(curve.fields.xExpr), {t})).toBeCloseTo(expected[0], 9);
      expect(evaluateScalarExpressionAt(String(curve.fields.yExpr), {t})).toBeCloseTo(expected[1], 9);
    }
  });
  for (const preset of DISTRIBUTION_PRESETS) it(`inserts actual ${preset.id} density or probability mass`, () => {
    const params = { ...preset.defaultParams, mu: 2, sigma: 0.5, lambda: 3, n: 8, p: 0.2 };
    const result = createProbabilityActions(fresh(), preset, params);
    expect(compileProject(result.project).diagnostics).toEqual([]);
    const data = sampleDistribution(preset, params);
    if (preset.id === 'normal' || preset.id === 'exponential') {
      const curve = result.project.actions.find(a => a.type === 'function_plot')!;
      for (const point of data.points) expect(evaluateScalarExpressionAt(String(curve.fields.expression), {x: point.x})).toBeCloseTo(point.y, 10);
    } else {
      const bars = result.project.actions.filter(a => a.type === 'rectangle');
      expect(bars).toHaveLength(data.points.filter(p => p.y > 0).length);
      bars.forEach((bar,i) => expect(Number(bar.fields.height)).toBeCloseTo(Math.max(0.01, data.points[i].y*5/(data.maxY*1.15)),9));
    }
    expect(result.project.workspace).toBeUndefined();
  });
  it('supports repeated insertion with unique names', () => {
    let p = createEmptyProject();
    for (let i=0;i<3;i++) p=createSurfaceActions(p,SURFACE_PRESETS[0]).project;
    expect(compileProject(p).diagnostics).toEqual([]);
  });
});
