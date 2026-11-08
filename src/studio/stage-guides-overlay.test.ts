// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { StageGuidesOverlay } from './StageGuidesOverlay';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('StageGuidesOverlay', () => {
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

  it('renders nothing when all guide toggles are false', async () => {
    await act(async () => {
      root.render(
        React.createElement(StageGuidesOverlay, {
          showSafeArea: false,
          showRuleOfThirds: false,
          showOriginCrosshair: false,
        })
      );
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders Rule of Thirds grid when showRuleOfThirds is true', async () => {
    await act(async () => {
      root.render(
        React.createElement(StageGuidesOverlay, {
          showRuleOfThirds: true,
        })
      );
    });
    expect(container.querySelector('[data-testid="stage-guides-overlay"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="guide-rule-of-thirds"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="guide-safe-area"]')).toBeNull();
    expect(container.querySelector('[data-testid="guide-origin"]')).toBeNull();
  });

  it('renders Safe Area guides when showSafeArea is true', async () => {
    await act(async () => {
      root.render(
        React.createElement(StageGuidesOverlay, {
          showSafeArea: true,
        })
      );
    });
    expect(container.querySelector('[data-testid="stage-guides-overlay"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="guide-safe-area"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="guide-rule-of-thirds"]')).toBeNull();
  });

  it('renders Origin crosshair when showOriginCrosshair is true', async () => {
    await act(async () => {
      root.render(
        React.createElement(StageGuidesOverlay, {
          showOriginCrosshair: true,
        })
      );
    });
    expect(container.querySelector('[data-testid="stage-guides-overlay"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="guide-origin"]')).toBeTruthy();
  });

  it('renders all guides together when all flags are enabled', async () => {
    await act(async () => {
      root.render(
        React.createElement(StageGuidesOverlay, {
          showSafeArea: true,
          showRuleOfThirds: true,
          showOriginCrosshair: true,
        })
      );
    });
    expect(container.querySelector('[data-testid="stage-guides-overlay"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="guide-rule-of-thirds"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="guide-safe-area"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="guide-origin"]')).toBeTruthy();
  });
});
