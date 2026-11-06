import type { AnimationClip, Cue, Parameter } from './types';

/** Serializable process instructions; the Blockly adapter supplies this same AST. */
export type BlockInstruction =
  | { kind: 'animate'; parameterId: string; from: number; to: number; duration: number; easing: 'linear' | 'smooth' }
  | { kind: 'wait'; seconds: number }
  | { kind: 'pause'; title: string }
  | { kind: 'repeat'; count: number; body: BlockInstruction[] }
  | { kind: 'parallel'; branches: [BlockInstruction[], BlockInstruction[]] };

export interface CompiledBlockProgram { clips: AnimationClip[]; cues: Cue[]; duration: number }

/** Compile deterministic timeline data without a renderer, DOM, or Blockly runtime. */
export function compileBlockProgram(program: readonly BlockInstruction[], parameters: readonly Parameter[]): CompiledBlockProgram {
  const clips: AnimationClip[] = [];
  const cues: Cue[] = [];
  const parameterById = new Map(parameters.map((parameter) => [parameter.id, parameter]));
  let operations = 0;
  let serial = 0;
  const finite = (value: number) => {
    if (!Number.isFinite(value)) throw new Error('积木中有无效数值。');
    return value;
  };
  const walk = (instructions: readonly BlockInstruction[], start: number, depth: number): number => {
    if (depth > 12) throw new Error('嵌套层级过深，请把重复结构简化到 12 层以内。');
    let cursor = start;
    for (const instruction of instructions) {
      if (++operations > 1000) throw new Error('编排超过 1000 个动作，请减少重复次数。');
      if (instruction.kind === 'animate') {
        const parameter = parameterById.get(instruction.parameterId);
        if (!parameter) throw new Error('变化积木引用了已删除的参数，请重新选择。');
        const from = finite(instruction.from);
        const to = finite(instruction.to);
        const duration = finite(instruction.duration);
        if (duration < 0.001 || duration > 3600) throw new Error('动画时长必须在 0.001～3600 秒之间。');
        if (from < parameter.min || from > parameter.max || to < parameter.min || to > parameter.max) {
          throw new Error(`${parameter.name} 的起止值必须在 ${parameter.min}～${parameter.max} 范围内。`);
        }
        if (instruction.easing !== 'smooth' && instruction.easing !== 'linear') throw new Error('不支持的缓动方式。');
        if (clips.length >= 500) throw new Error('动画片段不能超过 500 个，请减少重复次数。');
        const endpoint = cursor + duration;
        // Store the represented interval so exported duration - start remains consistent.
        const representedDuration = endpoint - cursor;
        if (representedDuration < 0.001) throw new Error('这个时刻无法准确表示过短的动画，请稍微增加时长。');
        clips.push({ id: `block-clip-${++serial}`, parameterId: instruction.parameterId, start: cursor, duration: representedDuration, from, to, easing: instruction.easing });
        cursor = endpoint;
      } else if (instruction.kind === 'wait') {
        const delay = finite(instruction.seconds);
        if (delay < 0 || delay > 3600) throw new Error('等待时间必须在 0～3600 秒之间。');
        cursor += delay;
      } else if (instruction.kind === 'pause') {
        if (typeof instruction.title !== 'string') throw new Error('交互节点标题必须是文字。');
        const title = instruction.title.trim().slice(0, 120) || '试着调整参数';
        if (cues.some((cue) => Math.abs(cue.time - cursor) < 0.001)) throw new Error('同一时刻已有交互节点，请在两个交互节点之间插入等待或动画。');
        if (cues.length >= 100) throw new Error('交互节点不能超过 100 个，请减少重复次数。');
        cues.push({ id: `block-cue-${++serial}`, time: cursor, title, description: '拖动右侧参数观察场景变化，准备好后继续播放。' });
      } else if (instruction.kind === 'repeat') {
        const count = finite(instruction.count);
        if (count < 1 || count > 100 || !Number.isInteger(count)) throw new Error('重复次数必须是 1～100 的整数。');
        for (let i = 0; i < count; i++) cursor = walk(instruction.body, cursor, depth + 1);
      } else if (instruction.kind === 'parallel') {
        cursor = Math.max(walk(instruction.branches[0], cursor, depth + 1), walk(instruction.branches[1], cursor, depth + 1));
      } else {
        throw new Error('存在不能编译的积木类型。');
      }
      if (cursor > 3600) throw new Error('课件总时长不能超过 3600 秒。');
    }
    return cursor;
  };
  const end = walk(program, 0, 0);
  if (clips.length === 0 && cues.length === 0 && end === 0) throw new Error('在开始积木下面添加一些动作。');
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  const latestByParameter = new Map<string, AnimationClip>();
  for (const clip of sorted) {
    const prior = latestByParameter.get(clip.parameterId);
    if (prior && prior.start + prior.duration > clip.start + 1e-8) {
      const parameter = parameterById.get(clip.parameterId);
      throw new Error(`并行分支同时修改了“${parameter?.name ?? clip.parameterId}”，请使用不同参数或改成顺序动作。`);
    }
    latestByParameter.set(clip.parameterId, clip);
  }
  const duration = Math.max(1, end + (cues.some((cue) => cue.time === end) ? 1 : 0));
  if (duration > 3600) throw new Error('末尾交互节点需要保留 1 秒的继续播放时间，请缩短总时长。');
  return { clips, cues: cues.sort((a, b) => a.time - b.time), duration };
}
