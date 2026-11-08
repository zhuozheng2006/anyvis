import type { Action, Project } from './core/types';

export type GraphPresetId =
  | 'complete'
  | 'petersen'
  | 'neural'
  | 'tree'
  | 'bipartite'
  | 'cube';

export interface GraphVertex {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color?: string;
  radius?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight?: number;
  color?: string;
  directed?: boolean;
}

export interface GraphPreset {
  id: GraphPresetId;
  name: string;
  description: string;
  vertices: Array<{ id: string; label: string; x: number; y: number; color?: string }>;
  edges: Array<{ source: string; target: string; weight?: number; directed?: boolean }>;
}

export const GRAPH_PRESETS: GraphPreset[] = [
  {
    id: 'complete',
    name: '五阶完全图 K₅ (Complete Graph)',
    description: '每个顶点均与其他所有顶点相连，图论经典非平面图',
    vertices: Array.from({ length: 5 }, (_, i) => {
      const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      const R = 2.4;
      return {
        id: `v${i + 1}`,
        label: `v${i + 1}`,
        x: Number((R * Math.cos(angle)).toFixed(2)),
        y: Number((R * Math.sin(angle)).toFixed(2)),
        color: '#58c4dd',
      };
    }),
    edges: [
      { source: 'v1', target: 'v2' },
      { source: 'v1', target: 'v3' },
      { source: 'v1', target: 'v4' },
      { source: 'v1', target: 'v5' },
      { source: 'v2', target: 'v3' },
      { source: 'v2', target: 'v4' },
      { source: 'v2', target: 'v5' },
      { source: 'v3', target: 'v4' },
      { source: 'v3', target: 'v5' },
      { source: 'v4', target: 'v5' },
    ],
  },
  {
    id: 'petersen',
    name: '彼得森图 (Petersen Graph)',
    description: '外层五边形与内层五角星连接，图论著名的反例之源',
    vertices: [
      // Outer pentagon
      ...Array.from({ length: 5 }, (_, i) => {
        const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const R = 2.6;
        return {
          id: `o${i + 1}`,
          label: `o${i + 1}`,
          x: Number((R * Math.cos(angle)).toFixed(2)),
          y: Number((R * Math.sin(angle)).toFixed(2)),
          color: '#e2b340',
        };
      }),
      // Inner star
      ...Array.from({ length: 5 }, (_, i) => {
        const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const R = 1.3;
        return {
          id: `i${i + 1}`,
          label: `i${i + 1}`,
          x: Number((R * Math.cos(angle)).toFixed(2)),
          y: Number((R * Math.sin(angle)).toFixed(2)),
          color: '#58c4dd',
        };
      }),
    ],
    edges: [
      // Outer cycle
      { source: 'o1', target: 'o2' },
      { source: 'o2', target: 'o3' },
      { source: 'o3', target: 'o4' },
      { source: 'o4', target: 'o5' },
      { source: 'o5', target: 'o1' },
      // Inner star
      { source: 'i1', target: 'i3' },
      { source: 'i3', target: 'i5' },
      { source: 'i5', target: 'i2' },
      { source: 'i2', target: 'i4' },
      { source: 'i4', target: 'i1' },
      // Spokes
      { source: 'o1', target: 'i1' },
      { source: 'o2', target: 'i2' },
      { source: 'o3', target: 'i3' },
      { source: 'o4', target: 'i4' },
      { source: 'o5', target: 'i5' },
    ],
  },
  {
    id: 'neural',
    name: '深度神经网络拓扑 (Neural Network)',
    description: '3Blue1Brown 深度学习系列经典多层全连接前馈架构',
    vertices: [
      // Input layer (x = -3.0)
      { id: 'in1', label: 'x₁', x: -3.0, y: 1.6, color: '#38bdf8' },
      { id: 'in2', label: 'x₂', x: -3.0, y: 0.0, color: '#38bdf8' },
      { id: 'in3', label: 'x₃', x: -3.0, y: -1.6, color: '#38bdf8' },
      // Hidden layer (x = 0.0)
      { id: 'h1', label: 'h₁', x: 0.0, y: 2.2, color: '#83c167' },
      { id: 'h2', label: 'h₂', x: 0.0, y: 0.75, color: '#83c167' },
      { id: 'h3', label: 'h₃', x: 0.0, y: -0.75, color: '#83c167' },
      { id: 'h4', label: 'h₄', x: 0.0, y: -2.2, color: '#83c167' },
      // Output layer (x = 3.0)
      { id: 'out1', label: 'y₁', x: 3.0, y: 1.0, color: '#e2b340' },
      { id: 'out2', label: 'y₂', x: 3.0, y: -1.0, color: '#e2b340' },
    ],
    edges: [
      // in -> h
      ...['in1', 'in2', 'in3'].flatMap((inp) =>
        ['h1', 'h2', 'h3', 'h4'].map((hid) => ({ source: inp, target: hid, directed: true })),
      ),
      // h -> out
      ...['h1', 'h2', 'h3', 'h4'].flatMap((hid) =>
        ['out1', 'out2'].map((out) => ({ source: hid, target: out, directed: true })),
      ),
    ],
  },
  {
    id: 'tree',
    name: '二叉平衡搜索树 (Binary Search Tree)',
    description: '分层树状层次结构，算法与数据结构核心模型',
    vertices: [
      { id: 'n8', label: '8', x: 0.0, y: 2.2, color: '#e2b340' },
      { id: 'n3', label: '3', x: -1.8, y: 0.7, color: '#58c4dd' },
      { id: 'n10', label: '10', x: 1.8, y: 0.7, color: '#58c4dd' },
      { id: 'n1', label: '1', x: -2.6, y: -1.0, color: '#83c167' },
      { id: 'n6', label: '6', x: -1.0, y: -1.0, color: '#83c167' },
      { id: 'n14', label: '14', x: 2.6, y: -1.0, color: '#83c167' },
      { id: 'n4', label: '4', x: -1.4, y: -2.4, color: '#bb86fc' },
      { id: 'n7', label: '7', x: -0.6, y: -2.4, color: '#bb86fc' },
    ],
    edges: [
      { source: 'n8', target: 'n3', directed: true },
      { source: 'n8', target: 'n10', directed: true },
      { source: 'n3', target: 'n1', directed: true },
      { source: 'n3', target: 'n6', directed: true },
      { source: 'n10', target: 'n14', directed: true },
      { source: 'n6', target: 'n4', directed: true },
      { source: 'n6', target: 'n7', directed: true },
    ],
  },
  {
    id: 'bipartite',
    name: '完全二分图 K₃,₃ (Bipartite Graph)',
    description: '三间房与三套设施问题，不可平面拓扑图',
    vertices: [
      { id: 't1', label: 'A', x: -2.2, y: 1.6, color: '#38bdf8' },
      { id: 't2', label: 'B', x: 0.0, y: 1.6, color: '#38bdf8' },
      { id: 't3', label: 'C', x: 2.2, y: 1.6, color: '#38bdf8' },
      { id: 'b1', label: '1', x: -2.2, y: -1.6, color: '#ff9f43' },
      { id: 'b2', label: '2', x: 0.0, y: -1.6, color: '#ff9f43' },
      { id: 'b3', label: '3', x: 2.2, y: -1.6, color: '#ff9f43' },
    ],
    edges: [
      ...['t1', 't2', 't3'].flatMap((t) =>
        ['b1', 'b2', 'b3'].map((b) => ({ source: t, target: b })),
      ),
    ],
  },
  {
    id: 'cube',
    name: '立方体骨架图 Q₃ (Cube Graph)',
    description: '三维超立方体图，哈密顿图与格雷码映射模型',
    vertices: [
      { id: 'c000', label: '000', x: -1.5, y: -1.5, color: '#83c167' },
      { id: 'c100', label: '100', x: 1.5, y: -1.5, color: '#83c167' },
      { id: 'c110', label: '110', x: 1.5, y: 1.5, color: '#83c167' },
      { id: 'c010', label: '010', x: -1.5, y: 1.5, color: '#83c167' },
      { id: 'c001', label: '001', x: -0.75, y: -0.75, color: '#58c4dd' },
      { id: 'c101', label: '101', x: 0.75, y: -0.75, color: '#58c4dd' },
      { id: 'c111', label: '111', x: 0.75, y: 0.75, color: '#58c4dd' },
      { id: 'c011', label: '011', x: -0.75, y: 0.75, color: '#58c4dd' },
    ],
    edges: [
      // Outer
      { source: 'c000', target: 'c100' },
      { source: 'c100', target: 'c110' },
      { source: 'c110', target: 'c010' },
      { source: 'c010', target: 'c000' },
      // Inner
      { source: 'c001', target: 'c101' },
      { source: 'c101', target: 'c111' },
      { source: 'c111', target: 'c011' },
      { source: 'c011', target: 'c001' },
      // Cross
      { source: 'c000', target: 'c001' },
      { source: 'c100', target: 'c101' },
      { source: 'c110', target: 'c111' },
      { source: 'c010', target: 'c011' },
    ],
  },
];

