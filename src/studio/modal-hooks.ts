import { useCallback, useEffect, useRef, useState } from 'react';

/** Closes open modal dialogs on Escape without interfering with IME composition. */
export function useDialogEscape(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
}

/** Boolean feedback flag that auto-resets after `durationMs` and clears on close/unmount. */
export function useTransientFlag(durationMs = 2000, active = true) {
  const [flag, setFlag] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clear();
    setFlag(false);
  }, [clear]);

  const trigger = useCallback(() => {
    clear();
    setFlag(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setFlag(false);
    }, durationMs);
  }, [clear, durationMs]);

  useEffect(() => {
    if (!active) reset();
  }, [active, reset]);

  useEffect(() => clear, [clear]);

  return [flag, trigger, reset] as const;
}

/** Runs a delayed completion callback once and cancels it if the host closes or unmounts. */
export function useDelayedAction(delayMs = 450, active = true) {
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPending(false);
  }, []);

  const schedule = useCallback(
    (callback: () => void, beforeSchedule?: () => void) => {
      if (timerRef.current !== null) return;
      beforeSchedule?.();
      setPending(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setPending(false);
        callback();
      }, delayMs);
    },
    [delayMs],
  );

  useEffect(() => {
    if (!active) reset();
  }, [active, reset]);

  useEffect(() => reset, [reset]);

  return [pending, schedule, reset] as const;
}

/** Captures a pointer safely without failing in synthetic event environments. */
export function capturePointerSafe(target: Element | null, pointerId: number): void {
  try {
    target?.setPointerCapture?.(pointerId);
  } catch {
    // Ignore unsupported or non-active pointer captures.
  }
}

/** Releases a pointer capture safely after drag end, cancel, or capture loss. */
export function releasePointerSafe(target: Element | null, pointerId: number): void {
  try {
    target?.releasePointerCapture?.(pointerId);
  } catch {
    // Ignore release errors after implicit capture loss.
  }
}
