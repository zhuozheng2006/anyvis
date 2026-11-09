// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import { createEmptyProject } from './core/project';
import { SurfacePlaygroundModal } from './SurfacePlaygroundModal';
import { ProbabilityPlaygroundModal } from './ProbabilityPlaygroundModal';
import { PolarParametricModal } from './PolarParametricModal';
import { ComplexMappingModal } from './ComplexMappingModal';
import { VectorFieldPlaygroundModal } from './VectorFieldPlaygroundModal';
import { GeometryPlaygroundModal } from './GeometryPlaygroundModal';
import { GraphPlaygroundModal } from './GraphPlaygroundModal';
// @ts-expect-error React test environment marker
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
describe('workbench insertion errors', () => {
  for (const Component of [SurfacePlaygroundModal,ProbabilityPlaygroundModal,PolarParametricModal,ComplexMappingModal,VectorFieldPlaygroundModal,GeometryPlaygroundModal,GraphPlaygroundModal]) {
    it(`${Component.name} keeps the dialog open and shows production validation errors`, async () => {
      const container = document.createElement('div');document.body.append(container);
      const root = createRoot(container), onApply = vi.fn(), onClose = vi.fn();
      const project = createEmptyProject();project.scene.background = '#bad';
      try {
        await act(async () => root.render(React.createElement(Component, {isOpen:true,project,onApply,onClose})));
        const button=container.querySelector<HTMLButtonElement>('button[class*="primary"]');expect(button).not.toBeNull();
        await act(async () => button!.click());
        expect(container.querySelector('[role="alert"]')?.textContent).toContain('背景颜色');
        expect(onApply).not.toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled();
      } finally { await act(async()=>root.unmount());container.remove(); }
    });
  }
});
