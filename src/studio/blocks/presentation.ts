import type { BlockDefinition } from '../core/types';

// Presentation metadata only: project types, fields and execution stay stable.
export const ACTION_GROUPS = [
  { name: '出场与退场', colour: '#0D9488', hint: '让已有对象出现或离开画面', types: ['create','write','fade_in','grow','draw_border','grow_from_point','grow_from_edge','spin_in','reveal_group','type_text','add','fade_out','uncreate','shrink','remove'] },
  { name: '移动与变形', colour: '#3B82F6', hint: '改变位置、大小、角度或形状', types: ['move','shift','rotate','scale','path_move','transform','replacement_transform','matching_tex','transform_from_copy','apply_matrix'] },
  { name: '强调与指示', colour: '#D97706', hint: '临时突出重点，引导观众注意', types: ['indicate','circumscribe','flash','wiggle','focus_on','wave','passing_flash','graph_highlight'] },
  { name: '时间与顺序', colour: '#B45309', hint: '下方依次执行；放进“同时执行”可并行动画', types: ['wait','sequence','parallel','repeat','audio_play','audio_stop'] },
  { name: '外观与排布', colour: '#DB2777', hint: '修改颜色、可见程度与相对位置', types: ['color','opacity','set_style','set_position','next_to','arrange','set_layer'] },
  { name: '参数与跟随', colour: '#059669', hint: '先定义参数，再改变参数或建立跟随关系', types: ['tracker','animate_value','follow','stop_updaters'] },
  { name: '三维镜头', colour: '#6366F1', hint: '用于三维场景的视角与屏幕固定', types: ['camera','ambient_rotation','fixed_in_frame'] },
];
export function actionGroup(type: string) { return ACTION_GROUPS.find(group => group.types.includes(type)); }

const ESSENTIAL: Record<string, string[]> = {
  move: ['target','x','y','z','duration'], shift: ['target','dx','dy','dz','duration'],
  rotate: ['target','angle','axis','duration'], scale: ['target','factor','duration'],
  grow_from_point: ['target','x','y','z','duration'], camera: ['phi','theta','zoom','duration'],
  transform: ['target','destination','duration'], replacement_transform: ['target','destination','duration'],
  transform_from_copy: ['target','destination','duration'], matching_tex: ['target','destination','duration'],
  path_move: ['target','path','duration'], apply_matrix: ['target','matrix','duration'],
  audio_play: ['name','asset','delay','offset','length','gain'],
  follow: ['target','leader','dx','dy'], set_position: ['target','x','y','z'],
  set_style: ['target','color','fill','stroke'], next_to: ['target','other','direction','buff'],
};

export function essentialFields(definition: BlockDefinition): Set<string> {
  if (definition.fields.length <= 4) return new Set(definition.fields.map(field => field.name));
  if (ESSENTIAL[definition.type]) return new Set(ESSENTIAL[definition.type]);
  if (definition.apiId) {
    const keys = definition.fields.filter(field => ['name','receiver','mode','setValue'].includes(field.name) || field.apiParameter?.required || field.apiParameter?.kind === 'var_positional').map(field => field.name);
    for (const field of definition.fields) if (keys.length < 5 && !keys.includes(field.name) && field.apiParameter && !['var_keyword','var_positional'].includes(field.apiParameter.kind)) keys.push(field.name);
    return new Set(keys);
  }
  // Time belongs to the primary controls of every animated action. Easing is optional.
  if (!definition.createsObject) return new Set(definition.fields.filter(field => field.name !== 'easing').map(field => field.name));
  const secondary = new Set(['x','y','z','appear','fill','easing']);
  const chosen = definition.fields.filter(field => !secondary.has(field.name)).slice(0, 4).map(field => field.name);
  return new Set(chosen);
}

export function blockFieldLabel(definition: BlockDefinition, name: string, fallback: string): string {
  if (['move','set_position'].includes(definition.type)) return ({ x: '目标 x', y: '目标 y', z: '目标 z' } as Record<string,string>)[name] || fallback;
  if (definition.type === 'shift') return ({ dx: '水平距离', dy: '竖直距离', dz: '深度距离' } as Record<string,string>)[name] || fallback;
  if (definition.type === 'scale' && name === 'factor') return '变为原来的';
  if (definition.createsObject && name === 'name') return '对象';
  return fallback;
}
