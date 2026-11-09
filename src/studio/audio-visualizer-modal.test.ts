// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { AudioVisualizerModal } from './AudioVisualizerModal';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('AudioVisualizerModal', () => {
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
        React.createElement(AudioVisualizerModal, { isOpen: false, onClose: () => {} })
      );
    });
    expect(container.querySelector('.audio-vis-modal-backdrop')).toBeNull();
  });

  it('renders modal with title, presets and triggers insert', async () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(AudioVisualizerModal, {
          isOpen: true,
          onClose,
          onInsertAudioVisualizer: onInsert,
        })
      );
    });

    const backdrop = container.querySelector('.audio-vis-modal-backdrop');
    expect(backdrop).not.toBeNull();

    // Check title
    expect(container.textContent).toContain('合成频谱与波形预览');
    expect(container.textContent).toContain('3B1B 讲者声波 (Voice Bars)');

    // Trigger insert button
    const insertBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('插入暂不可用')
    );
    expect(insertBtn).toBeDefined();

    await act(async () => {
      insertBtn?.click();
    });

    expect(insertBtn?.disabled).toBe(true);
    expect(onInsert).not.toHaveBeenCalled();
    expect(container.textContent).toContain('尚未接入音频分析');
    expect(container.querySelector<HTMLButtonElement>('.audio-vis-btn-secondary')?.disabled).toBe(true);
  });
});
