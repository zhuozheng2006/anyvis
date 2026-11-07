import { getBlockDefinition } from './catalog.ts';
import type { Action, Project } from './types.ts';
export const DEFAULT_SCENE: Project['scene'] = { dimension: '2d', background: '#0B1020', width: 1920, height: 1080, fps: 30 };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const fail = (message: string): never => { throw new Error(message); };
export function createEmptyProject(): Project {
  return { schemaVersion: 2, id: crypto.randomUUID(), name: '未命名动画', scene: { ...DEFAULT_SCENE }, actions: [] };
}
export function validateProject(value: unknown): Project {
  if (!record(value) || value.schemaVersion !== 2) fail('项目格式不兼容，请打开 AnyVis v0.2 项目。旧原型文件请先保留备份。');
  const p = value as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id || p.id.length > 128) fail('项目需要有效 ID。');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120) fail('项目名称需要 1–120 个字符。');
  if (!record(p.scene)) fail('项目缺少场景设置。');
  const scene = p.scene as Record<string, unknown>;
  if (!['2d', '3d'].includes(String(scene.dimension))) fail('场景类型必须为二维或三维。');
  if (scene.renderer !== undefined && !['cairo','opengl'].includes(String(scene.renderer))) fail('渲染器必须为 Cairo 或 OpenGL。');
  if (typeof scene.background !== 'string' || !/^#[\da-fA-F]{6}$/.test(scene.background)) fail('背景颜色需要六位十六进制颜色。');
  for (const [key, min, max] of [['width', 256, 3840], ['height', 144, 2160], ['fps', 1, 60]] as const) {
    if (!finite(scene[key]) || !Number.isInteger(scene[key]) || scene[key] < min || scene[key] > max) fail(`场景 ${key} 必须是 ${min}–${max} 之间的整数。`);
  }
  if ((scene.width as number) % 2 || (scene.height as number) % 2) fail('视频宽高需要偶数，以便编码。');
  let count = 0;
  const ids = new Set<string>();
  const visit = (values: unknown, depth: number): Action[] => {
    if (!Array.isArray(values)) fail('动画步骤必须是数组。');
    if (depth > 12) fail('积木嵌套超过 12 层，请拆分动画。');
    return (values as unknown[]).map((raw): Action => {
      if (!record(raw)) fail('积木数据必须是对象。');
      const a = raw as Record<string, unknown>;
      if (++count > 500) fail('单个场景最多包含 500 块积木。');
      if (typeof a.id !== 'string' || !a.id || a.id.length > 128 || ids.has(a.id)) fail('积木 ID 缺失或重复。');
      ids.add(a.id as string);
      if (typeof a.type !== 'string') fail('积木缺少类型。');
      const definition = getBlockDefinition(a.type as string);
      if (!definition) fail(`未知积木：${String(a.type)}`);
      if (!record(a.fields)) fail(`${definition!.label} 缺少字段。`);
      const fields = a.fields as Record<string, unknown>;
      const known = new Set(definition!.fields.map((f) => f.name));
      for (const key of Object.keys(fields)) if (!known.has(key)) fail(`${definition!.label} 含未知字段“${key}”。`);
      const normalized: Action['fields'] = {};
      for (const f of definition!.fields) {
        const v = fields[f.name] ?? f.default;
        if (f.type === 'number') {
          if (!finite(v) || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) fail(`${definition!.label}的“${f.label}”需要 ${f.min ?? '有限数值'} 到 ${f.max ?? '有限数值'}。`);
          if (f.step === 1 && !Number.isInteger(v)) fail(`${definition!.label}的“${f.label}”需要整数。`);
        } else {
          if (typeof v !== 'string') fail(`${definition!.label}的“${f.label}”需要文本。`);
          if ((v as string).length > (a.type === 'code' || f.type === 'api-value' ? 20000 : 4000)) fail(`${definition!.label}的“${f.label}”太长。`);
          if (f.type === 'color' && !/^#[\da-fA-F]{6}$/.test(v as string)) fail(`${definition!.label}颜色格式不正确。`);
          if (f.type === 'select' && !f.options?.some(([, option]) => option === v)) fail(`${definition!.label}的“${f.label}”不是有效选项。`);
        }
        normalized[f.name] = v as string | number | boolean;
      }
      if (!definition!.container && (a.children !== undefined || a.branches !== undefined)) fail(`${definition!.label}不能包含嵌套积木。`);
      const next: Action = { id: a.id as string, type: a.type as string, fields: normalized };
      if (definition!.container) {
        next.children = visit(a.children ?? [], depth + 1);
        if (a.branches !== undefined) {
          if (definition!.container !== 'parallel' || !Array.isArray(a.branches) || a.branches.length > 20) fail('并行分支格式不正确。');
          if (next.children.length) fail('并行积木不能同时使用 children 和 branches。');
          next.branches = (a.branches as unknown[]).map((branch) => visit(branch, depth + 1));
        }
      }
      return next;
    });
  };
  const actions = visit(p.actions, 0);
  return { schemaVersion: 2, id: p.id as string, name: p.name as string, scene: { dimension: scene.dimension as '2d' | '3d', ...(scene.renderer ? {renderer:scene.renderer as 'cairo'|'opengl'} : {}), background: scene.background as string, width: scene.width as number, height: scene.height as number, fps: scene.fps as number }, actions, ...(p.workspace !== undefined ? { workspace: p.workspace } : {}) };
}
