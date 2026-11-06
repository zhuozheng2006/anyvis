import type { Cue, GraphEdge, GraphNode, Project } from './types';

/** Kahn's algorithm, O(V + E), with a queue cursor instead of repeated shift(). */
export function topologicalSort(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  const degrees = new Map<string, number>();
  const adjacent = new Map<string, string[]>();
  for (const node of nodes) {
    if (degrees.has(node.id)) throw new Error(`节点 ID 重复：${node.id}`);
    degrees.set(node.id, 0); adjacent.set(node.id, []);
  }
  for (const edge of edges) {
    if (!degrees.has(edge.source) || !degrees.has(edge.target)) throw new Error('连线引用了不存在的节点');
    degrees.set(edge.target, degrees.get(edge.target)! + 1);
    adjacent.get(edge.source)!.push(edge.target);
  }
  const queue = nodes.filter(node => degrees.get(node.id) === 0).map(node => node.id);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const target of adjacent.get(queue[cursor])!) {
      degrees.set(target, degrees.get(target)! - 1);
      if (degrees.get(target) === 0) queue.push(target);
    }
  }
  if (queue.length !== nodes.length) throw new Error('节点图存在循环依赖，请删除回路中的连线');
  return queue;
}


const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Resolve numeric tracks independently of renderers and mathematical expression libraries. */
export function evaluateParameters(project: Pick<Project, 'duration' | 'parameters' | 'clips'>, time: number, overrides: Record<string, number> = {}): Record<string, number> {
  const parameters: Record<string, number> = {};
  const t = clamp(Number.isFinite(time) ? time : 0, 0, project.duration);
  const sortedClips = project.clips.map((clip, order) => ({ clip, order })).sort((a, b) => a.clip.start - b.clip.start || a.order - b.order);
  for (const parameter of project.parameters) {
    let value = parameter.value;
    for (const { clip } of sortedClips) {
      if (clip.parameterId !== parameter.id || t < clip.start) continue;
      let progress = clip.duration > 0 ? clamp((t - clip.start) / clip.duration, 0, 1) : 1;
      if (clip.easing === 'smooth') progress = progress * progress * (3 - 2 * progress);
      value = clip.from + (clip.to - clip.from) * progress;
    }
    if (Object.hasOwn(overrides, parameter.id) && Number.isFinite(overrides[parameter.id])) value = overrides[parameter.id];
    parameters[parameter.id] = clamp(value, parameter.min, parameter.max);
  }
  return parameters;
}

/** Crossings include time zero; a visited set allows resuming without re-triggering a cue. */
export function nextCue(cues: Cue[], previousTime: number, nextTime: number, visited: Set<string>): Cue | undefined {
  if (nextTime < previousTime) return undefined;
  return cues.filter(cue => !visited.has(cue.id) && cue.time >= previousTime && cue.time <= nextTime)
    .sort((a, b) => a.time - b.time)[0];
}

