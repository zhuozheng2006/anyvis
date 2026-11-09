import type { Project, TimelineMarker } from './core/types';
import { timelineClips } from './authoring';
import { audioClips } from './timeline-model';

export type SmartMarkerMode = 'speech' | 'beat' | 'cuts' | 'interval';

export interface SmartMarkerConfig {
  mode: SmartMarkerMode;
  /** Seconds for phrase cadence in speech mode, or interval in interval mode */
  cadenceSeconds?: number;
  /** BPM for musical beat mode */
  bpm?: number;
  /** Label prefix template, e.g. "语段", "拍点", "镜头", "分段" */
  labelPrefix?: string;
  /** Marker color hex */
  color?: string;
  /** Whether to replace existing markers */
  replaceExisting?: boolean;
}

export interface MarkerPreviewItem {
  time: number;
  label: string;
  color: string;
}

/**
 * Generate smart markers based on project state and configuration.
 */
export function generateSmartMarkers(project: Project, config: SmartMarkerConfig): TimelineMarker[] {
  const fps = Math.max(1, project.scene.fps || 30);
  const color = config.color || '#fbbf24';
  const prefix = config.labelPrefix?.trim() || getDefaultPrefix(config.mode);
  const totalDuration = calculateTotalDuration(project);
  const items: MarkerPreviewItem[] = [];

  if (config.mode === 'speech') {
    // User-specified cadence, not detected speech pauses.
    const phraseInterval = Math.max(0.5, config.cadenceSeconds || 3.0);
    let t = phraseInterval;
    let count = 1;
    while (t < totalDuration + 0.05) {
      const snapped = Number((Math.round(t * fps) / fps).toFixed(4));
      items.push({
        time: snapped,
        label: `${prefix} ${count}`,
        color,
      });
      t += phraseInterval;
      count++;
    }
  } else if (config.mode === 'beat') {
    // Musical beat cadence: calculates interval based on BPM
    const bpm = Math.max(30, Math.min(300, config.bpm || 120));
    const beatInterval = 60 / bpm;
    let t = beatInterval;
    let count = 1;
    while (t < totalDuration + 0.05) {
      const snapped = Number((Math.round(t * fps) / fps).toFixed(4));
      items.push({
        time: snapped,
        label: `${prefix} ${count}`,
        color,
      });
      t += beatInterval;
      count++;
    }
  } else if (config.mode === 'cuts') {
    // Visual scene cuts: creates a marker at the start of each top-level action/animation
    let cutIndex = 1;
    for (const clip of timelineClips(project.actions)) {
      if (clip.start === null) break;
      const action = clip.action;
      const snapped = Number((Math.round(clip.start * fps) / fps).toFixed(4));
      const actionName = String(action.fields.name || action.fields.target || action.type);
      // Declarations at the same instant share one marker.
      if (!items.some(item => item.time === snapped)) items.push({
        time: snapped, label: `${prefix} ${cutIndex++} (${actionName})`, color,
      });
    }
  } else if (config.mode === 'interval') {
    // Custom equal intervals
    const interval = Math.max(0.2, config.cadenceSeconds || 2.0);
    let t = interval;
    let count = 1;
    while (t < totalDuration + 0.05) {
      const snapped = Number((Math.round(t * fps) / fps).toFixed(4));
      items.push({
        time: snapped,
        label: `${prefix} ${count}`,
        color,
      });
      t += interval;
      count++;
    }
  }

  const newMarkers: TimelineMarker[] = items.map(item => ({
    id: `m_${crypto.randomUUID().slice(0, 8)}`,
    time: item.time,
    label: item.label,
    color: item.color,
  }));

  if (config.replaceExisting) {
    return newMarkers.sort((a, b) => a.time - b.time);
  }

  const existing = project.scene.markers || [];
  // Merge and deduplicate near-identical times (< 1 frame difference)
  const combined = [...existing];
  for (const m of newMarkers) {
    const isDup = combined.some(e => Math.abs(e.time - m.time) < 1 / fps + 1e-4);
    if (!isDup) {
      combined.push(m);
    }
  }
  return combined.sort((a, b) => a.time - b.time);
}

function getDefaultPrefix(mode: SmartMarkerMode): string {
  switch (mode) {
    case 'speech':
      return '语段';
    case 'beat':
      return '拍点';
    case 'cuts':
      return '镜头';
    case 'interval':
      return '分段';
  }
}

function calculateTotalDuration(project: Project): number {
  const visual = timelineClips(project.actions);
  const audio = audioClips(project);
  const visualEnd = Math.max(0, ...visual.map(c => c.start === null ? 0 : c.start + (c.duration ?? 0)));
  const audioEnd = Math.max(0, ...audio.map(c => c.start === null ? 0 : c.start + c.duration));
  return Math.max(visualEnd, audioEnd);
}
