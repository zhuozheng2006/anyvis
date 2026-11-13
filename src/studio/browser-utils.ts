import { useCallback, useEffect, useRef, useState } from 'react';

/** Converts a client pointer position into the SVG's viewBox coordinate space. */
export function clientToSvgPoint(
  svg: Pick<Element, 'getBoundingClientRect'> | null | undefined,
  clientX: number,
  clientY: number,
  viewWidth: number,
  viewHeight: number,
): { x: number; y: number } | null {
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * viewWidth,
    y: ((clientY - rect.top) / rect.height) * viewHeight,
  };
}

/** Copies text safely without throwing unhandled rejections when clipboard permissions are denied. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Bounded preview scrubber clock that stops cleanly at `maxTime` or when closed. */
export function useBoundedPlayback(isOpen: boolean, maxTime: number) {
  const safeMaxTime = Number.isFinite(maxTime) && maxTime > 0 ? maxTime : 1;
  const [playbackTime, setPlaybackTimeState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const timeRef = useRef(0);

  const setPlaybackTime = useCallback((next: number) => {
    const clamped = Number.isFinite(next) ? Math.max(0, Math.min(safeMaxTime, next)) : 0;
    timeRef.current = clamped;
    setPlaybackTimeState(clamped);
  }, [safeMaxTime]);

  useEffect(() => {
    if (timeRef.current > safeMaxTime) {
      timeRef.current = safeMaxTime;
      setPlaybackTimeState(safeMaxTime);
    }
  }, [safeMaxTime]);

  useEffect(() => {
    if (!isOpen) {
      setIsPlaying(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isPlaying) return;
    let frameId = 0;
    let lastStamp = performance.now();
    const loop = (stamp: number) => {
      const dt = (stamp - lastStamp) / 1000;
      lastStamp = stamp;
      const next = timeRef.current + dt;
      if (next >= safeMaxTime) {
        timeRef.current = 0;
        setPlaybackTimeState(0);
        setIsPlaying(false);
        return;
      }
      timeRef.current = next;
      setPlaybackTimeState(next);
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isOpen, isPlaying, safeMaxTime]);

  return { playbackTime, setPlaybackTime, isPlaying, setIsPlaying };
}
