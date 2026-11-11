import { useLayoutEffect, useRef, type ReactNode } from 'react';

const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [contenteditable="true"], [tabindex]';

function focusable(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(CONTROLS)).filter(element => {
    if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[hidden], [inert]')) return false;
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector(':scope > summary')?.contains(element)) return false;
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (parent === dialog) break;
    }
    return true;
  });
}

/** Object picker and inspector share a predictable keyboard entry and exit. */
export function ObjectDialog({ className, label, onClose, children }: {
  className: string;
  label: string;
  onClose(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current!;
    const controls = focusable(dialog);
    (controls.find(element => element.hasAttribute('data-dialog-initial-focus')) || controls[0] || dialog).focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  return <div ref={ref} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
    onClick={event => event.stopPropagation()}
    onKeyDown={event => {
      // A nested parameter editor owns its own Escape and Tab handling.
      if (event.defaultPrevented || event.nativeEvent.isComposing || (event.target as HTMLElement).closest('[role="dialog"]') !== ref.current) return;
      // Keep editor navigation shortcuts from acting behind the modal.
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); onClose();
      } else if (event.key === 'Tab') {
        const controls = focusable(ref.current!);
        const index = controls.indexOf(document.activeElement as HTMLElement);
        if (!controls.length || index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
          event.preventDefault();
          (controls[event.shiftKey ? controls.length - 1 : 0] || ref.current)?.focus();
        }
      }
    }}>{children}</div>;
}
