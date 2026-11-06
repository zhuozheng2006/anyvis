import { parse } from 'mathjs';
import type { MathNode } from 'mathjs';
import type { Evaluation, GraphEdge, GraphNode, Project, SceneObject } from './types';
import { evaluateParameters, topologicalSort } from './scheduling';
export { evaluateParameters, nextCue, topologicalSort } from './scheduling';

const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sqrt', 'abs', 'min', 'max', 'floor', 'ceil', 'round', 'exp', 'log', 'pow', 'sign', 'hypot']);
const OPERATORS = new Set(['+', '-', '*', '/', '^', '%']);
const RESERVED = new Set(['__proto__', 'prototype', 'constructor', 'a', 'b', 't', 'x', 'pi', 'e', ...FUNCTIONS]);
const expressionCache = new Map<string, ReturnType<MathNode['compile']>>();

/** Mathematical expressions only: no assignment, property access, arrays or arbitrary calls. */
export function evaluateExpression(expression: string, scope: Record<string, number>): number {
  if (!expression.trim() || expression.length > 240) throw new Error('表达式须为 1–240 个字符');
  let compiled = expressionCache.get(expression);
  if (!compiled) {
    const tree = parse(expression);
    let size = 0;
    tree.traverse((node) => {
      if (++size > 80) throw new Error('表达式过于复杂');
      switch (node.type) {
        case 'ConstantNode': {
          const value = (node as unknown as { value: unknown }).value;
          if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('仅支持有限数字');
          break;
        }
        case 'SymbolNode': {
          const name = (node as unknown as { name: string }).name;
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || ['__proto__', 'prototype', 'constructor'].includes(name)) throw new Error('无效变量名');
          break;
        }
        case 'OperatorNode':
          if (!OPERATORS.has((node as unknown as { op: string }).op)) throw new Error('不支持此运算符');
          break;
        case 'FunctionNode': {
          const fn = (node as unknown as { fn: { type: string; name?: string } }).fn;
          if (fn.type !== 'SymbolNode' || !FUNCTIONS.has(fn.name ?? '')) throw new Error('不支持此函数');
          break;
        }
        case 'ParenthesisNode': break;
        default: throw new Error('仅支持数字、变量与数学函数');
      }
    });
    compiled = tree.compile();
    if (expressionCache.size >= 256) expressionCache.delete(expressionCache.keys().next().value!);
    expressionCache.set(expression, compiled);
  }
  const safeScope = new Map<string, number>();
  for (const [key, value] of Object.entries(scope)) {
    if (!['__proto__', 'constructor', 'prototype'].includes(key) && Number.isFinite(value)) safeScope.set(key, value);
  }
  const value: unknown = compiled.evaluate(safeScope);
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e8) throw new Error('表达式结果须为有限实数（绝对值不超过 10⁸）');
  return value;
}


