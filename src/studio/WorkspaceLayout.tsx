import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent } from 'react';

const KEY = 'anyvis.workspace-layout.v1';
const DEFAULT = { editor: 58, preview: 48 };
type Layout = typeof DEFAULT;
const clamp = (value: number) => Math.max(32, Math.min(72, value));
function readLayout(): Layout {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Number.isFinite(saved.editor) && Number.isFinite(saved.preview)) {
      return { editor: clamp(saved.editor), preview: clamp(saved.preview) };
    }
  } catch { /* Storage may be unavailable; resizing still works. */ }
  return DEFAULT;
}

/** Keep layout state outside StudioApp so resizing does not rerender the editor. */
export function WorkspaceLayout({ editor, preview, inspector, status }: {
  editor: ReactNode; preview: ReactNode; inspector: ReactNode; status: ReactNode;
}) {
  const [layout, setLayout] = useState(readLayout);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch { /* Optional preference. */ }
  }, [layout]);
  const main = useRef<HTMLElement>(null);
  const side = useRef<HTMLElement>(null);
  const drag = useRef<{ axis: keyof Layout; start: number; value: number; size: number } | null>(null);
  const update = (axis: keyof Layout, value: number) => {
    setLayout(old => ({ ...old, [axis]: clamp(value) }));
  };
  const separator = (axis: keyof Layout) => {
    const horizontal = axis === 'editor';
    const label = horizontal ? '调整编辑区与预览区宽度' : '调整预览与对象面板高度';
    const move = (event: PointerEvent<HTMLDivElement>) => {
      const active = drag.current;
      if (!active || active.axis !== axis) return;
      const position = horizontal ? event.clientX : event.clientY;
      update(axis, active.value + (position - active.start) / active.size * 100);
    };
    return <div className={`workspace-split ${horizontal ? 'split-columns' : 'split-rows'}`}
      role="separator" tabIndex={0} aria-label={label} aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-valuemin={32} aria-valuemax={72} aria-valuenow={Math.round(layout[axis])}
      title={`${label} · 拖动或方向键调整，双击恢复默认`}
      onPointerDown={event => {
        if (event.button !== 0) return;
        const rect = (horizontal ? main : side).current?.getBoundingClientRect();
        const size = horizontal ? rect?.width : rect?.height;
        if (!size) return;
        drag.current = { axis, start: horizontal ? event.clientX : event.clientY, value: layout[axis], size };
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Ignore synthetic events. */ }
        event.currentTarget.focus();
        event.preventDefault();
      }} onPointerMove={move} onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={() => update(axis, DEFAULT[axis])}
      onKeyDown={event => {
        const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
        const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
        if (![decrease, increase, 'Home', 'End', 'Enter'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        update(axis, event.key === 'Home' ? 32 : event.key === 'End' ? 72 : event.key === 'Enter' ? DEFAULT[axis] : layout[axis] + (event.key === increase ? 2 : -2));
      }}><span /></div>;
  };
  return <main ref={main} className="studio-main resizable-workspace" style={{
    '--editor-size': `${layout.editor}fr`, '--sidebar-size': `${100 - layout.editor}fr`,
    '--preview-size': `${layout.preview}fr`, '--inspector-size': `${100 - layout.preview}fr`,
  } as CSSProperties}>
    {editor}{separator('editor')}
    <aside ref={side} className="stage-column">{preview}{separator('preview')}{inspector}{status}</aside>
  </main>;
}
