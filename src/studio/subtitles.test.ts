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

    expect(code).toContain('class SubtitleNarrationScene(Scene):');
    expect(code).toContain('self.play(FadeIn(');
    expect(code).toContain('self.play(FadeOut(');
  });

  it('injects subtitle text actions into project', () => {
    const dummyProject: Project = {
      schemaVersion: 2,
      id: 'p_sub',
      name: 'Subtitle Test',
      scene: { dimension: '2d', background: '#000', width: 1920, height: 1080, fps: 60 },
      actions: [],
    };

    const { project: nextProject, actionIds } = createSubtitleActions(
      dummyProject,
      DEFAULT_SUBTITLE_PRESET,
    );

    expect(nextProject.actions).toHaveLength(DEFAULT_SUBTITLE_PRESET.length);
    expect(actionIds).toHaveLength(DEFAULT_SUBTITLE_PRESET.length);
    expect(nextProject.actions[0].type).toBe('create_text');
    expect(nextProject.actions[0].fields.text).toBe(DEFAULT_SUBTITLE_PRESET[0].text);
  });
});
