// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionInspector } from './ActionInspector';
import { appendAction, duplicateAction } from './authoring';
import { renameProjectObject } from './blocks/rename';
import { createAction } from './core/catalog';
import { compileProject } from './core/compiler';
import { createEmptyProject, validateProject } from './core/project';

describe('Round 10 fixes: tracker naming, integer field guards, and object-list/lambda rename', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('appendAction uses underscore suffixes for duplicate trackers and enforces 31/100 char limits', () => {
    let project = createEmptyProject();
    const t1 = appendAction(project, 'tracker');
    project = t1.project;
    const t2 = appendAction(project, 'tracker');
    project = t2.project;
    const t3 = appendAction(project, 'tracker');
    project = t3.project;

    expect(t1.action.fields.name).toBe('a');
    expect(t2.action.fields.name).toBe('a_2');
    expect(t3.action.fields.name).toBe('a_3');
    expect(() => validateProject(project)).not.toThrow();
    expect(compileProject(project).diagnostics).toEqual([]);

    const longTrackerName = 'v'.repeat(31);
    const lt1 = appendAction(project, 'tracker', { name: longTrackerName });
    project = lt1.project;
    const lt2 = appendAction(project, 'tracker', { name: longTrackerName });
    project = lt2.project;

    expect(String(lt1.action.fields.name)).toBe(longTrackerName);
    expect(String(lt2.action.fields.name)).toBe(`${'v'.repeat(29)}_2`);
    expect(String(lt2.action.fields.name).length).toBeLessThanOrEqual(31);
    expect(compileProject(project).diagnostics).toEqual([]);

    const longShapeName = '圆'.repeat(100);
    const s1 = appendAction(project, 'circle', { name: longShapeName });
    project = s1.project;
    const s2 = appendAction(project, 'circle', { name: longShapeName });
    project = s2.project;

    expect(String(s2.action.fields.name).length).toBeLessThanOrEqual(100);
    expect(String(s2.action.fields.name)).toBe(`${'圆'.repeat(98)} 2`);

    const dup = duplicateAction(project, t2.action.id);
    expect(dup.action.fields.name).toBe('a_4');
    expect(compileProject(dup.project).diagnostics).toEqual([]);
  });

  it('ActionInspector rejects fractional drafts on step=1 fields and keeps Alt+Arrow / Alt+scrub integer', async () => {
    const repeatAction = createAction('repeat', { count: 3 });
    const onChange = vi.fn();
    const onError = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ActionInspector, {
          action: repeatAction,
          actions: [repeatAction],
          fields: ['count'],
          onChange,
          onError,
        }),
      );
    });

    const input = container.querySelector<HTMLInputElement>('.ai-fields-input')!;
    const scrubHandle = container.querySelector<HTMLElement>('.ai-fields-scrub-handle')!;
    expect(input.value).toBe('3');

    // Manual fractional input is rejected on blur and reset to previous value
    await act(async () => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '2.5');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.blur();
    });

    expect(onError).toHaveBeenCalledWith('重复须为整数');
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('3');

    // Alt + ArrowUp keeps integer step (+1) rather than fractional 0.1
    onError.mockClear();
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({ count: 4 });
    expect(input.value).toBe('4');

    // Shift + ArrowUp steps by 10
    onChange.mockClear();
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({ count: 14 });
    expect(input.value).toBe('14');

    // Alt + pointer scrub still produces integer ticks
    onChange.mockClear();
    await act(async () => {
      scrubHandle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 108, altKey: true }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 108, altKey: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ count: 16 });
  });

  it('ActionInspector preserves fine Alt+Arrow stepping on non-integer numeric fields', async () => {
    const circleAction = createAction('circle', { name: '圆', radius: 1 });
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ActionInspector, {
          action: circleAction,
          actions: [circleAction],
          fields: ['radius'],
          onChange,
        }),
      );
    });

    const input = container.querySelector<HTMLInputElement>('.ai-fields-input')!;
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({ radius: 1.01 });
  });

  it('renameProjectObject splits object-list strictly on English commas and tolerates malformed $lambda params', () => {
    const plain = createAction('circle', { name: '圆' });
    const legacyComma = createAction('circle', { name: '圆，带逗号' });
    const group = createAction('group', { name: '编组', members: '圆，带逗号, 圆' });
    const apiWithBadLambda = createAction('api_value', {
      name: '表达式',
      value: JSON.stringify({
        $lambda: {
          body: { $ref: '圆' },
        },
      }),
    });

    const baseProject = {
      ...createEmptyProject(),
      actions: [plain, legacyComma, group, apiWithBadLambda],
    };

    const renamedPlain = renameProjectObject(baseProject, plain.id, '大圆');
    expect(renamedPlain.actions[2].fields.members).toBe('圆，带逗号, 大圆');
    expect(JSON.parse(String(renamedPlain.actions[3].fields.value))).toEqual({
      $lambda: {
        body: { $ref: '大圆' },
      },
    });

    const renamedLegacy = renameProjectObject(renamedPlain, legacyComma.id, '新逗号圆');
    expect(renamedLegacy.actions[2].fields.members).toBe('新逗号圆, 大圆');
  });
});
