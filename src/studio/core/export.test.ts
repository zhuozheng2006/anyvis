import { describe, expect, it } from 'vitest';
import { createAction } from './catalog.ts';
import { compileProject } from './compiler.ts';
import { exportStandalonePython } from './export.ts';
import { createEmptyProject } from './project.ts';

describe('standalone Python export', () => {
  it('keeps portrait dimensions, mathematical frame and project fps explicit', () => {
    const project = createEmptyProject();
    project.scene = { ...project.scene, width: 1080, height: 1920, fps: 24 };
    project.actions = [createAction('circle')];
    const python = exportStandalonePython(project);
    expect(python).toContain('config.pixel_width = 1080');
    expect(python).toContain('config.pixel_height = 1920');
    expect(python).toContain('config.frame_width = 8 * (1080 / 1920)');
    expect(python).toContain('config.frame_height = 8');
    expect(python).toContain('config.frame_rate = 24');
    expect(python).toContain('config.renderer = "cairo"');
    expect(python.indexOf('from manim import *')).toBeLessThan(python.indexOf('config.renderer'));
    expect(python.indexOf('config.renderer')).toBeLessThan(python.indexOf('class AnyVisScene'));
  });
  it('does not alter internal generated code or worker-selected preview resolution', () => {
    const project = createEmptyProject();
    project.scene = { ...project.scene, width: 1080, height: 1080, fps: 60 };
    project.actions = [createAction('circle')];
    const before = compileProject(project);
    const standalone = exportStandalonePython(project);
    const after = compileProject(project);
    expect(after).toEqual(before);
    expect(after.code).not.toContain('config.pixel_width');
    expect(standalone).toContain('config.frame_width = 8 * (1080 / 1080)');
    expect(standalone).toContain('config.frame_rate = 60');
    expect(standalone).toContain('--format webm');
    expect(standalone).not.toContain('config.format =');
  });
  it('rejects invalid project data and unresolved objects instead of exporting broken code', () => {
    expect(() => exportStandalonePython({ schemaVersion: 1 })).toThrow();
    const project = createEmptyProject();
    project.actions = [createAction('move', { target: 'missing' })];
    expect(() => exportStandalonePython(project)).toThrow('找不到对象');
  });
});
