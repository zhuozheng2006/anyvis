import type { Action } from './core/types';

export interface OutlineRow { action: Action; depth: number; number: string; context?: string }
export function outlineRows(actions: Action[], parent = '', depth = 0, context?: string): OutlineRow[] {
  return actions.flatMap((action, index) => {
    const number = parent ? `${parent}.${index + 1}` : String(index + 1).padStart(2, '0');
    const mode = action.type === 'parallel' ? '同时' : action.type === 'repeat' ? '重复内' : '依次';
    return [
      { action, depth, number, context },
      ...outlineRows(action.children || [], number, depth + 1, mode),
      ...(action.branches || []).flatMap((branch, i) => outlineRows(branch, `${number}.${i + 1}`, depth + 1, `分支 ${i + 1}`)),
    ];
  });
}

export function stepTiming(action: Action): string {
  if(action.type.startsWith('api_') && !['play','animate'].includes(String(action.fields.mode))) return action.fields.mode==='show'?'直接显示':action.fields.mode==='set'?'修改属性':'执行 / 保存';
  if (action.fields.appear === 'hidden') return '暂不显示';
  if (action.fields.appear === 'none') return '直接显示';
  if (action.type === 'repeat') return `${action.fields.count} 次`;
  if (typeof action.fields.duration === 'number') return action.fields.duration === 0 ? '立即' : `${action.fields.duration} 秒`;
  return '';
}