const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A pure evaluation makes reverse seeking produce exactly the same state as forward playback. */
export function evaluateProject(project: Project, time: number, overrides: Record<string, number> = {}): Evaluation {
  const parameters = evaluateParameters(project, time, overrides);
  const nodeValues: Record<string, number> = {};
  const errors: string[] = [];
  const objects: SceneObject[] = project.objects.map(object => ({ ...object }));
  const t = clamp(Number.isFinite(time) ? time : 0, 0, project.duration);
  let order: string[];
  try { order = topologicalSort(project.nodes, project.edges); }
  catch (error) { errors.push((error as Error).message); return { parameters, objects, nodeValues, errors }; }
  const nodes = new Map(project.nodes.map(node => [node.id, node]));
  const objectsById = new Map(objects.map(object => [object.id, object]));
  const incoming = new Map<string, GraphEdge[]>();
  for (const edge of project.edges) incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  const bindings = new Set<string>();
  for (const id of order) {
    const node = nodes.get(id)!;
    try {
      const inputs: Record<string, number> = {};
      for (const edge of incoming.get(id) ?? []) {
        if (Object.hasOwn(inputs, edge.input)) throw new Error(`输入 ${edge.input} 只能连接一个来源`);
        if (!Object.hasOwn(nodeValues, edge.source)) throw new Error('上游节点计算失败');
        inputs[edge.input] = nodeValues[edge.source];
      }
      let value: number;
      switch (node.kind) {
        case 'parameter':
          if (!node.parameterId || !Object.hasOwn(parameters, node.parameterId)) throw new Error('请选择有效参数');
          value = parameters[node.parameterId];
          break;
        case 'time': value = t; break;
        case 'formula': value = evaluateExpression(node.expression ?? 'a', { ...parameters, t, ...inputs }); break;
        case 'binding': {
          const object = objectsById.get(node.objectId ?? '');
          if (!object || !node.property) throw new Error('请选择有效对象和属性');
          if (!Object.hasOwn(inputs, 'a')) throw new Error('属性绑定需要连接输入 a');
          value = inputs.a;
          const bindingKey = `${object.id}:${node.property}`;
          if (bindings.has(bindingKey)) throw new Error('同一对象属性不能被多个节点绑定');
          bindings.add(bindingKey);
          if (node.property === 'scale' && value <= 0) throw new Error('缩放须大于 0');
          object[node.property] = value;
          break;
        }
      }
      if (!Number.isFinite(value)) throw new Error('结果不是有限数字');
      nodeValues[id] = value;
    } catch (error) { errors.push(`${node.label}：${(error as Error).message}`); }
  }
  return { parameters, objects, nodeValues, errors };
}

