import { describe, expect, it } from 'vitest';
import { CURATED_BLOCK_CATALOG, createAction } from './catalog.ts';
import { compileProject } from './compiler.ts';
import { NATIVE_API_MAP } from './native-api-map.ts';
import { createEmptyProject } from './project.ts';
import type { Action } from './types.ts';
const compile = (...actions: Action[]) => compileProject({ ...createEmptyProject(), actions });
const errors = (...actions: Action[]) => compile(...actions).diagnostics.filter(d => d.severity === 'error');

describe('native coverage expansion', () => {
  it('rejects inverted ring/star radii and degenerate geometry before native rendering', () => {
    for (const type of ['annulus', 'annular_sector', 'star']) expect(errors(createAction(type, { innerRadius: 2, outerRadius: 1 }))[0]?.message).toContain('内半径');
    expect(errors(createAction('sector', { angle: 0 }))[0]?.message).toContain('角度');
    expect(errors(createAction('dashed_line', { x1: 0, x2: 0, y1: 0, y2: 0 }))[0]?.message).toContain('端点');
    expect(errors(createAction('dashed_line', { x1: -100, x2: 100, dashLength: 0.01 }))[0]?.message).toContain('段数');
  });
  it('keeps the source usable after copy transformation and reserves both participants in parallel', () => {
    const base = [createAction('circle', { name: 'source' }), createAction('square', { name: 'destination', appear: 'hidden' })];
    const copy = createAction('transform_from_copy', { target: 'source', destination: 'destination' });
    const result = compile(...base, copy, createAction('move', { target: 'source' }));
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain('TransformFromCopy(');
    const together = { ...createAction('parallel'), children: [copy, createAction('rotate', { target: 'destination' })] };
    expect(errors(...base, together)[0]?.message).toContain('同一个对象');
  });
  it('uses a temporary copy for passing flashes and keeps group/text inputs typed', () => {
    const circle = createAction('circle');
    expect(compile(circle, createAction('passing_flash')).code).toContain('ShowPassingFlash(objects["圆"].copy()');
    expect(errors(circle, createAction('type_text', { target: '圆' }))[0]?.message).toContain('类型');
    expect(errors(circle, createAction('reveal_group', { target: '圆' }))[0]?.message).toContain('组合对象');
  });
  it('keeps draw order separate from three-dimensional position', () => {
    const result = compile(createAction('circle', { z: 2 }), createAction('set_layer', { layer: 5 }));
    expect(result.code).toContain('.move_to([0, 0, 2])');
    expect(result.code).toContain('.set_z_index(5)');
  });
  it('accounts for every catalogue entry without counting arbitrary code as native support', () => {
    expect(Object.keys(NATIVE_API_MAP).sort()).toEqual(CURATED_BLOCK_CATALOG.map(b => b.type).sort());
    for (const block of CURATED_BLOCK_CATALOG) expect(block.nativeApis).toEqual(NATIVE_API_MAP[block.type]);
    expect(NATIVE_API_MAP.code).toEqual([]);
    expect(NATIVE_API_MAP.sequence).toEqual([]);
    expect(NATIVE_API_MAP.repeat).toEqual([]);
  });
});
