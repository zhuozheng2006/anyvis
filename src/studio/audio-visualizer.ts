import type { Project } from './core/types';

export type VisualizerType = 'bars' | 'waveform' | 'radial' | 'oscilloscope';

export interface AudioVisualizerPreset {
  id: string;
  name: string;
  type: VisualizerType;
  barCount: number;
  width: number;
  height: number;
  primaryColor: string;
  secondaryColor: string;
  mirrored: boolean;
  position: 'bottom' | 'center' | 'top';
  description: string;
}

export const AUDIO_VISUALIZER_PRESETS: AudioVisualizerPreset[] = [
  {
    id: 'voice-bars',
    name: '3B1B 讲者声波 (Voice Bars)',
    type: 'bars',
    barCount: 32,
    width: 8.0,
    height: 1.8,
    primaryColor: '#e2b340',
    secondaryColor: '#58c4dd',
    mirrored: false,
    position: 'bottom',
    description: '3Blue1Brown 标志性金蓝渐变直方频谱，置于画面底部',
  },
  {
    id: 'neon-spectrum',
    name: '霓虹律动柱 (Neon Equalizer)',
    type: 'bars',
    barCount: 24,
    width: 7.2,
    height: 2.2,
    primaryColor: '#00ffff',
    secondaryColor: '#bb86fc',
    mirrored: true,
    position: 'bottom',
    description: '赛博朋克青紫双色镜像对称频段柱，动感十足',
  },
  {
    id: 'radial-orb',
    name: '环形星云声场 (Radial Orb)',
    type: 'radial',
    barCount: 36,
    width: 3.6,
    height: 3.6,
    primaryColor: '#58c4dd',
    secondaryColor: '#bb86fc',
    mirrored: false,
    position: 'center',
    description: '360° 环状向外扩散的圆盘声波光环',
  },
  {
    id: 'oscilloscope',
    name: '复古示波器 (Oscilloscope)',
    type: 'oscilloscope',
    barCount: 64,
    width: 8.5,
    height: 2.0,
    primaryColor: '#48bb78',
    secondaryColor: '#68d391',
    mirrored: false,
    position: 'center',
    description: '连续荧光绿平滑正弦声波曲线，极具实验室质感',
  },
  {
    id: 'minimal-bottom',
    name: '极简底栏药丸 (Minimal Bottom)',
    type: 'bars',
    barCount: 16,
    width: 4.8,
    height: 1.0,
    primaryColor: '#f1f5f9',
    secondaryColor: '#94a3b8',
    mirrored: false,
    position: 'bottom',
    description: '简约低调的圆角药丸频谱，不干扰画面公式呈现',
  },
];

/**
 * Simulates speech & musical frequency distribution at time t
 */
export function simulateAudioFrequencies(
  time: number,
  barCount: number,
  type: VisualizerType = 'bars'
): number[] {
  const bars: number[] = [];
  const beat = Math.sin(time * 3.14159 * 2);
  const speechCadence = 0.5 + 0.5 * Math.sin(time * 2.2);

  for (let i = 0; i < barCount; i++) {
    const fraction = i / (barCount - 1 || 1);

    // Fundamental low-frequency bass energy
    const bass = Math.exp(-fraction * 4.0) * (0.4 + 0.5 * Math.max(0, beat));

    // Mid-range speech formant bumps around fraction 0.25 - 0.55
    const formant1 = Math.exp(-Math.pow((fraction - 0.3) / 0.15, 2)) * 0.7 * speechCadence;
    const formant2 = Math.exp(-Math.pow((fraction - 0.5) / 0.18, 2)) * 0.5 * (0.6 + 0.4 * Math.cos(time * 4.0 + i));

    // Treble harmonics and subtle noise shimmer
    const treble = fraction * 0.3 * (0.4 + 0.6 * Math.sin(time * 8.0 + i * 2.1));

    // Composite amplitude
    let amp = bass + formant1 + formant2 + treble;

    // Add gentle organic variation
    amp += 0.08 * Math.sin(time * 5.0 + i * 0.7);

    // Oscilloscope wave variation
    if (type === 'oscilloscope') {
      const wave = 0.5 + 0.4 * Math.sin(time * 4.0 + fraction * 12.0) * Math.cos(fraction * 3.14159);
      bars.push(Math.max(0.05, Math.min(1.0, wave)));
      continue;
    }

    // Clamp into [0.04, 1.0]
    bars.push(Math.max(0.04, Math.min(1.0, amp)));
  }

  return bars;
}

/** No uploaded audio is analyzed yet; never insert a fabricated spectrum. */
export const AUDIO_VISUALIZER_LIMITATION = '当前仅为合成波形预览，尚未接入音频分析；暂不支持导出或插入。';
export function generateAudioVisualizerPythonCode(_preset: AudioVisualizerPreset): string {
  throw Error(AUDIO_VISUALIZER_LIMITATION);
}
export function createAudioVisualizerActions(_project: Project, _preset: AudioVisualizerPreset): { project: Project; actionIds: string[] } {
  throw Error(AUDIO_VISUALIZER_LIMITATION);
}
