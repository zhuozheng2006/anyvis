import { describe, it, expect } from 'vitest';
import {
  getMovableObjects,
  computeLayoutPositions,
  generateAutoLayoutPythonCode,
  applyLayoutToProject,
  type MovableObject,
  type LayoutConfig,
} from './auto-layout';
import type { Project } from './core/types';

describe('auto-layout', () => {
  const dummyObjects: MovableObject[] = [
    { actionId: 'act_1', name: 'circle_1', type: 'create_circle', x: 0, y: 0 },
    { actionId: 'act_2', name: 'square_1', type: 'create_square', x: 2, y: 1 },
    { actionId: 'act_3', name: 'text_1', type: 'create_text', x: -2, y: -1 },
  ];

  it('extracts movable objects from project actions', () => {
    const project: Project = {
      schemaVersion: 2,
      id: 'proj_test',
      name: 'Test Project',
      scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
      actions: [
        {
          id: 'a1',
          type: 'create_circle',
          fields: { name: 'c1', x: 1.5, y: 2.0, radius: 1 },
          children: [],
        },
        {
          id: 'a2',
          type: 'wait',
          fields: { duration: 2 },
          children: [],
        },
        {
          id: 'a3',
          type: 'create_text',
          fields: { text: 'Hello', x: -1.0, y: 0.5 },
          children: [],
        },
      ],
    };

    const movables = getMovableObjects(project);
    expect(movables).toHaveLength(2);
    expect(movables[0].actionId).toBe('a1');
    expect(movables[0].name).toBe('c1');
    expect(movables[1].actionId).toBe('a3');
    expect(movables[1].name).toBe('a3'); // Fallback to id when name not present
  });

  it('computes horizontal row arrangement with custom gap and anchor', () => {
    const config: LayoutConfig = {
      mode: 'horizontal',
      gap: 1.5,
      anchorCenter: [0, 0],
    };

    // 3 items: totalW = (3 - 1) * 1.5 = 3.0
    // x positions: -1.5, 0, 1.5; y = 0
    const positions = computeLayoutPositions(dummyObjects, config);
    expect(positions.size).toBe(3);
    expect(positions.get('act_1')).toEqual([-1.5, 0]);
    expect(positions.get('act_2')).toEqual([0, 0]);
    expect(positions.get('act_3')).toEqual([1.5, 0]);
  });

  it('computes vertical column arrangement', () => {
    const config: LayoutConfig = {
      mode: 'vertical',
      gap: 1.0,
      anchorCenter: [0, 0],
    };

    // 3 items: totalH = 2.0
    // y positions: 1.0, 0, -1.0; x = 0
    const positions = computeLayoutPositions(dummyObjects, config);
    expect(positions.get('act_1')).toEqual([0, 1.0]);
    expect(positions.get('act_2')).toEqual([0, 0]);
    expect(positions.get('act_3')).toEqual([0, -1.0]);
  });

  it('computes 2x2 grid matrix arrangement', () => {
    const fourObjects: MovableObject[] = [
      { actionId: 'o1', name: 'item1', type: 'circle', x: 0, y: 0 },
      { actionId: 'o2', name: 'item2', type: 'circle', x: 0, y: 0 },
      { actionId: 'o3', name: 'item3', type: 'circle', x: 0, y: 0 },
      { actionId: 'o4', name: 'item4', type: 'circle', x: 0, y: 0 },
    ];

    const config: LayoutConfig = {
      mode: 'grid',
      cols: 2,
      colGap: 2.0,
      rowGap: 1.0,
      anchorCenter: [0, 0],
    };

    // totalW = 1 * 2.0 = 2.0; totalH = 1 * 1.0 = 1.0
    // Row 0: y = 0.5; Row 1: y = -0.5
    // Col 0: x = -1.0; Col 1: x = 1.0
    const positions = computeLayoutPositions(fourObjects, config);
    expect(positions.get('o1')).toEqual([-1.0, 0.5]);
    expect(positions.get('o2')).toEqual([1.0, 0.5]);
    expect(positions.get('o3')).toEqual([-1.0, -0.5]);
    expect(positions.get('o4')).toEqual([1.0, -0.5]);
  });

  it('computes radial circular arrangement', () => {
    const fourObjects: MovableObject[] = [
      { actionId: 'r1', name: 'r1', type: 'circle', x: 0, y: 0 },
      { actionId: 'r2', name: 'r2', type: 'circle', x: 0, y: 0 },
      { actionId: 'r3', name: 'r3', type: 'circle', x: 0, y: 0 },
      { actionId: 'r4', name: 'r4', type: 'circle', x: 0, y: 0 },
    ];

    const config: LayoutConfig = {
      mode: 'radial',
      radius: 2.0,
      startAngleDeg: 0,
      anchorCenter: [0, 0],
    };

    // 4 items at 0, 90, 180, 270 degrees
    const positions = computeLayoutPositions(fourObjects, config);
    const p1 = positions.get('r1')!;
    const p2 = positions.get('r2')!;
    const p3 = positions.get('r3')!;
    const p4 = positions.get('r4')!;

    expect(p1[0]).toBeCloseTo(2.0, 1);
    expect(p1[1]).toBeCloseTo(0.0, 1);

    expect(p2[0]).toBeCloseTo(0.0, 1);
    expect(p2[1]).toBeCloseTo(2.0, 1);

    expect(p3[0]).toBeCloseTo(-2.0, 1);
    expect(p3[1]).toBeCloseTo(0.0, 1);

    expect(p4[0]).toBeCloseTo(0.0, 1);
    expect(p4[1]).toBeCloseTo(-2.0, 1);
  });

  it('computes horizontal and vertical even distributions', () => {
    const configH: LayoutConfig = {
      mode: 'distribute_h',
      gap: 1.0,
    };

    // dummyObjects x: [0, 2, -2] -> sorted [-2, 0, 2]
    // step = (2 - (-2)) / 2 = 2.0 -> [-2, 0, 2]
    const posH = computeLayoutPositions(dummyObjects, configH);
    expect(posH.get('act_3')![0]).toBeCloseTo(-2.0, 2);
    expect(posH.get('act_1')![0]).toBeCloseTo(0.0, 2);
    expect(posH.get('act_2')![0]).toBeCloseTo(2.0, 2);

    const configV: LayoutConfig = {
      mode: 'distribute_v',
      gap: 1.0,
    };
    // y: [0, 1, -1] -> sorted by y desc [1, 0, -1]
    const posV = computeLayoutPositions(dummyObjects, configV);
    expect(posV.get('act_2')![1]).toBeCloseTo(1.0, 2);
    expect(posV.get('act_1')![1]).toBeCloseTo(0.0, 2);
    expect(posV.get('act_3')![1]).toBeCloseTo(-1.0, 2);
  });

  it('generates runnable Manim Python code', () => {
    const codeH = generateAutoLayoutPythonCode(dummyObjects, { mode: 'horizontal', gap: 1.0 });
    expect(codeH).toContain('group = VGroup(circle_1, square_1, text_1)');
    expect(codeH).toContain('group.arrange(RIGHT, buff=1.00)');

    const codeV = generateAutoLayoutPythonCode(dummyObjects, { mode: 'vertical', gap: 0.8 });
    expect(codeV).toContain('group.arrange(DOWN, buff=0.80)');

    const codeGrid = generateAutoLayoutPythonCode(dummyObjects, { mode: 'grid', cols: 2, gap: 1.2 });
    expect(codeGrid).toContain('group.arrange_in_grid');

    const codeRad = generateAutoLayoutPythonCode(dummyObjects, { mode: 'radial', radius: 2.5 });
    expect(codeRad).toContain('radius = 2.50');
  });

  it('applies updated positions to project actions without mutating others', () => {
    const project: Project = {
      schemaVersion: 2,
      id: 'proj_apply',
      name: 'Apply Test',
      scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
      actions: [
        {
          id: 'act_1',
          type: 'create_circle',
          fields: { x: 0, y: 0, radius: 1 },
          children: [],
        },
        {
          id: 'act_other',
          type: 'wait',
          fields: { duration: 1 },
          children: [],
        },
      ],
    };

    const newPositions = new Map<string, [number, number]>([['act_1', [3.5, -2.5]]]);
    const updated = applyLayoutToProject(project, newPositions);

    expect(updated.actions[0].fields.x).toBe(3.5);
    expect(updated.actions[0].fields.y).toBe(-2.5);
    expect(updated.actions[1].fields.duration).toBe(1);
  });
});
