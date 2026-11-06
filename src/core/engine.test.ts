import { describe, expect, it } from 'vitest';
import { evaluateExpression, evaluateProject, nextCue, topologicalSort, validateProject } from './engine';
import { createBlank, createDemo } from './presets';

describe('deterministic scene evaluation', () => {
  it('evaluates both demos with a valid dependency order', () => {
    for (const dimension of ['2d', '3d'] as const) {
      const project = createDemo(dimension);
      expect(validateProject(project)).toEqual(project);
      const frame = evaluateProject(project, 3);
      expect(frame.errors).toEqual([]);
      const point = frame.objects.find(object => object.id === 'point')!;
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(frame.parameters.radius);
      expect(frame.nodeValues.point_x).toEqual(point.x);
    }
  });
  it('seeks backwards without accumulating previous frame state', () => {
    const project = createDemo('2d');
    const before = JSON.stringify(project);
    const a = evaluateProject(project, 3.4);
    evaluateProject(project, 10);
    expect(evaluateProject(project, 3.4)).toEqual(a);
    expect(JSON.stringify(project)).toBe(before);
  });
  it('uses complete clip values between clips and later clips on overlap', () => {
    const project = createBlank('2d');
    project.clips = [
      { id: 'first', parameterId: 'value', start: 2, duration: 2, from: 1, to: 3, easing: 'linear' },
      { id: 'second', parameterId: 'value', start: 6, duration: 2, from: 3, to: 5, easing: 'linear' },
    ];
    expect(evaluateProject(project, 0).parameters.value).toBe(1);
    expect(evaluateProject(project, 3).parameters.value).toBe(2);
    expect(evaluateProject(project, 5).parameters.value).toBe(3);
    expect(evaluateProject(project, 7).parameters.value).toBe(4);
    expect(evaluateProject(project, 12).parameters.value).toBe(5);
  });
  it('manual parameters override animation and obey slider bounds', () => {
    const project = createDemo('2d');
    const frame = evaluateProject(project, 4, { radius: 2, speed: 100 });
    expect(frame.parameters.radius).toBe(2);
    expect(frame.parameters.speed).toBe(2);
    const point = frame.objects.find(object => object.id === 'point')!;
    expect(Math.hypot(point.x, point.y)).toBeCloseTo(2);
  });
  it('reports a failing node and does not bind stale or invalid values', () => {
    const project = createDemo('2d');
    project.nodes.find(node => node.id === 'cosine')!.expression = 'sqrt(-1)';
    const frame = evaluateProject(project, 2);
    expect(frame.errors.join(' ')).toContain('上游节点计算失败');
    expect(frame.nodeValues.cosine).toBeUndefined();
    expect(frame.objects.find(object => object.id === 'point')!.x).toBe(1.4);
    expect(frame.errors.length).toBeGreaterThanOrEqual(2);
  });
  it('rejects cycles, dangling references and duplicate graph node IDs', () => {
    const project = createDemo('2d');
    project.edges.push({ id: 'cycle', source: 'point_x', target: 'angle', input: 'a' });
    expect(() => topologicalSort(project.nodes, project.edges)).toThrow('循环');
    expect(evaluateProject(project, 2).errors[0]).toContain('循环');
    expect(() => topologicalSort(project.nodes, [{ id: 'bad', source: 'gone', target: 'angle', input: 'a' }])).toThrow('不存在');
    expect(() => topologicalSort([project.nodes[0], project.nodes[0]], [])).toThrow('重复');
  });
});

describe('mathematical expression boundary', () => {
  it('supports scientific expressions and supplied variables', () => {
    expect(evaluateExpression('r * sin(pi / 2) + a^2', { r: 3, a: 2 })).toBeCloseTo(7);
    expect(evaluateExpression('max(1, abs(-4))', {})).toBe(4);
  });
  it.each(['a = 4', 'a.b', 'import("x")', '[1, 2]', 'constructor', 'sqrt(-1)', '1/0', 'factorial(100000)', 'sin.constructor(1)', 'x[1]'])("rejects unsupported input %s", expression => {
    expect(() => evaluateExpression(expression, { a: 1 })).toThrow();
  });
});

describe('interactive playback cues', () => {
  const cues = [{ id: 'b', time: 8, title: 'B', description: '' }, { id: 'a', time: 4, title: 'A', description: '' }];
  it('stops at the first crossed cue even when frames jump', () => {
    expect(nextCue(cues, 3, 9, new Set())?.id).toBe('a');
    expect(nextCue(cues, 4, 9, new Set(['a']))?.id).toBe('b');
  });
  it('does not trigger on backward seeking, or re-trigger visited cues', () => {
    expect(nextCue(cues, 9, 2, new Set())).toBeUndefined();
    expect(nextCue(cues, 4, 5, new Set(['a']))).toBeUndefined();
  });
  it('accepts a cue at the start of playback', () => {
    expect(nextCue([{ ...cues[0], time: 0 }], 0, 0.01, new Set())?.id).toBe('b');
  });
});

describe('project import validation', () => {
  it('returns an independent copy of valid projects', () => {
    const project = createDemo('2d'); const copy = validateProject(project);
    expect(copy).toEqual(project); expect(copy).not.toBe(project);
  });
  it('rejects unsupported version, nonfinite values, duplicates and missing references', () => {
    const project = createDemo('2d');
    expect(() => validateProject({ ...project, version: 9 })).toThrow();
    expect(() => validateProject({ ...project, duration: Infinity })).toThrow();
    expect(() => validateProject({ ...project, parameters: [project.parameters[0], project.parameters[0]] })).toThrow();
    expect(() => validateProject({ ...project, objects: [] })).toThrow();
    expect(() => validateProject({ ...project, cues: [{ ...project.cues[0], time: 100 }] })).toThrow();
    expect(() => validateProject({ ...project, code: 'x'.repeat(20001) })).toThrow();
  });
  it('preserves UUID identities and editing drafts across JSON round-trips', () => {
    const project = createBlank('2d');
    project.name = '';
    project.objects = [{ id: '123e4567-e89b-12d3-a456-426614174000', name: '', kind: 'curve', color: '#fff', visible: true, x: 0, y: 0, z: 0, scale: 1, rotation: 0, expression: '' }];
    project.nodes = [{ id: '2node', kind: 'formula', label: '', position: { x: 0, y: 0 }, expression: '' }];
    project.clips = [{ id: '3clip', parameterId: 'value', start: 11.9, duration: .1, from: 1, to: 2, easing: 'linear' }];
    expect(validateProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(evaluateProject(project, 0).errors[0]).toContain('表达式');
  });
  it('rejects dangerous identifiers, reversed ranges and duplicate input ports', () => {
    const project = createDemo('2d');
    expect(() => validateProject({ ...project, parameters: [{ ...project.parameters[0], id: '__proto__' }] })).toThrow();
    expect(() => validateProject({ ...project, parameters: [{ ...project.parameters[0], min: 3, max: 2 }] })).toThrow();
    expect(() => validateProject({ ...project, edges: [...project.edges, { ...project.edges[0], id: 'duplicate_port' }] })).toThrow();
    expect(() => validateProject({ ...project, edges: [...project.edges, { id: 'binding_output', source: 'point_x', target: 'vector_x', input: 'b' }] })).toThrow('没有输出');
  });
});
