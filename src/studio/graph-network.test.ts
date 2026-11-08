import { describe, it, expect } from 'vitest';
import {
  GRAPH_PRESETS,
  stepForceDirected,
  findShortestPath,
  generateGraphPythonCode,
  createGraphActions,
  type GraphVertex,
} from './graph-network';
import type { Project } from './core/types';

describe('graph-network physics, path finding, and Manim CE code generation', () => {
  it('provides all 6 mathematical presets with valid vertices and edges', () => {
    expect(GRAPH_PRESETS).toHaveLength(6);
    for (const preset of GRAPH_PRESETS) {
      expect(preset.vertices.length).toBeGreaterThan(0);
      expect(preset.edges.length).toBeGreaterThan(0);
      for (const e of preset.edges) {
        expect(preset.vertices.some((v) => v.id === e.source)).toBe(true);
        expect(preset.vertices.some((v) => v.id === e.target)).toBe(true);
      }
    }
  });

  it('updates node positions with force-directed physics and respects pinned node', () => {
    const p = GRAPH_PRESETS.find((x) => x.id === 'complete')!;
    const vertices: GraphVertex[] = p.vertices.map((v) => ({ ...v, vx: 0, vy: 0 }));

    // Pin v1
    const pinned = 'v1';
    const initV1X = vertices[0].x;
    const initV1Y = vertices[0].y;

    const next = stepForceDirected(vertices, p.edges, pinned, 1.5, 0.05, 1.5, 0.9, 0.1);

    expect(next[0].x).toBe(initV1X);
    expect(next[0].y).toBe(initV1Y);
    // Unpinned nodes should have moved
    const moved = next.slice(1).some((v, idx) => v.x !== vertices[idx + 1].x);
    expect(moved).toBe(true);
  });

  it('correctly finds shortest path using BFS on graph', () => {
    const petersen = GRAPH_PRESETS.find((x) => x.id === 'petersen')!;
    const vertices: GraphVertex[] = petersen.vertices.map((v) => ({ ...v, vx: 0, vy: 0 }));

    // Shortest path between o1 and o3 in Petersen graph (o1 - o2 - o3 is length 2)
    const { pathNodeIds, pathEdgeKeys } = findShortestPath(vertices, petersen.edges, 'o1', 'o3');

    expect(pathNodeIds).toHaveLength(3);
    expect(pathNodeIds[0]).toBe('o1');
    expect(pathNodeIds[2]).toBe('o3');
    expect(pathEdgeKeys.has('o1->o2') || pathEdgeKeys.has('o2->o1')).toBe(true);
    expect(pathEdgeKeys.has('o2->o3') || pathEdgeKeys.has('o3->o2')).toBe(true);
  });

  it('generates runnable Manim CE Python code for Graph/DiGraph', () => {
    const neural = GRAPH_PRESETS.find((x) => x.id === 'neural')!;
    const code = generateGraphPythonCode(neural);

    expect(code).toContain('from manim import *');
    expect(code).toContain('class NetworkGraphScene(Scene):');
    expect(code).toContain('g = DiGraph(');
  });

  it('injects graph actions into project without mutating original project', () => {
    const dummyProject: Project = {
      schemaVersion: 2,
      id: 'p_graph',
      name: 'Graph Test',
      scene: { dimension: '2d', background: '#000', width: 1920, height: 1080, fps: 60 },
      actions: [],
    };
    const complete = GRAPH_PRESETS.find((x) => x.id === 'complete')!;
    const { project: nextProject, actionIds } = createGraphActions(dummyProject, complete);

    expect(dummyProject.actions).toHaveLength(0);
    // 1 title + 5 nodes = 6 actions
    expect(nextProject.actions).toHaveLength(6);
    expect(actionIds).toHaveLength(6);
  });
});
