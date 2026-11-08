import type { Project, Action } from './core/types';

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

/**
 * Generates standalone Python code for Manim CE audio-reactive visualizer scene
 */
export function generateAudioVisualizerPythonCode(preset: AudioVisualizerPreset): string {
  const isRadial = preset.type === 'radial';
  const isOscillo = preset.type === 'oscilloscope';

  if (isRadial) {
    return `from manim import *
import numpy as np

class AudioVisualizerScene(Scene):
    """
    360-degree Radial Audio Visualizer in Manim CE.
    Radiates outward in a circular ring, reactive to audio amplitude.
    """
    def construct(self):
        num_bars = ${preset.barCount}
        base_radius = 1.6
        max_height = ${preset.height}

        bars = VGroup(*[
            Line(
                start=np.array([np.cos(theta), np.sin(theta), 0]) * base_radius,
                end=np.array([np.cos(theta), np.sin(theta), 0]) * (base_radius + 0.2),
                stroke_width=4.5,
                color=interpolate_color(color_to_rgb("${preset.primaryColor}"), color_to_rgb("${preset.secondaryColor}"), i / num_bars),
            )
            for i, theta in enumerate(np.linspace(0, TAU, num_bars, endpoint=False))
        ])

        center_circle = Circle(radius=base_radius * 0.95, color="${preset.secondaryColor}", stroke_width=2, stroke_opacity=0.6)

        def update_bars(mob, dt):
            t = self.time
            for i, line in enumerate(mob):
                theta = i * TAU / num_bars
                unit_vec = np.array([np.cos(theta), np.sin(theta), 0])
                # Simulate audio frequency amplitude
                amp = 0.2 + 0.8 * (0.5 + 0.5 * np.sin(t * 3.5 + i * 0.4)) * np.exp(-((i / num_bars) - 0.3)**2 / 0.1)
                bar_len = base_radius + amp * max_height * 0.8
                line.put_start_and_end_on(unit_vec * base_radius, unit_vec * bar_len)

        bars.add_updater(update_bars)
        self.add(center_circle, bars)
        self.wait(5.0)
`;
  }

  if (isOscillo) {
    return `from manim import *
import numpy as np

class AudioVisualizerScene(Scene):
    """
    Continuous Oscilloscope Audio Waveform in Manim CE.
    """
    def construct(self):
        curve_width = ${preset.width}
        curve_height = ${preset.height}

        def get_wave():
            t = self.time
            pts = []
            steps = ${preset.barCount}
            for i in range(steps + 1):
                frac = i / steps
                x = (frac - 0.5) * curve_width
                y = 0.5 * curve_height * np.sin(t * 5.0 + frac * 10.0) * np.cos(frac * PI)
                pts.append(np.array([x, y, 0]))
            return VMobject(color="${preset.primaryColor}", stroke_width=3.5).set_points_smoothly(pts)

        wave = always_redraw(get_wave)
        self.add(wave)
        self.wait(5.0)
`;
  }

  // Standard or Mirrored Bars
  const posShift = preset.position === 'bottom' ? 'DOWN * 2.5' : preset.position === 'top' ? 'UP * 2.5' : 'ORIGIN';

  return `from manim import *
import numpy as np

class AudioVisualizerScene(Scene):
    """
    Audio-reactive Frequency Spectrum Bars in Manim CE.
    Preset: ${preset.name}
    """
    def construct(self):
        num_bars = ${preset.barCount}
        total_width = ${preset.width}
        max_height = ${preset.height}
        bar_width = (total_width / num_bars) * 0.72

        bars = VGroup(*[
            Rectangle(
                width=bar_width,
                height=0.1,
                fill_opacity=0.85,
                stroke_width=0.5,
                stroke_color=WHITE,
                fill_color=interpolate_color(color_to_rgb("${preset.primaryColor}"), color_to_rgb("${preset.secondaryColor}"), i / num_bars),
            )
            for i in range(num_bars)
        ]).arrange(RIGHT, buff=(total_width / num_bars) * 0.28).shift(${posShift})

        def update_spectrum(mob, dt):
            t = self.time
            for i, bar in enumerate(mob):
                frac = i / num_bars
                # Simulates voice formants and harmonic energy
                amp = 0.15 + 0.85 * (0.5 + 0.5 * np.sin(t * 3.2 + i * 0.35)) * np.exp(-((frac - 0.35)**2) / 0.12)
                bar.stretch_to_fit_height(max(0.08, amp * max_height))
                bar.align_to(mob, DOWN)

        bars.add_updater(update_spectrum)
        self.add(bars)
        self.wait(5.0)
`;
}

/**
 * Creates AnyVis project actions for inserting the audio visualizer into a scene
 */
export function createAudioVisualizerActions(
  project: Project,
  preset: AudioVisualizerPreset
): { project: Project; actionIds: string[] } {
  const ts = Date.now().toString(36).slice(-4);
  const visualizerName = `音频频谱_${preset.id}_${ts}`;

  const visualizerAction: Action = {
    id: `action_visualizer_${ts}`,
    type: 'create_plot',
    fields: {
      name: visualizerName,
      fn: 'sin(x)',
      xMin: -preset.width / 2,
      xMax: preset.width / 2,
      color: preset.primaryColor,
      visualizerType: preset.type,
      barCount: preset.barCount,
      position: preset.position,
      note: `音频响应式可视化: ${preset.name}`,
    },
    children: [],
  };

  return {
    project: {
      ...project,
      actions: [...project.actions, visualizerAction],
    },
    actionIds: [visualizerAction.id],
  };
}
