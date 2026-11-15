// @vitest-environment jsdom
import { act, useReducer } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackerControlBar } from './TrackerControlBar';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';
import { projectHistory } from './project-history';

// @ts-expect-error React test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('dynamic parameter editing transactions', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  function mount(value = 24) {
    const tracker = createAction('tracker', { name: 'a', value });
    const project = { ...createEmptyProject(), actions: [tracker] };
    const error = vi.fn();
    function Harness() {
      const [state, dispatch] = useReducer(projectHistory, { past: [], present: project, future: [] });
      return <><TrackerControlBar project={state.present} selectedId={tracker.id} onSelect={vi.fn()}
        onChange={next => dispatch({ type: 'edit', value: next })} onError={error} />
        <output data-testid="history">{state.past.length}</output>
        <button onClick={() => dispatch({ type: 'edit', value: { ...state.present, actions: [{ ...tracker, fields: { ...tracker.fields, value: 40 } }] } })}>外部更新参数</button>
        <button onClick={() => dispatch({ type: 'undo' })}>撤销参数修改</button></>;
    }
    act(() => root.render(<Harness />));
    return { slider: container.querySelector<HTMLInputElement>('[type="range"]')!, input: container.querySelector<HTMLInputElement>('.tcb-num-input')!, error };
  }
  const history = () => container.querySelector('output')!.textContent;
  function change(input: HTMLInputElement, value: string) {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  function pointer(input: Element, type: string) {
    const event = new MouseEvent(type, { bubbles: true, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    act(() => { input.dispatchEvent(event); });
  }
  function press(input: Element, key: string, extra: KeyboardEventInit = {}) {
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })); });
  }

  it('keeps slider bounds fixed while dragging and creates a single undo entry', () => {
    const { slider, input } = mount();
    pointer(slider, 'pointerdown'); change(slider, '18'); change(slider, '8'); change(slider, '6');
    expect(slider.max).toBe('30'); expect(input.value).toBe('6'); expect(history()).toBe('0');
    pointer(slider, 'pointerup');
    expect(history()).toBe('1'); expect(slider.max).toBe('10');
    act(() => Array.from(container.querySelectorAll('button')).find(b => b.textContent === '撤销参数修改')!.click());
    expect(slider.value).toBe('24'); expect(input.value).toBe('24');
  });

  it.each(['pointercancel', 'lostpointercapture'])('discards an interrupted drag on %s', event => {
    const { slider, input } = mount();
    pointer(slider, 'pointerdown'); change(slider, '7'); pointer(slider, event);
    expect(history()).toBe('0'); expect(slider.value).toBe('24'); expect(input.value).toBe('24');
  });

  it('does not overwrite an external update with the rest of an interrupted gesture', () => {
    const { slider, input } = mount();
    pointer(slider, 'pointerdown'); change(slider, '8');
    act(() => Array.from(container.querySelectorAll('button')).find(b => b.textContent === '外部更新参数')!.click());
    change(slider, '30'); change(slider, '20'); pointer(slider, 'pointerup');
    expect(history()).toBe('1'); expect(input.value).toBe('40'); expect(slider.value).toBe('40');
    pointer(slider, 'pointerdown'); change(slider, '10'); pointer(slider, 'pointerup');
    expect(history()).toBe('2'); expect(input.value).toBe('10');
  });

  it('allows incomplete negative input and commits once on Enter', () => {
    const { input } = mount(); input.focus();
    change(input, ''); change(input, '-'); change(input, '-2.5');
    expect(history()).toBe('0'); expect(input.value).toBe('-2.5');
    press(input, 'Enter');
    expect(history()).toBe('1'); expect(input.value).toBe('-2.5'); expect(document.activeElement).not.toBe(input);
  });

  it('confirms a text draft before dragging without breaking the new gesture', () => {
    const { slider, input } = mount(); input.focus(); change(input, '20');
    pointer(slider, 'pointerdown');
    expect(history()).toBe('1'); expect(document.activeElement).toBe(slider);
    change(slider, '15'); change(slider, '8');
    expect(history()).toBe('1'); expect(slider.max).toBe('20'); expect(input.value).toBe('8');
    pointer(slider, 'pointerup');
    expect(history()).toBe('2'); expect(input.value).toBe('8');
    act(() => Array.from(container.querySelectorAll('button')).find(b => b.textContent === '撤销参数修改')!.click());
    expect(input.value).toBe('20'); expect(slider.value).toBe('20');
  });

  it('rejects a blank or nonfinite edit without writing zero into the project', () => {
    const { input, error } = mount(); input.focus(); change(input, ''); act(() => input.blur());
    expect(input.value).toBe('24'); expect(history()).toBe('0'); expect(error).toHaveBeenCalledOnce();
    input.focus(); change(input, '1e999'); act(() => input.blur());
    expect(input.value).toBe('24'); expect(history()).toBe('0'); expect(error).toHaveBeenCalledTimes(2);
  });

  it('leaves IME confirmation alone and cancels a draft with Escape', () => {
    const { input, error } = mount(); input.focus(); change(input, '12');
    press(input, 'Enter', { isComposing: true }); press(input, 'Enter', { keyCode: 229 });
    expect(document.activeElement).toBe(input); expect(history()).toBe('0');
    press(input, 'Escape');
    expect(input.value).toBe('24'); expect(history()).toBe('0'); expect(error).not.toHaveBeenCalled();
  });

  it('preserves keyboard range changes and numeric arrow fine adjustment', () => {
    const { slider, input } = mount(1); change(slider, '1.1'); expect(history()).toBe('1');
    input.focus(); press(input, 'ArrowUp', { altKey: true });
    expect(input.value).toBe('1.11'); expect(history()).toBe('1');
    act(() => input.blur()); expect(history()).toBe('2');
  });
});
