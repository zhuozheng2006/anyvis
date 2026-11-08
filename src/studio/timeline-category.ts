import type { Action } from './core/types';
import { managedObject } from './authoring';

export type ActionCategoryType =
  | 'entrance'
  | 'transform'
  | 'emphasis'
  | 'exit'
  | 'wait'
  | 'audio'
  | 'music'
  | 'camera'
  | 'style'
  | 'default';

export interface ActionCategoryMeta {
  type: ActionCategoryType;
  label: string;
  color: string;
  bgTint: string;
}

const CATEGORY_MAP: Record<ActionCategoryType, { label: string; color: string; bgTint: string }> = {
  entrance: {
    label: '入场',
    color: '#10b981', // Emerald
    bgTint: 'rgba(16, 185, 129, 0.22)',
  },
  transform: {
    label: '变换',
    color: '#3b82f6', // Sapphire Blue
    bgTint: 'rgba(59, 130, 246, 0.22)',
  },
  emphasis: {
    label: '强调',
    color: '#f59e0b', // Amber
    bgTint: 'rgba(245, 158, 11, 0.22)',
  },
  exit: {
    label: '退场',
    color: '#f43f5e', // Rose
    bgTint: 'rgba(244, 63, 94, 0.22)',
  },
  wait: {
    label: '停顿',
    color: '#94a3b8', // Slate Gray
    bgTint: 'rgba(148, 163, 184, 0.18)',
  },
  audio: {
    label: '配音',
    color: '#14b8a6', // Teal
    bgTint: 'rgba(20, 184, 166, 0.22)',
  },
  music: {
    label: '配乐',
    color: '#d4b481', // Warm Bronze / Gold
    bgTint: 'rgba(212, 180, 129, 0.22)',
  },
  camera: {
    label: '运镜',
    color: '#a855f7', // Purple
    bgTint: 'rgba(168, 85, 247, 0.22)',
  },
  style: {
    label: '排版',
    color: '#8b5cf6', // Violet
    bgTint: 'rgba(139, 92, 246, 0.22)',
  },
  default: {
    label: '动作',
    color: '#6ca6ed', // Sky
    bgTint: 'rgba(108, 166, 237, 0.22)',
  },
};

/**
 * Classifies an action or timeline clip into a semantic visual category.
 */
export function classifyActionCategory(
  action?: Action | { id?: string; type: string; fields?: Record<string, unknown> } | null
): ActionCategoryMeta {
  if (!action) {
    return { type: 'default', ...CATEGORY_MAP.default };
  }

  // 1. Special IDs (e.g. default piano music)
  if (action.id === 'anyvis:default-piano') {
    return { type: 'music', ...CATEGORY_MAP.music };
  }

  const type = String(action.type || '').toLowerCase();
  const fields = (action.fields || {}) as Record<string, unknown>;

  // 2. Wait / pauses
  if (type === 'wait' || type.includes('wait') || type.includes('pause')) {
    return { type: 'wait', ...CATEGORY_MAP.wait };
  }

  // 3. Audio & voiceover
  if (type === 'audio_play' || type.includes('audio') || type.includes('voice')) {
    return { type: 'audio', ...CATEGORY_MAP.audio };
  }

  // 4. Camera & 3D view
  if (type === 'camera' || type === 'ambient_rotation' || type.includes('camera')) {
    return { type: 'camera', ...CATEGORY_MAP.camera };
  }

  // 5. Emphasis & Indication
  if (
    type === 'indicate' ||
    type === 'circumscribe' ||
    type === 'wiggle' ||
    type === 'flash' ||
    type === 'focus_on' ||
    type.includes('indicate') ||
    type.includes('flash') ||
    type.includes('wiggle')
  ) {
    return { type: 'emphasis', ...CATEGORY_MAP.emphasis };
  }

  // 6. Exit / Disappearance
  if (
    type === 'fade_out' ||
    type === 'uncreate' ||
    type === 'shrink_to_center' ||
    type.includes('fade_out') ||
    type.includes('uncreate')
  ) {
    return { type: 'exit', ...CATEGORY_MAP.exit };
  }

  // 7. Entrance / Appearance
  if (
    type === 'draw' ||
    type === 'write' ||
    type === 'fade_in' ||
    type === 'grow' ||
    type === 'spin_in' ||
    type === 'type_text' ||
    type === 'reveal_group' ||
    type.includes('fade_in') ||
    type.includes('create')
  ) {
    return { type: 'entrance', ...CATEGORY_MAP.entrance };
  }

  // 8. Managed object creation (in authoring.ts)
  if (managedObject(action as Action)) {
    const appear = String(fields.appear || 'fade');
    if (appear === 'hidden') {
      return { type: 'style', ...CATEGORY_MAP.style };
    }
    return { type: 'entrance', ...CATEGORY_MAP.entrance };
  }

  // 9. Transforms & Motion
  if (
    type === 'move' ||
    type === 'shift' ||
    type === 'rotate' ||
    type === 'scale' ||
    type === 'transform' ||
    type === 'replacement_transform' ||
    type === 'morph' ||
    type === 'match_transform' ||
    type === 'apply_matrix' ||
    type === 'apply_function' ||
    type.includes('transform') ||
    type.includes('move') ||
    type.includes('rotate') ||
    type.includes('scale')
  ) {
    return { type: 'transform', ...CATEGORY_MAP.transform };
  }

  // 10. Styles, positioning and layout
  if (
    type === 'set_position' ||
    type === 'set_style' ||
    type === 'set_layer' ||
    type === 'next_to' ||
    type === 'arrange' ||
    type.includes('position') ||
    type.includes('style')
  ) {
    return { type: 'style', ...CATEGORY_MAP.style };
  }

  return { type: 'default', ...CATEGORY_MAP.default };
}
