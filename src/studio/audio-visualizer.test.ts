import { describe, it, expect } from 'vitest';
import {
  AUDIO_VISUALIZER_PRESETS,
  simulateAudioFrequencies,
  generateAudioVisualizerPythonCode,
  createAudioVisualizerActions,
  type AudioVisualizerPreset,
} from './audio-visualizer';
import { createEmptyProject } from './core/project';

describe('audio visualizer engine', () => {
  it('has valid visualizer presets', () => {
    expect(AUDIO_VISUALIZER_PRESETS.length).toBeGreaterThanOrEqual(5);
    const voice = AUDIO_VISUALIZER_PRESETS.find(p => p.id === 'voice-bars');
    expect(voice).toBeDefined();
    expect(voice?.type).toBe('bars');
    expect(voice?.barCount).toBe(32);
  });

  it('simulates natural frequency spectrum with valid normalized heights', () => {
    const bars32 = simulateAudioFrequencies(1.5, 32, 'bars');
    expect(bars32.length).toBe(32);

    for (const h of bars32) {
      expect(h).toBeGreaterThanOrEqual(0.02);
      expect(h).toBeLessThanOrEqual(1.0);
      expect(Number.isFinite(h)).toBe(true);
    }

    // Spectrum varies dynamically over time
    const barsAt2 = simulateAudioFrequencies(2.0, 32, 'bars');
    expect(barsAt2).not.toEqual(bars32);
  });

  it('generates valid standalone Manim CE Python code for audio visualizer', () => {
    const preset = AUDIO_VISUALIZER_PRESETS.find(p => p.id === 'voice-bars')!;
    const code = generateAudioVisualizerPythonCode(preset);

    expect(code).toContain('class AudioVisualizerScene(Scene):');
    expect(code).toContain('VGroup(');
    expect(code).toContain('Rectangle(');
    expect(code).toContain('add_updater');
  });

  it('creates AnyVis project actions for audio visualizer', () => {
    const project = createEmptyProject();
    const preset = AUDIO_VISUALIZER_PRESETS.find(p => p.id === 'voice-bars')!;
    const { project: nextProject, actionIds } = createAudioVisualizerActions(project, preset);

    expect(actionIds.length).toBeGreaterThanOrEqual(1);
    const flattened = nextProject.actions;
    expect(flattened.some(a => String(a.fields.name || '').includes('音频频谱'))).toBe(true);
  });
});
