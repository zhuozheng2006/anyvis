import React from 'react';
import type { Action, Project } from './core/types';
import { RESERVED_SYMBOLS } from './core/expression';
import { appendAction, flattenActions, objectDependents, removeAction, updateAction } from './authoring';
import { capturePointerSafe, releasePointerSafe } from './modal-hooks';
import { isComposingShortcut } from './studio-shortcuts';
import './tracker-control-bar.css';

export interface TrackerSummary {
  action: Action;
  name: string;
  value: number;
  animationCount: number;
  latestTargetValue: number | null;
}

const PREFERRED_NAMES = ['a', 'b', 'k', 't', 'm', 'n', 'r', 'w'];

export function extractTrackers(actions: Action[]): TrackerSummary[] {
  const flat = flattenActions(actions);
  const trackers = flat.filter(a => a.type === 'tracker');
  return trackers.map(tracker => {
    const name = String(tracker.fields.name || 'a');
    const rawValue = Number(tracker.fields.value);
    const value = Number.isFinite(rawValue) ? rawValue : 0;
    const anims = flat.filter(
      a => a.type === 'animate_value' && String(a.fields.target || '') === name
    );
    const lastAnim = anims.length > 0 ? anims[anims.length - 1] : null;
    const latestTargetValue =
      lastAnim && Number.isFinite(Number(lastAnim.fields.value))
        ? Number(lastAnim.fields.value)
        : null;
    return {
      action: tracker,
      name,
      value,
      animationCount: anims.length,
      latestTargetValue,
    };
  });
}

export function suggestNextTrackerName(actions: Action[]): string {
  const used = new Set(
    flattenActions(actions)
      .map(a => String(a.fields.name || '').trim())
      .filter(Boolean)
  );
  for (const candidate of PREFERRED_NAMES) {
    if (!used.has(candidate) && !RESERVED_SYMBOLS.has(candidate)) return candidate;
  }
  let idx = 1;
  while (used.has(`k_${idx}`)) idx += 1;
  return `k_${idx}`;
}

export function sliderBoundsForValue(value: number): { min: number; max: number; step: number } {
  const abs = Math.abs(value);
  if (abs <= 10) {
    return { min: -10, max: 10, step: 0.1 };
  }
  const bound = Math.ceil(abs / 10) * 10;
  return { min: -bound, max: bound, step: 0.5 };
}

function TrackerValueControl({ name, value, onCommit, onError }: {
  name: string;
  value: number;
  onCommit(value: number): void;
  onError(message: string): void;
}) {
  const [text, setText] = React.useState(String(value));
  const textRef = React.useRef(text);
  const textInput = React.useRef<HTMLInputElement>(null);
  const [sliding, setSliding] = React.useState<number | null>(null);
  const drag = React.useRef<{ pointerId: number; value: number; expectedValue?: number; cancelled?: boolean; bounds: ReturnType<typeof sliderBoundsForValue> } | null>(null);
  const setDraft = (next: string) => { textRef.current = next; setText(next); };
  React.useEffect(() => {
    const active = drag.current;
    // Focusing the slider confirms its adjacent text field first. That commit
    // starts this gesture at the new value; an unrelated update cancels it.
    if (active && !active.cancelled && active.expectedValue === value) {
      active.expectedValue = undefined;
      return;
    }
    // An undo/external update wins over an unfinished gesture. Keep its pointer
    // identity until release so later input events cannot become new edits.
    if (drag.current) drag.current.cancelled = true;
    setSliding(null); textRef.current = String(value); setText(String(value));
  }, [value]);
  const parseDraft = () => textRef.current.trim() && Number.isFinite(Number(textRef.current)) ? Number(textRef.current) : null;
  const commitText = () => {
    const next = parseDraft();
    if (next === null) { setDraft(String(value)); onError(`参数 ${name} 需要一个有限数值。`); return; }
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  const finishDrag = (event: React.PointerEvent<HTMLInputElement>, cancelled: boolean) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null; setSliding(null);
    releasePointerSafe(event.currentTarget, event.pointerId);
    if (cancelled || active.cancelled) setDraft(String(value));
    else if (active.value !== value) onCommit(active.value);
  };
  const bounds = drag.current && !drag.current.cancelled ? drag.current.bounds : sliderBoundsForValue(value);
  return <>
    <input type="range" className="tcb-slider" aria-label={`参数 ${name} 初值滑块`}
      title="松开滑块后更新；方向键可微调" min={bounds.min} max={bounds.max} step={bounds.step} value={sliding ?? value}
      onClick={event => event.stopPropagation()}
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return;
        const start = document.activeElement === textInput.current ? (parseDraft() ?? value) : value;
        event.currentTarget.focus();
        drag.current = { pointerId: event.pointerId, value: start, expectedValue: start !== value ? start : undefined, bounds: sliderBoundsForValue(start) };
        setSliding(start); capturePointerSafe(event.currentTarget, event.pointerId);
      }}
      onChange={event => {
        if (drag.current?.cancelled) return;
        const next = Number(event.target.value); setDraft(String(next));
        if (drag.current) { drag.current.value = next; setSliding(next); }
        else if (next !== value) onCommit(next);
      }}
      onPointerUp={event => finishDrag(event, false)}
      onPointerCancel={event => finishDrag(event, true)}
      onLostPointerCapture={event => finishDrag(event, true)}
      onBlur={() => {
        const active = drag.current;
        if (!active) return;
        active.cancelled = true; setSliding(null); setDraft(String(value));
      }}
    />
    <input ref={textInput} type="text" inputMode="decimal" className="tcb-num-input" aria-label={`参数 ${name} 初值输入`}
      title="回车或离开输入框后确认，Esc 取消，方向键微调" value={text}
      onClick={event => event.stopPropagation()} onChange={event => setDraft(event.target.value)} onBlur={commitText}
      onKeyDown={event => {
        if (isComposingShortcut(event.nativeEvent)) return;
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); setDraft(String(value)); event.currentTarget.blur();
        } else if (event.key === 'Enter') {
          event.preventDefault(); event.currentTarget.blur();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          const step = event.shiftKey ? 1 : event.altKey ? 0.01 : 0.1;
          const next = (parseDraft() ?? value) + (event.key === 'ArrowUp' ? step : -step);
          if (Number.isFinite(next)) setDraft(String(Number(next.toFixed(10))));
        }
      }}
    />
  </>;
}

