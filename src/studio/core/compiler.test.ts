import { describe, expect, it } from 'vitest';
import { createAction } from './catalog.ts';
import { compileProject } from './compiler.ts';
import { compileExpression } from './expression.ts';
import { createEmptyProject, validateProject } from './project.ts';
import type { Action } from './types.ts';
const project = (...actions: Action[]) => ({ ...createEmptyProject(), actions });
const errors = (...actions: Action[]) => compileProject(project(...actions)).diagnostics.filter((d) => d.severity === 'error');
const parallel = (...children: Action[]) => ({ ...createAction('parallel'), children });

describe('native scene compilation', () => {
  it('preserves the source identity for Transform but retires it for ReplacementTransform', () => {
    const circle = createAction('circle', { name: 'A' });
    const square = createAction('square', { name: 'B', appear: 'hidden' });
    expect(errors(circle, square, createAction('transform', { target: 'A', destination: 'B' }), createAction('move', { target: 'A' }))).toEqual([]);
    expect(errors(circle, square, createAction('replacement_transform', { target: 'A', destination: 'B' }), createAction('move', { target: 'A' }))[0]?.message).toContain('已被替换');
    expect(errors(circle, square, createAction('replacement_transform', { target: 'A', destination: 'B' }), createAction('move', { target: 'B' }))).toEqual([]);
  });
  it('compiles parallel work as one native group, with max rather than sum duration', () => {
    const p = project(createAction('circle', { name: 'A', appear: 'none' }), createAction('square', { name: 'B', appear: 'none' }), parallel(createAction('move', { target: 'A', duration: 2 }), createAction('rotate', { target: 'B', duration: 3 })));
    const c = compileProject(p);
    expect(c.duration).toBe(3);
    expect(c.code.match(/self.play\(/g)).toHaveLength(1);
    expect(c.code).toContain('AnimationGroup(');
    expect(c.diagnostics).toEqual([]);
  });
  it('rejects overlapping writes through both direct and group aliases', () => {
    const a = createAction('circle', { name: 'A' });
    const group = createAction('group', { name: 'G', members: 'A' });
    expect(errors(a, parallel(createAction('move', { target: 'A' }), createAction('rotate', { target: 'A' })))[0]?.message).toContain('同一个对象');
    expect(errors(a, group, parallel(createAction('move', { target: 'G' }), createAction('rotate', { target: 'A' })))[0]?.message).toContain('同一个对象');
  });
  it('rejects references before declaration and duplicate object names', () => {
    expect(errors(createAction('move', { target: 'missing' }))[0]?.message).toContain('找不到对象');
    expect(errors(createAction('circle'), createAction('circle'))[0]?.message).toContain('已经存在');
  });
  it('quotes names and text without allowing Python statement injection', () => {
    const a = createAction('text', { name: 'q";print(9)#', text: '\"); __import__(\"os\").system(\"echo bad\"); #' });
    const c = compileProject(project(a));
    expect(c.diagnostics).toEqual([]);
    expect(c.code).toContain('objects["q\\\";print(9)#"] = Text(');
    expect(c.sourceMap[Object.keys(c.sourceMap).map(Number).at(-1)!]).toBe(a.id);
  });
  it('rejects Python syntax in math and dangerous TeX primitives', () => {
    const p = createAction('tracker', { name: 'a' });
    expect(errors(p, createAction('dynamic_dot', { xExpr: '__import__("os")' }))[0]?.message).toMatch(/数学表达式/);
    expect(errors(createAction('formula', { tex: '\\input{/etc/passwd}' }))[0]?.message).toContain('LaTeX');
    expect(errors(createAction('formula', { tex: '\\csname input\\endcsname{file}' }))[0]?.message).toContain('LaTeX');
    expect(errors(createAction('formula', { tex: '\\frac{x^2}{2}+\\sqrt{y}' }))).toEqual([]);
  });
  it('bounds expansion and duration before rendering', () => {
    const repeat = createAction('repeat', { count: 50 });
    repeat.children = [createAction('wait', { duration: 120 })];
    expect(errors(repeat).some((d) => /预算|10 分钟/.test(d.message))).toBe(true);
  });
  it('keeps normal waits automatic and marks Python extensions as trusted only', () => {
    const wait = compileProject(project(createAction('wait', { duration: 2 })));
    expect(wait.duration).toBe(2);
    expect(wait.requiresTrust).toBe(false);
    const code = compileProject(project(createAction('code', { code: 'self.wait(2)' })));
    expect(code.requiresTrust).toBe(true);
    expect(code.duration).toBeNull();
  });
  it('rejects unsupported fields and invalid 3D combinations', () => {
    const a = createAction('circle'); a.fields.command = 'unsafe';
    expect(() => validateProject(project(a))).toThrow('未知字段');
    expect(errors(createAction('surface'))[0]?.message).toContain('三维');
  });
});

describe('restricted scalar math grammar', () => {
  it('preserves precedence including unary minus and right-associative powers', () => {
    expect(compileExpression('-x^2+2^3^2', { x: 'x' })).toBe('((-(x ** 2)) + (2 ** (3 ** 2)))');
    expect(compileExpression('sin(a*x)+pi', { a: 'objects["a"].get_value()', x: 'x' })).toContain('np.sin');
  });
  it('rejects attributes, indexing, nonfinite constants and wrong arity', () => {
    for (const source of ['x.__class__', 'x[0]', '1e999', 'sin(1,2)', 'max()', 'x;1', 'unknown(x)']) expect(() => compileExpression(source, { x: 'x' })).toThrow();
  });
});
