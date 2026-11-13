import { useEffect, useState } from 'react';
import type { MediaAsset } from './core/types';

interface Peaks { values: number[]; duration: number }
const cache = new Map<string, Promise<Peaks | null>>();
export function envelope(channels: Float32Array[], buckets = 1024): number[] {
  const length = channels[0]?.length || 0;
  if (!length) return [];
  return Array.from({ length: Math.min(buckets, length) }, (_, bucket) => {
    const start = Math.floor(bucket * length / Math.min(buckets, length));
    const end = Math.floor((bucket + 1) * length / Math.min(buckets, length));
    let peak = 0;
    for (const channel of channels) for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(channel[i]));
    return Math.min(1, peak);
  });
}
function load(asset: MediaAsset): Promise<Peaks | null> {
  const existing = cache.get(asset.id); if (existing) return existing;
  // Bound decoded PCM. Long sources remain playable/editable without decoding
  // two hours of sound into browser memory just to draw a thumbnail.
  if ((asset.duration || 0) > 600 || typeof OfflineAudioContext === 'undefined') return Promise.resolve(null);
  const promise = (async () => {
    try {
      const response = await fetch(`/api/assets/${asset.id}/file`);
      if (!response.ok) return null;
      const context = new OfflineAudioContext(1, 1, 8000);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const result = { duration: buffer.duration, values: envelope(Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel))) };
      return result;
    } catch { return null; }
  })();
  cache.set(asset.id, promise);
  void promise.then(result => {
    if (!result && cache.get(asset.id) === promise) cache.delete(asset.id);
  });
  if (cache.size > 16) cache.delete(cache.keys().next().value!);
  return promise;
}
export function AudioWaveform({ asset, offset, duration }: { asset?: MediaAsset; offset: number; duration: number }) {
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  useEffect(() => {
    let current = true; setPeaks(null);
    if (asset) void load(asset).then(value => { if (current) setPeaks(value); });
    return () => { current = false; };
  }, [asset?.id]);
  if (!peaks?.values.length || peaks.duration <= 0) return null;
  const from = Math.floor(offset / peaks.duration * peaks.values.length), to = Math.ceil((offset + duration) / peaks.duration * peaks.values.length);
  const values = peaks.values.slice(Math.max(0, from), Math.min(peaks.values.length, to));
  if (!values.length) return null;
  return <svg className="tl-waveform" aria-label="配音波形" viewBox={`0 0 ${values.length} 24`} preserveAspectRatio="none"><path d={values.map((value, i) => `M${i} ${12 - value * 11}v${Math.max(.2, value * 22)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1"/></svg>;
}
