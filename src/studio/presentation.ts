import type { Project } from './core/types';
import { timelineClips } from './authoring';

export interface PresentationStep {
  index: number;
  label: string;
  startTime: number;
  pauseTime: number;
  actionId?: string;
  actionType?: string;
}

/**
 * Extracts presentation steps / slide checkpoints from a project.
 * If wait blocks are present, steps pause at the start of each wait checkpoint,
 * allowing a speaker to talk through each finished animation segment.
 * If no wait blocks are present, steps are formed from sequential top-level actions.
 */
export function computePresentationSteps(project: Project): PresentationStep[] {
  const clips = timelineClips(project.actions);
  const visualClips = clips.filter(c => c.track !== 'audio' && c.start !== null && c.duration !== null);

  if (visualClips.length === 0) {
    return [{
      index: 0,
      label: project.name || '演示开始',
      startTime: 0,
      pauseTime: 0,
    }];
  }

  const waitClips = visualClips.filter(c => c.action.type === 'wait');
  const steps: PresentationStep[] = [];

  if (waitClips.length > 0) {
    // Mode A: Driven by wait checkpoints
    let stepStart = 0;
    let stepIndex = 0;

    for (const wait of waitClips) {
      const pauseTime = wait.start!;
      // Find the primary action that completed right before this wait
      const completedBefore = visualClips.filter(c => c.action.type !== 'wait' && (c.start! + c.duration!) <= pauseTime + 1e-4);
      const lastAction = completedBefore[completedBefore.length - 1]?.action;
      const title = lastAction
        ? (String(lastAction.fields.name || lastAction.fields.text || lastAction.type))
        : `步骤 ${stepIndex + 1}`;

      steps.push({
        index: stepIndex++,
        label: title,
        startTime: stepStart,
        pauseTime: Math.max(stepStart, pauseTime),
        actionId: lastAction?.id,
        actionType: lastAction?.type,
      });

      // Next step begins after this wait concludes
      stepStart = wait.start! + wait.duration!;
    }

    // Check if there are visual actions after the last wait
    const lastWaitEnd = waitClips[waitClips.length - 1].start! + waitClips[waitClips.length - 1].duration!;
    const remainingActions = visualClips.filter(c => c.action.type !== 'wait' && c.start! >= lastWaitEnd - 1e-4);

    if (remainingActions.length > 0) {
      const lastAction = remainingActions[remainingActions.length - 1];
      const finalEndTime = lastAction.start! + lastAction.duration!;
      steps.push({
        index: stepIndex,
        label: String(lastAction.action.fields.name || lastAction.action.fields.text || '结语'),
        startTime: stepStart,
        pauseTime: finalEndTime,
        actionId: lastAction.action.id,
        actionType: lastAction.action.type,
      });
    }
  } else {
    // Mode B: Driven by top-level visual actions
    let stepIndex = 0;
    for (const clip of visualClips) {
      if ((clip.duration || 0) <= 0.05 && visualClips.length > 1) {
        continue; // skip instant setup steps if others exist
      }
      const title = String(clip.action.fields.name || clip.action.fields.text || clip.action.type);
      steps.push({
        index: stepIndex++,
        label: title,
        startTime: clip.start!,
        pauseTime: clip.start! + clip.duration!,
        actionId: clip.action.id,
        actionType: clip.action.type,
      });
    }
  }

  if (steps.length === 0) {
    const totalDuration = visualClips.reduce((sum, c) => Math.max(sum, (c.start || 0) + (c.duration || 0)), 0);
    return [{
      index: 0,
      label: project.name || '演示',
      startTime: 0,
      pauseTime: totalDuration,
    }];
  }

  return steps;
}

/**
 * Finds the active step index corresponding to a video playback timestamp.
 */
export function findStepIndexAtTime(steps: PresentationStep[], time: number): number {
  if (steps.length === 0) return 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (time >= steps[i].startTime - 1e-4) {
      return i;
    }
  }
  return 0;
}