/** Force-directed layout physics simulation step */
export function stepForceDirected(
  vertices: GraphVertex[],
  edges: GraphEdge[],
  pinnedId: string | null = null,
  kRepulsion = 1.8,
  kAttraction = 0.04,
  idealDistance = 1.8,
  damping = 0.85,
  dt = 0.1,
): GraphVertex[] {
  const next = vertices.map((v) => ({ ...v }));

  // 1. Coulomb repulsion between all vertex pairs
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const v1 = next[i];
      const v2 = next[j];
      const dx = v1.x - v2.x;
      const dy = v1.y - v2.y;
      const distSq = dx * dx + dy * dy + 0.05;
      const dist = Math.sqrt(distSq);
      const force = kRepulsion / distSq;

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (v1.id !== pinnedId) {
        v1.vx += fx * dt;
        v1.vy += fy * dt;
      }
      if (v2.id !== pinnedId) {
        v2.vx -= fx * dt;
        v2.vy -= fy * dt;
      }
    }
  }

  // 2. Hooke spring attraction along edges
  for (const edge of edges) {
    const v1 = next.find((v) => v.id === edge.source);
    const v2 = next.find((v) => v.id === edge.target);
    if (!v1 || !v2) continue;

    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1e-4;
    const displacement = dist - idealDistance;
    const force = kAttraction * displacement;

    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    if (v1.id !== pinnedId) {
      v1.vx += fx * dt;
      v1.vy += fy * dt;
    }
    if (v2.id !== pinnedId) {
      v2.vx -= fx * dt;
      v2.vy -= fy * dt;
    }
  }

  // 3. Central gravity and integration
  for (const v of next) {
    if (v.id === pinnedId) continue;
    // Slight pull toward center
    v.vx -= v.x * 0.05 * dt;
    v.vy -= v.y * 0.05 * dt;

    v.vx *= damping;
    v.vy *= damping;

    v.x += v.vx * dt;
    v.y += v.vy * dt;

    // Bounds limit
    v.x = Math.max(-3.5, Math.min(3.5, v.x));
    v.y = Math.max(-2.5, Math.min(2.5, v.y));
  }

  return next;
}

