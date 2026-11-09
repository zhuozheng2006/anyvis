import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';
import { updateProjectChapters } from './storyboard';
import { readCurrent, readProjects, saveLatestProject, saveProject, readDefaultMusic, saveDefaultMusic, withDefaultMusic } from './storage';

const CURRENT = 'anyvis.studio.v2.current';
const LIBRARY = 'anyvis.studio.v2.projects';
class MemoryStorage implements Storage {
  readonly data = new Map<string, string>();
  failKey: string | undefined;
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new DOMException('Storage full', 'QuotaExceededError');
    this.data.set(key, value);
  }
}
function example() {
  const project = createEmptyProject();
  project.actions = [createAction('circle', { radius: 1 })];
  return project;
}
let storage: MemoryStorage;
beforeEach(() => { storage = new MemoryStorage(); vi.stubGlobal('localStorage', storage); });
afterEach(() => vi.unstubAllGlobals());

describe('recoverable project persistence', () => {
  it('recovers the first saved project after only its current-record write failed', () => {
    const project = example();
    storage.failKey = CURRENT;
    expect(() => saveProject(project)).toThrow('Storage full');
    expect(readCurrent()).toEqual(project);
  });
  it('recovers a valid library entry when the current record is corrupt', () => {
    const project = example(); saveProject(project);
    storage.setItem(CURRENT, '{broken');
    expect(readCurrent()).toEqual(project);
    storage.setItem(CURRENT, JSON.stringify({ schemaVersion: 2 }));
    expect(readCurrent()).toEqual(project);
  });
  it('does not invent a recovered project when neither record is valid', () => {
    storage.setItem(CURRENT, '{broken'); storage.setItem(LIBRARY, '[null]');
    expect(readCurrent()).toBeUndefined();
  });
  it('keeps chapter markers through autosave and reopening from the project list', () => {
    const project = updateProjectChapters(example(), [{
      id: 'chapter-2', index: 2, name: '曲面的局部结构', startTime: 12.5,
      endTime: 20, duration: 7.5, skipAnimations: false, actionCount: 1, summaryText: '',
    }]);
    saveProject(project);
    expect(readCurrent()?.scene.markers).toEqual(project.scene.markers);
    expect(readProjects()[0].project.scene.markers).toEqual(project.scene.markers);
    const reopened = readCurrent()!;
    reopened.scene.markers![0].label = '重命名章节';
    saveProject(reopened);
    expect(readCurrent()?.scene.markers?.[0].label).toBe('重命名章节');
  });
  it('defaults new works to piano and remembers an explicit silent preference', () => {
    const old = example();
    expect(readDefaultMusic()).toBe('piano');
    expect(withDefaultMusic(old).scene).toMatchObject({ backgroundMusic: 'piano', musicGainDb: -18 });
    expect(old.scene.backgroundMusic).toBeUndefined();
    saveDefaultMusic('none');
    expect(withDefaultMusic(example()).scene.backgroundMusic).toBe('none');
    saveProject(old);
    expect(readCurrent()?.scene.backgroundMusic).toBeUndefined();
  });
  it('preserves a saved soundtrack independently of the new-project preference', () => {
    const p = withDefaultMusic(example());
    p.scene.musicGainDb = -24;
    saveProject(p); saveDefaultMusic('none');
    expect(readCurrent()?.scene).toMatchObject({ backgroundMusic: 'piano', musicGainDb: -24 });
  });
  it('keeps a temporarily blank title readable after closing without mutating the caller', () => {
    const project = Object.freeze({ ...example(), name: ' \t ' });
    saveProject(project);
    expect(project.name).toBe(' \t ');
    expect(readCurrent()?.name).toBe('未命名动画');
    expect(readProjects().map(item => item.project.id)).toEqual([project.id]);
    expect(readProjects()[0].project.actions).toEqual(project.actions);
  });
  it('rejects invalid project data before overwriting either valid saved record', () => {
    const project = example();
    saveProject(project);
    const invalid = { ...project, scene: { ...project.scene, width: -1 } };
    expect(() => saveProject(invalid)).toThrow('width');
    expect(readCurrent()).toEqual(project);
    expect(readProjects()[0].project).toEqual(project);
  });
  it('keeps the old draft when the project library itself cannot be written', () => {
    const project = example();
    saveProject(project);
    storage.failKey = LIBRARY;
    expect(() => saveProject({ ...project, name: '未写入的新标题' })).toThrow('Storage full');
    expect(readCurrent()).toEqual(project);
    expect(readProjects()[0].project).toEqual(project);
  });
  it('preserves a newer editor snapshot after only the current-draft write fails', () => {
    const old = example();
    saveProject(old);
    const latest = structuredClone(old);
    latest.actions[0].fields.radius = 3;
    storage.failKey = CURRENT;
    expect(() => saveLatestProject(() => latest, old)).toThrow('Storage full');
    // The library already has the exact last edit; an old-state fallback must not undo it.
    expect(readProjects()[0].project.actions[0].fields.radius).toBe(3);
    expect(JSON.parse(storage.getItem(CURRENT)!).actions[0].fields.radius).toBe(1);
    // Reopening must recover that newer copy before autosave can overwrite it.
    const restored = readCurrent()!;
    expect(restored.actions[0].fields.radius).toBe(3);
    storage.failKey = undefined;
    saveProject(restored);
    expect(readCurrent()?.actions[0].fields.radius).toBe(3);
    expect(readProjects()[0].project.actions[0].fields.radius).toBe(3);
    expect(old.actions[0].fields.radius).toBe(1);
  });
  it('uses the last valid project only when obtaining an editor snapshot fails', () => {
    const fallback = example();
    saveLatestProject(() => { throw new Error('An incomplete block field'); }, fallback);
    expect(readCurrent()).toEqual(fallback);
    expect(readProjects()[0].project).toEqual(fallback);
  });
});
