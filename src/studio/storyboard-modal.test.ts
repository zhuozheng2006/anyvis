// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { StoryboardModal } from './StoryboardModal';
import type { Project } from './core/types';
import { createAction } from './core/catalog';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dummyProject: Project = {
  schemaVersion: 2,
  id: 'proj_sb_test',
  name: 'Storyboard Test',
  scene: {
    dimension: '2d',
    background: '#000000',
    width: 1920,
    height: 1080,
    fps: 60,
    markers: [
      { id: 'm1', time: 4, label: '概念阐述', color: '#38bdf8' },
    ],
  },
  actions: [
    createAction('text', { name: 'intro', duration: 4 }),
    createAction('text', { name: 'explanation', duration: 3 }),
  ],
};

describe('StoryboardModal', () => {
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

  it('does not render when closed', async () => {
    await act(async () => {
      root.render(
        React.createElement(StoryboardModal, {
          isOpen: false,
          onClose: () => {},
          project: dummyProject,
          onApply: () => {},
        }),
      );
    });
    expect(container.querySelector('.storyboard-overlay')).toBeNull();
  });

  it('renders modal with chapter cards and triggers sync', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(StoryboardModal, {
          isOpen: true,
          onClose,
          project: dummyProject,
          onApply,
        }),
      );
    });

    const overlay = container.querySelector('.storyboard-overlay');
    expect(overlay).not.toBeNull();

    // Check header
    expect(container.textContent).toContain('分镜剧本与多章节大纲');

    // Check stats
    expect(container.textContent).toContain('章节分段数');
    expect(container.textContent).toContain('全片总时长');

    // Check chapter title from marker
    expect(container.textContent).toContain('概念阐述');

    // Trigger save and sync
    const syncBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('保存并同步到时间轴标记'),
    );
    expect(syncBtn).toBeDefined();

    await act(async () => {
      syncBtn?.click();
    });

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
