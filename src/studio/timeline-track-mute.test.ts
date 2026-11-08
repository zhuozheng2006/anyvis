// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Timeline } from './Timeline';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';
import type { Project } from './core/types';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// @ts-expect-error jsdom stub
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('Timeline track mute button', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders mute button for audio tracks and toggles muted field when clicked', async () => {
    const audioAction = createAction('audio_play', {
      name: '讲解配音',
      muted: 'no',
      length: 5,
    });

    const project: Project = {
      ...createEmptyProject(),
      actions: [audioAction],
    };
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(Timeline, {
          project,
          selectedId: null,
          time: 0,
          onChange,
          onSelect: vi.fn(),
          onShowBlocks: vi.fn(),
          onSeek: vi.fn(),
          onError: vi.fn(),
        })
      );
    });

    const muteBtn = container.querySelector('.tl-track-mute-btn') as HTMLButtonElement;
    expect(muteBtn).toBeTruthy();
    expect(muteBtn.getAttribute('aria-label')).toContain('静音 讲解配音');

    await act(async () => {
      muteBtn.click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0][0] as Project;
    expect(updated.actions[0].fields.muted).toBe('yes');
  });
});
