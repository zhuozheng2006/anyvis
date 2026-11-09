import { describe, it, expect } from 'vitest';
import {
  formatTimestamp,
  estimateProjectDuration,
  buildStoryboard,
  exportYouTubeChapters,
  generateManimSectionPythonCode,
  updateProjectChapters,
  type StoryboardChapter,
} from './storyboard';
import type { Project } from './core/types';
import { createAction } from './core/catalog';

describe('storyboard chapter management and video cues', () => {
  it('formats seconds into mm:ss timestamp format', () => {
    expect(formatTimestamp(0)).toBe('00:00');
    expect(formatTimestamp(59)).toBe('00:59');
    expect(formatTimestamp(65)).toBe('01:05');
    expect(formatTimestamp(125.8)).toBe('02:05');
  });

  it('estimates project duration from actions and markers', () => {
    const project: Project = {
      schemaVersion: 2,
      id: 'p1',
      name: 'P1',
      scene: { dimension: '2d', background: '#000', width: 1920, height: 1080, fps: 60 },
      actions: [
        createAction('wait', { duration: 3 }),
        createAction('wait', { duration: 13 }),
      ],
    };
    expect(estimateProjectDuration(project)).toBe(16);
  });

  it('builds default single chapter when no markers exist', () => {
    const project: Project = {
      schemaVersion: 2,
      id: 'p2',
      name: 'P2',
      scene: { dimension: '2d', background: '#000', width: 1920, height: 1080, fps: 60 },
      actions: [
        createAction('circle', { duration: 5 }),
      ],
    };
    const chapters = buildStoryboard(project);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].name).toContain('全片场景');
    expect(chapters[0].startTime).toBe(0);
    expect(chapters[0].actionCount).toBe(1);
  });

  it('builds multi-chapter sequence when markers are present', () => {
    const project: Project = {
      schemaVersion: 2,
      id: 'p3',
      name: 'P3',
      scene: {
        dimension: '2d',
        background: '#000',
        width: 1920,
        height: 1080,
        fps: 60,
        markers: [
          { id: 'm1', time: 5, label: '定理阐述', color: '#38bdf8' },
          { id: 'm2', time: 12, label: '几何证明', color: '#e2b340' },
        ],
      },
      actions: [
        createAction('text', { duration: 5 }),
        createAction('wait', { duration: 7 }),
        createAction('wait', { duration: 4 }),
      ],
    };
    const chapters = buildStoryboard(project);
    expect(chapters.length).toBeGreaterThanOrEqual(3);
    expect(chapters[0].startTime).toBe(0);
    expect(chapters[0].endTime).toBe(5);
    expect(chapters[1].startTime).toBe(5);
    expect(chapters[1].name).toBe('定理阐述');
  });

  it('exports YouTube formatted chapter text', () => {
    const chapters: StoryboardChapter[] = [
      {
        id: 'c1',
        index: 1,
        name: '引言与问题引入',
        startTime: 0,
        endTime: 15,
        duration: 15,
        skipAnimations: false,
        actionCount: 2,
        summaryText: '',
      },
      {
        id: 'c2',
        index: 2,
        name: '向量场与散度解析',
        startTime: 15,
        endTime: 45,
        duration: 30,
        skipAnimations: false,
        actionCount: 3,
        summaryText: '',
      },
    ];

    const ytText = exportYouTubeChapters(chapters);
    expect(ytText).toContain('00:00 引言与问题引入');
    expect(ytText).toContain('00:15 向量场与散度解析');
  });

  it('generates Python code with self.next_section()', () => {
    const project: Project = {
      schemaVersion: 2,
      id: 'p4',
      name: 'P4',
      scene: { dimension: '2d', background: '#000', width: 1920, height: 1080, fps: 60 },
      actions: [],
    };
    const chapters: StoryboardChapter[] = [
      {
        id: 'c1',
        index: 1,
        name: 'Introduction',
        startTime: 0,
        endTime: 10,
        duration: 10,
        skipAnimations: false,
        actionCount: 0,
        summaryText: '',
      },
      {
        id: 'c2',
        index: 2,
        name: 'FastPreview',
        startTime: 10,
        endTime: 20,
        duration: 10,
        skipAnimations: true,
        actionCount: 0,
        summaryText: '',
      },
    ];

    const pyCode = generateManimSectionPythonCode(chapters, project);
    expect(pyCode).toContain('self.next_section(name="Introduction")');
    expect(pyCode).toContain('self.next_section(name="FastPreview", skip_animations=True)');
  });

  it('updates project markers from edited storyboard chapters', () => {
    const project: Project = {
      schemaVersion: 2,
      id: 'p5',
      name: 'P5',
      scene: { dimension: '2d', background: '#000', width: 1920, height: 1080, fps: 60, markers: [] },
      actions: [],
    };
    const chapters: StoryboardChapter[] = [
      {
        id: 'c1',
        index: 1,
        name: 'Scene 1',
        startTime: 0,
        endTime: 8,
        duration: 8,
        skipAnimations: false,
        actionCount: 0,
        summaryText: '',
      },
      {
        id: 'c2',
        index: 2,
        name: 'Scene 2',
        startTime: 8,
        endTime: 18,
        duration: 10,
        markerId: 'm_sc2',
        skipAnimations: false,
        actionCount: 0,
        summaryText: '',
      },
    ];

    const updated = updateProjectChapters(project, chapters);
    expect(updated.scene.markers).toHaveLength(1);
    expect(updated.scene.markers![0].time).toBe(8);
    expect(updated.scene.markers![0].label).toBe('Scene 2');
  });
});

it('chapter markers do not extend a project or pretend to export its animations', () => {
  const project = { schemaVersion: 2 as const, id: 'test', name: 'test', scene: { dimension: '2d' as const, width: 1920, height: 1080, fps: 30, background: '#000000', markers: [{id: 'late',time: 40,label:'late',color:'#ffffff'}] }, actions: [createAction('wait', { duration: 3.5 })] };
  expect(estimateProjectDuration(project)).toBe(3.5);
  const chapters = buildStoryboard(project);
  expect(chapters).toHaveLength(1);
  expect(chapters[0].endTime).toBe(3.5);
  chapters[0].name = 'quote" and newline\n';
  const python = generateManimSectionPythonCode(chapters, project);
  expect(python).toContain('self.wait(3.5)');
  expect(python).toContain('does not include project objects');
  expect(python).toContain(JSON.stringify(chapters[0].name));
});