export interface TrackerControlBarProps {
  project: Project;
  selectedId: string | null;
  onSelect(id: string): void;
  onChange(project: Project): void;
  onError(message: string): void;
}

export const TrackerControlBar: React.FC<TrackerControlBarProps> = ({
  project,
  selectedId,
  onSelect,
  onChange,
  onError,
}) => {
  const trackers = React.useMemo(() => extractTrackers(project.actions), [project.actions]);

  const handleAddTracker = () => {
    try {
      const nextName = suggestNextTrackerName(project.actions);
      const result = appendAction(project, 'tracker', { name: nextName, value: 1 });
      onChange(result.project);
      onSelect(result.action.id);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : '声明动态参数失败');
    }
  };

  const handleValueChange = (trackerId: string, nextValue: number) => {
    if (!Number.isFinite(nextValue)) return;
    try {
      const next = updateAction(project, trackerId, { value: nextValue });
      onChange(next);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : '更新参数初值失败');
    }
  };

  const handleAnimateTracker = (summary: TrackerSummary) => {
    try {
      const baseVal = summary.latestTargetValue ?? summary.value;
      const nextTarget = baseVal === 0 ? 3 : Number((-baseVal).toFixed(2));
      const result = appendAction(project, 'animate_value', {
        target: summary.name,
        value: nextTarget,
        duration: 1.5,
        easing: 'smooth',
      });
      onChange(result.project);
      onSelect(result.action.id);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : `为参数 ${summary.name} 添加动画失败`);
    }
  };

  const handleDeleteTracker = (summary: TrackerSummary) => {
    const dependents = objectDependents(project, summary.action.id);
    if (dependents.length > 0) {
      onError(`参数 ${summary.name} 仍被 ${dependents.length} 个积木或表达式引用，请先修改或移除这些动作。`);
      return;
    }
    try {
      const next = removeAction(project, summary.action.id);
      onChange(next);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : `删除参数 ${summary.name} 失败`);
    }
  };

  return (
    <div className="tcb-container" role="region" aria-label="动态参数滑块台">
      <div className="tcb-header">
        <span className="tcb-title" title="声明可随时间平滑变化的数学参数（ValueTracker），可在函数、动点与切线表达式中直接引用">
          🎚️ 动态参数 (ValueTracker) · {trackers.length}
        </span>
        <button
          type="button"
          className="tcb-add-btn"
          onClick={handleAddTracker}
          aria-label="声明新动态参数"
          title="新增一个可在表达式中引用的 ValueTracker 动态参数"
        >
          + 声明参数
        </button>
      </div>

      {trackers.length > 0 && (
        <div className="tcb-list">
          {trackers.map(item => {
            const isSelected = selectedId === item.action.id;
            return (
              <div
                key={`${project.id}:${item.action.id}`}
                className={`tcb-item ${isSelected ? 'tcb-item-selected' : ''}`}
                onClick={() => onSelect(item.action.id)}
              >
                <span className="tcb-name" title={`参数名：${item.name}`}>
                  {item.name} =
                </span>
                <TrackerValueControl name={item.name} value={item.value}
                  onCommit={next => handleValueChange(item.action.id, next)} onError={onError} />
                <button
                  type="button"
                  className="tcb-anim-btn"
                  onClick={e => {
                    e.stopPropagation();
                    handleAnimateTracker(item);
                  }}
                  aria-label={`为参数 ${item.name} 添加动画`}
                  title={
                    item.animationCount > 0
                      ? `已有 ${item.animationCount} 段参数动画，点击继续添加“改变参数”动画`
                      : `一键添加让参数 ${item.name} 随时间变化的动画`
                  }
                >
                  ⚡ 动画{item.animationCount > 0 ? ` (${item.animationCount})` : ''}
                </button>
                <button
                  type="button"
                  className="tcb-del-btn"
                  onClick={e => {
                    e.stopPropagation();
                    handleDeleteTracker(item);
                  }}
                  aria-label={`删除参数 ${item.name}`}
                  title={`删除参数 ${item.name}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
