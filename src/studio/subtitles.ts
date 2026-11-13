import type { Action, Project } from './core/types';
import { createAction } from './core/catalog';
import { compileProject } from './core/compiler';
import { createEmptyProject } from './core/project';
import { appendPlaygroundActions, playgroundName } from './playground-actions';

export interface SubtitleItem {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  color?: string;
  fontSize?: number;
  position?: 'bottom' | 'top' | 'center';
}

export const DEFAULT_SUBTITLE_PRESET: SubtitleItem[] = [
  {
    id: 'sub_1',
    startTime: 0.5,
    endTime: 3.8,
    text: '欢迎来到本期数学可视化深度探索',
    color: '#ffffff',
    fontSize: 24,
    position: 'bottom',
  },
  {
    id: 'sub_2',
    startTime: 4.2,
    endTime: 8.5,
    text: '今天我们将直观解构三维参数曲面与向量场的几何本质',
    color: '#58c4dd',
    fontSize: 24,
    position: 'bottom',
  },
  {
    id: 'sub_3',
    startTime: 9.0,
    endTime: 13.5,
    text: '注意观察流线粒子在局部鞍点与极值周围的连续流动规律',
    color: '#e2b340',
    fontSize: 24,
    position: 'bottom',
  },
  {
    id: 'sub_4',
    startTime: 14.0,
    endTime: 18.0,
    text: '这正是微积分基本定理与斯托克斯公式的几何直观体现',
    color: '#83c167',
    fontSize: 24,
    position: 'bottom',
  },
];

/** Formats seconds to SRT timestamp 00:00:00,000 */
export function formatSrtTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const totalMs = Math.round(safe * 1000);
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/** Parses SRT/VTT timestamp (HH:MM:SS,mmm or MM:SS.mmm) to seconds */
export function parseSrtTime(stamp: string): number {
  const token = stamp.trim().split(/\s+/)[0] || '';
  const clean = token.replace('.', ',');
  const parts = clean.split(':');
  if (parts.length < 2 || parts.length > 3) return 0;
  const hrs = parts.length === 3 ? Math.max(0, Number(parts[0]) || 0) : 0;
  const mins = Math.max(0, Number(parts[parts.length - 2]) || 0);
  const secParts = parts[parts.length - 1].split(',');
  const secs = Math.max(0, Number(secParts[0]) || 0);
  const digits = (secParts[1] || '').match(/^\d+/)?.[0] ?? '';
  const ms = digits ? parseInt(digits.slice(0, 3).padEnd(3, '0'), 10) || 0 : 0;
  const total = (hrs * 3600000 + mins * 60000 + secs * 1000 + ms) / 1000;
  return Number.isFinite(total) ? total : 0;
}

/** Exports subtitles to standard SRT file format */
export function exportToSrt(subtitles: SubtitleItem[]): string {
  const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
  return sorted
    .map((sub, idx) => {
      return `${idx + 1}\n${formatSrtTime(sub.startTime)} --> ${formatSrtTime(sub.endTime)}\n${sub.text.trim()}\n`;
    })
    .join('\n');
}

/** Parses standard SRT string into SubtitleItem list */
export function parseSrt(srtContent: string): SubtitleItem[] {
  const blocks = srtContent.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  const items: SubtitleItem[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].trim().split('\n');
    if (lines.length < 2) continue;

    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;

    const [startStr, endStr] = timeLine.split('-->');
    const startTime = parseSrtTime(startStr);
    const endTime = parseSrtTime(endStr);

    const timeLineIdx = lines.indexOf(timeLine);
    const textLines = lines.slice(timeLineIdx + 1).join('\n').trim();

    if (textLines) {
      items.push({
        id: `sub_${Date.now()}_${i}`,
        startTime,
        endTime,
        text: textLines,
        color: '#ffffff',
        fontSize: 24,
        position: 'bottom',
      });
    }
  }

  return items;
}

/** Times are relative to the beginning of the appended subtitle section. */
export function generateSubtitlesPythonCode(subtitles: SubtitleItem[]): string {
  return compileProject(createSubtitleActions(createEmptyProject(), subtitles).project).code;
}

export function createSubtitleActions(project: Project, subtitles: SubtitleItem[]): { project: Project; actionIds: string[] } {
  const actions: Action[] = [];
  const events: { time: number; order: number; action: Action }[] = [];
  for (const sub of subtitles) {
    if (![sub.startTime, sub.endTime].every(Number.isFinite) || sub.startTime < 0 || sub.endTime <= sub.startTime || sub.endTime > 600) throw Error('字幕起止时间必须为 0–600 秒，结束晚于开始。');
    const name = playgroundName('字幕');
    const text = createAction('text', { name, text: sub.text, color: sub.color || '#ffffff', fontSize: sub.fontSize ?? 24, maxWidth: 12, x: 0, y: sub.position === 'top' ? 3 : sub.position === 'center' ? 0 : -3.2, appear: 'none' });
    events.push({ time: sub.startTime, order: 1, action: text });
    if (project.scene.dimension === '3d') events.push({ time: sub.startTime, order: 2, action: createAction('fixed_in_frame', { target: name }) });
    events.push({ time: sub.endTime, order: 0, action: createAction('remove', { target: name }) });
  }
  let time = 0;
  for (const event of events.sort((a, b) => a.time - b.time || a.order - b.order)) {
    let gap = event.time - time;
    while (gap > 1e-6) { const duration = Math.min(120, gap); actions.push(createAction('wait', { duration })); gap -= duration; }
    actions.push(event.action); time = event.time;
  }
  return appendPlaygroundActions(project, actions);
}
