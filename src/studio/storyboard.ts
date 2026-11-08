import type { Project, TimelineMarker } from './core/types';

export interface StoryboardChapter {
  id: string;
  index: number;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  markerId?: string;
  skipAnimations: boolean;
  actionCount: number;
  summaryText: string;
}

/** Formats seconds into mm:ss standard video cue format */
export function formatTimestamp(seconds: number): string {
  const safeSec = Math.max(0, seconds);
  const mins = Math.floor(safeSec / 60);
  const secs = Math.floor(safeSec % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/** Calculates total animation duration across all project actions */
export function estimateProjectDuration(project: Project): number {
  let maxTime = 10; // Default minimum 10s
  for (const action of project.actions) {
    const runTime = typeof action.fields?.runTime === 'number' ? action.fields.runTime : 1.5;
    const start = typeof action.fields?.startTime === 'number' ? action.fields.startTime : 0;
    const end = start + runTime;
    if (end > maxTime) {
      maxTime = end;
    }
  }

  // Also check markers
  if (project.scene.markers && project.scene.markers.length > 0) {
    for (const m of project.scene.markers) {
      if (m.time > maxTime) {
        maxTime = m.time + 3;
      }
    }
  }

  return Math.ceil(maxTime);
}

/** Builds storyboard chapters from project markers and actions */
export function buildStoryboard(project: Project): StoryboardChapter[] {
  const totalDuration = estimateProjectDuration(project);
  const markers = [...(project.scene.markers || [])].sort((a, b) => a.time - b.time);

  if (markers.length === 0) {
    return [
      {
        id: 'chap_default',
        index: 1,
        name: '全片场景 (Full Scene)',
        startTime: 0,
        endTime: totalDuration,
        duration: totalDuration,
        skipAnimations: false,
        actionCount: project.actions.length,
        summaryText: `包含 ${project.actions.length} 个编排动作，全长 ${formatTimestamp(totalDuration)}`,
      },
    ];
  }

  const chapters: StoryboardChapter[] = [];
  let currentTime = 0;

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    if (marker.time > currentTime) {
      const isFirst = i === 0 && currentTime === 0;
      chapters.push({
        id: `chap_${chapters.length + 1}`,
        index: chapters.length + 1,
        name: isFirst ? '序幕引言 (Introduction)' : `分段 ${chapters.length + 1}`,
        startTime: currentTime,
        endTime: marker.time,
        duration: Number((marker.time - currentTime).toFixed(2)),
        skipAnimations: false,
        actionCount: countActionsInWindow(project, currentTime, marker.time),
        summaryText: `从 ${formatTimestamp(currentTime)} 到 ${formatTimestamp(marker.time)}`,
      });
      currentTime = marker.time;
    }

    // Next boundary
    const nextTime = i < markers.length - 1 ? markers[i + 1].time : totalDuration;
    if (nextTime > currentTime) {
      chapters.push({
        id: `chap_${marker.id || chapters.length + 1}`,
        index: chapters.length + 1,
        name: marker.label || `分段 ${chapters.length + 1}`,
        startTime: currentTime,
        endTime: nextTime,
        duration: Number((nextTime - currentTime).toFixed(2)),
        markerId: marker.id,
        skipAnimations: false,
        actionCount: countActionsInWindow(project, currentTime, nextTime),
        summaryText: `标记分段: ${marker.label}`,
      });
      currentTime = nextTime;
    }
  }

  // If there's remaining time after last marker
  if (currentTime < totalDuration) {
    chapters.push({
      id: `chap_${chapters.length + 1}`,
      index: chapters.length + 1,
      name: '尾声总结 (Epilogue)',
      startTime: currentTime,
      endTime: totalDuration,
      duration: Number((totalDuration - currentTime).toFixed(2)),
      skipAnimations: false,
      actionCount: countActionsInWindow(project, currentTime, totalDuration),
      summaryText: `从 ${formatTimestamp(currentTime)} 到 ${formatTimestamp(totalDuration)}`,
    });
  }

  return chapters;
}

function countActionsInWindow(project: Project, start: number, end: number): number {
  return project.actions.filter((a) => {
    const actStart = typeof a.fields?.startTime === 'number' ? a.fields.startTime : 0;
    return actStart >= start && actStart < end;
  }).length;
}

/** Exports YouTube and video platform chapter text (e.g. 00:00 Intro...) */
export function exportYouTubeChapters(chapters: StoryboardChapter[]): string {
  return chapters
    .map((c) => `${formatTimestamp(c.startTime)} ${c.name}`)
    .join('\n');
}

/** Generates Manim CE Python code structured with self.next_section() */
export function generateManimSectionPythonCode(
  chapters: StoryboardChapter[],
  _project?: Project,
): string {
  const sectionsCode = chapters
    .map((c, i) => {
      const skipParam = c.skipAnimations ? ', skip_animations=True' : '';
      return `        # --- Chapter ${i + 1}: ${c.name} (${formatTimestamp(c.startTime)} - ${formatTimestamp(c.endTime)}) ---
        self.next_section(name="${c.name}"${skipParam})
        # Actions in this section: ${c.actionCount}
        self.wait(1.5)
`;
    })
    .join('\n');

  return `# Auto-generated by AnyVis - Multi-Section Storyboard & Chapters
from manim import *

class MultiSectionScene(Scene):
    def construct(self):
${sectionsCode}
`;
}

/** Updates project scene markers from edited storyboard chapters */
export function updateProjectChapters(
  project: Project,
  chapters: StoryboardChapter[],
): Project {
  // Markers correspond to chapter boundary start times (excluding 0)
  const nextMarkers: TimelineMarker[] = chapters
    .filter((c) => c.startTime > 0)
    .map((c, idx) => ({
      id: c.markerId || `m_sec_${idx}_${Date.now()}`,
      time: c.startTime,
      label: c.name,
      color: '#38bdf8',
    }));

  return {
    ...project,
    scene: {
      ...project.scene,
      markers: nextMarkers,
    },
  };
}
