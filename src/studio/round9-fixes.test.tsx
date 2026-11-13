// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from './core/project';
import { createAction } from './core/catalog';
import { createSubtitleActions, parseSrtTime } from './subtitles';
import { buildStoryboard, updateProjectChapters } from './storyboard';
import { StoryboardModal } from './StoryboardModal';
import { committedClipRange } from './timeline-model';
import { snapTimeToMarkers } from './TimelineMarkerBar';
import { MusicSettings } from './MusicSettings';
import { AssetShelf } from './AssetShelf';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function renderIntoHost(element: React.ReactElement, fn: (host: HTMLDivElement) => Promise<void> | void) {
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(element);
    });
    await fn(host);
  } finally {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  }
}

describe('Round 9 fixes', () => {
  it('parses SRT/VTT timestamps with variable fractional digits, 2-segment MM:SS, and trailing cue settings', () => {
    expect(parseSrtTime('00:00:01,5')).toBeCloseTo(1.5, 6);
    expect(parseSrtTime('00:00:01.25')).toBeCloseTo(1.25, 6);
    expect(parseSrtTime('00:00:00,050')).toBeCloseTo(0.05, 6);
    expect(parseSrtTime('01:23.450')).toBeCloseTo(83.45, 6);
    expect(parseSrtTime('00:00:03,200 align:start position:0%')).toBeCloseTo(3.2, 6);
    expect(parseSrtTime('invalid')).toBe(0);
  });

  it('avoids emitting degenerate sub-microsecond waits from floating-point residuals in createSubtitleActions', () => {
    const project = createEmptyProject();
    const { project: next } = createSubtitleActions(
      project,
      [
        { id: 's1', startTime: 0.1, endTime: 0.3, text: 'First', color: '#ffffff', fontSize: 28, position: 'bottom' },
        { id: 's2', startTime: 0.1 + 0.2, endTime: 0.6, text: 'Second', color: '#ffffff', fontSize: 28, position: 'bottom' },
      ],
    );
    const tinyWaits = next.actions.filter(a => a.type === 'wait' && Number(a.fields.duration) < 1e-5);
    expect(tinyWaits).toEqual([]);
  });

  it('preserves existing timeline marker colors when updating storyboard chapters via helper and StoryboardModal', async () => {
    const project = createEmptyProject();
    project.actions = [createAction('circle'), createAction('wait', { duration: 10 })];
    project.scene.markers = [
      { id: 'm_amber', time: 4.0, label: '重点推导', color: '#fbbf24' },
      { id: 'm_emerald', time: 8.0, label: '几何结论', color: '#10b981' },
    ];

    const chapters = buildStoryboard(project);
    const renamed = chapters.map(ch => (ch.markerId === 'm_amber' ? { ...ch, name: '核心公式' } : ch));
    renamed.push({ id: 'ch_new', index: renamed.length, name: '新加章节', startTime: 6.0, endTime: 8.0, duration: 2.0, skipAnimations: false, actionCount: 0, summaryText: '' });

    const updated = updateProjectChapters(project, renamed);
    expect(updated.scene.markers?.find(m => m.id === 'm_amber')).toMatchObject({ label: '核心公式', color: '#fbbf24' });
    expect(updated.scene.markers?.find(m => m.id === 'm_emerald')).toMatchObject({ label: '几何结论', color: '#10b981' });
    expect(updated.scene.markers?.find(m => m.label === '新加章节')?.color).toBe('#38bdf8');

    const onApply = vi.fn();
    await renderIntoHost(
      <StoryboardModal isOpen onClose={vi.fn()} project={project} onApply={onApply} />,
      async host => {
        const inputs = host.querySelectorAll<HTMLInputElement>('input[value="重点推导"]');
        expect(inputs.length).toBe(1);
        await act(async () => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(inputs[0], '改名章节');
          inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        });
        const applyBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('保存并同步到时间轴标记'));
        expect(applyBtn).toBeDefined();
        await act(async () => {
          applyBtn!.click();
        });
      },
    );
    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0];
    expect(applied.scene.markers?.find((m: { id: string }) => m.id === 'm_amber')).toMatchObject({
      label: '改名章节',
      color: '#fbbf24',
    });
  });

  it('snaps only the active edge when moving or trimming clips via committedClipRange', () => {
    const markers = [
      { id: 'm1', time: 2.0, label: 'M1', color: '#fbbf24' },
      { id: 'm2', time: 5.0, label: 'M2', color: '#38bdf8' },
    ];
    const snap = (t: number) => snapTimeToMarkers(markers, t);

    // Move snaps start and preserves duration
    expect(committedClipRange(1.97, 3.97, 'move', snap)).toEqual({ start: 2.0, end: 4.0 });
    // Left trim snaps start and keeps right edge anchored
    expect(committedClipRange(1.97, 4.5, 'left', snap)).toEqual({ start: 2.0, end: 4.5 });
    // Right trim keeps start anchored (even if start is near m1) and snaps end to m2
    expect(committedClipRange(1.97, 4.98, 'right', snap)).toEqual({ start: 1.97, end: 5.0 });
  });

  it('guards non-finite musicGainDb values in MusicSettings', async () => {
    const project = createEmptyProject();
    project.scene.backgroundMusic = 'piano';
    project.scene.musicGainDb = Number.NaN;
    const onChange = vi.fn();

    await renderIntoHost(
      <MusicSettings project={project} onChange={onChange} onError={vi.fn()} />,
      async host => {
        expect(host.textContent).toContain('-18 dB');
        const range = host.querySelector('input[type="range"]') as HTMLInputElement;
        expect(range.value).toBe('-18');

        await act(async () => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(range, '-12');
          range.dispatchEvent(new Event('change', { bubbles: true }));
        });
      },
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].scene.musicGainDb).toBe(-12);
  });

  it('sanitizes image asset names when inserting from AssetShelf', async () => {
    const project = createEmptyProject();
    project.assets = [
      {
        id: 'a'.repeat(64),
        kind: 'image',
        name: '@@diagram,v1.png',
        extension: 'png',
        bytes: 128,
        width: 100,
        height: 100,
      },
    ];
    const onProjectChange = vi.fn();

    await renderIntoHost(
      <AssetShelf project={project} onProjectChange={onProjectChange} onError={vi.fn()} />,
      async host => {
        const insertBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('作为新对象添加'));
        expect(insertBtn).toBeDefined();
        await act(async () => {
          insertBtn!.click();
        });
      },
    );
    expect(onProjectChange).toHaveBeenCalledTimes(1);
    const updated = onProjectChange.mock.calls[0][0];
    expect(updated.actions.at(-1)?.type).toBe('image_asset');
    expect(updated.actions.at(-1)?.fields.name).toBe('diagram v1');
  });
});
