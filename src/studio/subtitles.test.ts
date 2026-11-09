import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SUBTITLE_PRESET,
  formatSrtTime,
  parseSrtTime,
  exportToSrt,
  parseSrt,
  generateSubtitlesPythonCode,
  createSubtitleActions,
  type SubtitleItem,
} from './subtitles';
import type { Project } from './core/types';

describe('subtitles SRT parsing, formatting, and action generation', () => {
  it('formats seconds to SRT timestamp format 00:00:00,000', () => {
    expect(formatSrtTime(0)).toBe('00:00:00,000');
    expect(formatSrtTime(65.432)).toBe('00:01:05,432');
    expect(formatSrtTime(3661.5)).toBe('01:01:01,500');
  });

  it('parses SRT timestamp back to seconds', () => {
    expect(parseSrtTime('00:00:00,000')).toBe(0);
    expect(parseSrtTime('00:01:05,500')).toBeCloseTo(65.5, 3);
    expect(parseSrtTime('01:00:00.000')).toBe(3600);
  });

  it('exports to SRT format and parses it back faithfully', () => {
    const srtText = exportToSrt(DEFAULT_SUBTITLE_PRESET);
    expect(srtText).toContain('1\n00:00:00,500 --> 00:00:03,800');
    expect(srtText).toContain('欢迎来到本期数学可视化深度探索');

    const parsed = parseSrt(srtText);
    expect(parsed.length).toBe(DEFAULT_SUBTITLE_PRESET.length);
    expect(parsed[0].text).toBe(DEFAULT_SUBTITLE_PRESET[0].text);
    expect(parsed[0].startTime).toBeCloseTo(0.5, 2);
    expect(parsed[0].endTime).toBeCloseTo(3.8, 2);
  });

  it('generates runnable Manim CE Python code for subtitles', () => {
    const code = generateSubtitlesPythonCode(DEFAULT_SUBTITLE_PRESET);

    expect(code).toContain('class AnyVisScene(MovingCameraScene):');
    expect(code).toContain('self.add(');
    expect(code).toContain('self.remove(');
  });

  it('injects subtitle text actions into project', () => {
    const dummyProject: Project = {
      schemaVersion: 2,
      id: 'p_sub',
      name: 'Subtitle Test',
      scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
      actions: [],
    };

    const { project: nextProject, actionIds } = createSubtitleActions(
      dummyProject,
      DEFAULT_SUBTITLE_PRESET,
    );

    expect(nextProject.actions.filter(a => a.type === 'text')).toHaveLength(DEFAULT_SUBTITLE_PRESET.length);
    expect(actionIds).toHaveLength(nextProject.actions.length);
    expect(nextProject.actions[0].type).toBe('wait');
    expect(nextProject.actions.find(a => a.type === 'text')!.fields.text).toBe(DEFAULT_SUBTITLE_PRESET[0].text);
  });
});

it('preserves SRT millisecond precision and multiline captions across CRLF import', () => {
  const items = parseSrt('1\r\n00:00:00,123 --> 00:00:02,345\r\nfirst line\r\nsecond line\r\n');
  expect(items[0]).toMatchObject({ startTime: 0.123, endTime: 2.345, text: 'first line\nsecond line' });
  expect(exportToSrt(items)).toContain('00:00:00,123 --> 00:00:02,345\nfirst line\nsecond line');
});