/** Validate imported JSON before it can reach the editor or render loop. */
export function validateProject(value: unknown): Project {
  const fail = (message: string): never => { throw new Error(`项目文件无效：${message}`); };
  const record = (input: unknown, name: string): Record<string, unknown> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(`${name} 格式错误`);
    return input as Record<string, unknown>;
  };
  const text = (input: unknown, name: string, max = 120, required = true): string => {
    if (typeof input !== 'string' || (required && !input.trim()) || input.length > max) fail(`${name} 文本无效`);
    return input as string;
  };
  const numeric = (input: unknown, name: string, min = -1e6, max = 1e6): number => {
    if (typeof input !== 'number' || !Number.isFinite(input) || input < min || input > max) fail(`${name} 数值超出范围`);
    return input as number;
  };
  const list = (input: unknown, name: string, max: number): Record<string, unknown>[] => {
    if (!Array.isArray(input) || input.length > max) fail(`${name} 数量或格式无效`);
    return (input as unknown[]).map(item => record(item, name));
  };
  const ids = (items: Record<string, unknown>[], name: string): Set<string> => {
    const result = new Set<string>();
    for (const item of items) {
      const id = text(item.id, `${name} ID`, 100);
      if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(id) || ['__proto__', 'prototype', 'constructor'].includes(id) || result.has(id)) fail(`${name} ID 重复或格式无效`);
      result.add(id);
    }
    return result;
  };
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { return fail('无法序列化'); }
  if (!serialized || serialized.length > 2_000_000) fail('文件过大');
  const root = record(value, '项目');
  if (root.version !== 1) fail('不支持的版本');
  text(root.id, '项目 ID'); text(root.name, '项目名称', 120, false);
  if (root.dimension !== '2d' && root.dimension !== '3d') fail('场景维度无效');
  const duration = numeric(root.duration, '总时长', 0.1, 3600);
  const parameters = list(root.parameters, '参数', 64);
  const parameterIds = ids(parameters, '参数');
  for (const p of parameters) {
    const id = p.id as string;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id) || RESERVED.has(id)) fail('参数 ID 与表达式保留字冲突');
    text(p.name, '参数名称', 120, false); text(p.color, '颜色', 40);
    const min = numeric(p.min, '参数最小值'); const max = numeric(p.max, '参数最大值');
    if (min >= max) fail('参数最小值须小于最大值');
    numeric(p.value, '参数值', min, max); numeric(p.step, '参数步长', Number.EPSILON, max - min);
  }
  const objects = list(root.objects, '对象', 200); const objectIds = ids(objects, '对象');
  for (const object of objects) {
    text(object.name, '对象名称', 120, false); text(object.color, '颜色', 40);
    if (!['circle', 'point', 'vector', 'curve', 'cube', 'sphere'].includes(object.kind as string)) fail('对象类型无效');
    if (typeof object.visible !== 'boolean') fail('对象可见性无效');
    for (const key of ['x', 'y', 'z', 'rotation']) numeric(object[key], `对象 ${key}`);
    numeric(object.scale, '对象缩放', 0.001, 1000);
    if (object.expression !== undefined) text(object.expression, '曲线表达式', 240, false);
  }
  const nodes = list(root.nodes, '节点', 200); const nodeIds = ids(nodes, '节点');
  for (const node of nodes) {
    text(node.label, '节点名称', 120, false); const position = record(node.position, '节点位置');
    numeric(position.x, '节点 x'); numeric(position.y, '节点 y');
    if (!['parameter', 'time', 'formula', 'binding'].includes(node.kind as string)) fail('节点类型无效');
    if (node.kind === 'parameter' && !parameterIds.has(node.parameterId as string)) fail('节点参数引用无效');
    if (node.kind === 'formula') text(node.expression, '表达式', 240, false);
    if (node.kind === 'binding') {
      if (!objectIds.has(node.objectId as string)) fail('绑定对象不存在');
      if (!['x', 'y', 'z', 'scale', 'rotation'].includes(node.property as string)) fail('绑定属性无效');
    }
  }
  const edges = list(root.edges, '连线', 600); ids(edges, '连线');
  const destinations = new Set<string>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.source as string) || !nodeIds.has(edge.target as string)) fail('连线节点不存在');
    if (!['a', 'b'].includes(edge.input as string)) fail('连线输入无效');
    const source = nodes.find(node => node.id === edge.source)!;
    const target = nodes.find(node => node.id === edge.target)!;
    if (source.kind === 'binding') fail('属性绑定节点没有输出端口');
    if (!['formula', 'binding'].includes(target.kind as string) || (target.kind === 'binding' && edge.input !== 'a')) fail('此节点没有对应输入端口');
    const key = `${edge.target}:${edge.input}`;
    if (destinations.has(key)) fail('输入端口重复连接');
    destinations.add(key);
  }
  const clips = list(root.clips, '动画片段', 500); ids(clips, '动画片段');
  for (const clip of clips) {
    if (!parameterIds.has(clip.parameterId as string)) fail('动画参数不存在');
    const start = numeric(clip.start, '片段起点', 0, duration);
    const clipDuration = numeric(clip.duration, '片段时长', 0.001, duration);
    if (start + clipDuration > duration + 1e-7) fail('动画片段超出场景总时长');
    numeric(clip.from, '起始值'); numeric(clip.to, '终点值');
    if (!['linear', 'smooth'].includes(clip.easing as string)) fail('缓动无效');
  }
  const cues = list(root.cues, '交互节点', 100); ids(cues, '交互节点');
  for (const cue of cues) { numeric(cue.time, '交互时间', 0, duration); text(cue.title, '交互标题', 120, false); if (typeof cue.description !== 'string' || cue.description.length > 2000) fail('交互描述无效'); }
  if (typeof root.code !== 'string' || root.code.length > 20000 || typeof root.codeEnabled !== 'boolean') fail('代码扩展格式无效');
  if (root.blockly !== undefined) record(root.blockly, '积木工作区');
  topologicalSort(nodes as unknown as GraphNode[], edges as unknown as GraphEdge[]);
  return JSON.parse(serialized) as Project;
}
