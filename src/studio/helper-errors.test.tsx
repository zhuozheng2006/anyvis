// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CameraDirectorModal } from './CameraDirectorModal';
import { SubtitleSyncModal } from './SubtitleSyncModal';
import { Vector3DPlaygroundModal } from './Vector3DPlaygroundModal';
import { createEmptyProject } from './core/project';
import { createAction } from './core/catalog';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
for (const [Component, selector, message] of [
  [CameraDirectorModal, '.camera-footer .btn-primary', '二维 Cairo'],
  [SubtitleSyncModal, '.subtitles-footer .btn-primary', '500'],
  [Vector3DPlaygroundModal, '.apply-button', '500'],
] as const) {
  it(`${Component.name} displays production validation errors without applying or closing`, async () => {
    const project = createEmptyProject();
    if (Component === CameraDirectorModal) project.scene.dimension = '3d';
    else project.actions = Array.from({ length: 500 }, () => createAction('wait', { duration: 0 }));
    const onApply = vi.fn(), onClose = vi.fn();
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<Component isOpen project={project} onApply={onApply} onClose={onClose} />));
      const button = host.querySelector<HTMLButtonElement>(selector);
      expect(button).not.toBeNull();
      await act(async () => button!.click());
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(message);
      expect(onApply).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    } finally {
      await act(async () => root.unmount()); host.remove();
    }
  });
}