/** Finds shortest path using BFS */
export function findShortestPath(
  vertices: GraphVertex[],
  edges: GraphEdge[],
  startId: string,
  endId: string,
): { pathNodeIds: string[]; pathEdgeKeys: Set<string> } {
  if (startId === endId) {
    return { pathNodeIds: [startId], pathEdgeKeys: new Set() };
  }

  const adj = new Map<string, string[]>();
  for (const v of vertices) adj.set(v.id, []);
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    if (!e.directed) {
      adj.get(e.target)?.push(e.source);
    }
  }

  const queue: string[] = [startId];
  const visited = new Set<string>([startId]);
  const parent = new Map<string, string>();

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === endId) break;

    for (const neighbor of adj.get(curr) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent.set(neighbor, curr);
        queue.push(neighbor);
      }
    }
  }

  if (!parent.has(endId)) {
    return { pathNodeIds: [], pathEdgeKeys: new Set() };
  }

  const path: string[] = [];
  let curr: string | undefined = endId;
  while (curr) {
    path.unshift(curr);
    curr = parent.get(curr);
  }

  const edgeKeys = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    const u = path[i];
    const v = path[i + 1];
    edgeKeys.add(`${u}->${v}`);
    edgeKeys.add(`${v}->${u}`);
  }

  return { pathNodeIds: path, pathEdgeKeys: edgeKeys };
}

/** Generates runnable Manim CE Python code for Graph/DiGraph */
export function generateGraphPythonCode(preset: GraphPreset): string {
  const verticesStr = JSON.stringify(preset.vertices.map((v) => v.id));
  const edgesListStr = preset.edges
    .map((e) => `("${e.source}", "${e.target}")`)
    .join(', ');

  const layoutObjStr = preset.vertices
    .map((v) => `"${v.id}": [${v.x.toFixed(2)}, ${v.y.toFixed(2)}, 0]`)
    .join(', ');

  const isDiGraph = preset.edges.some((e) => e.directed);
  const className = isDiGraph ? 'DiGraph' : 'Graph';

  return `# Auto-generated by AnyVis - 3B1B Style Network Topology Animation
from manim import *

class NetworkGraphScene(Scene):
    def construct(self):
        title = Title(r"${preset.name}", color=GOLD)
        self.play(Write(title))

        vertices = ${verticesStr}
        edges = [${edgesListStr}]
        layout = {${layoutObjStr}}

        g = ${className}(
            vertices,
            edges,
            layout=layout,
            vertex_config={"radius": 0.22, "fill_color": TEAL, "fill_opacity": 0.9},
            edge_config={"stroke_color": BLUE_C, "stroke_width": 2.5},
            labels=True,
        )

        self.play(Create(g), run_time=2.5)
        self.wait(1.5)

        # Highlight pulsation
        self.play(
            g.animate.set_color_by_gradient(TEAL, GREEN, GOLD),
            run_time=1.8,
        )
        self.wait(2.0)
`;
}

/** Injects graph network actions into AnyVis project */
export function createGraphActions(
  project: Project,
  preset: GraphPreset,
): { project: Project; actionIds: string[] } {
  const ts = Date.now();
  const titleName = `graph_title_${ts.toString().slice(-4)}`;

  const titleAction: Action = {
    id: `action_gtitle_${ts}`,
    type: 'create_text',
    fields: {
      name: titleName,
      text: `${preset.name}`,
      color: '#e2b340',
      x: 0,
      y: 3.2,
      fontSize: 28,
    },
    children: [],
  };

  // Create node circle actions
  const nodeActions: Action[] = preset.vertices.map((v, idx) => ({
    id: `action_gnode_${idx}_${ts}`,
    type: 'create_circle',
    fields: {
      name: `node_${v.id}`,
      radius: 0.28,
      x: v.x,
      y: v.y,
      color: v.color || '#58c4dd',
      fill: true,
    },
    children: [],
  }));

  const nextActions = [...project.actions, titleAction, ...nodeActions];
  return {
    project: {
      ...project,
      actions: nextActions,
    },
    actionIds: [titleAction.id, ...nodeActions.map((a) => a.id)],
  };
}
