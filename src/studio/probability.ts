import type { Action, Project } from './core/types';

export type DistributionKind =
  | 'normal'
  | 'binomial'
  | 'poisson'
  | 'exponential';

export interface DistributionPreset {
  id: DistributionKind;
  name: string;
  description: string;
  formulaLatex: string;
  defaultParams: Record<string, number>;
  xRange: [number, number];
}

export const DISTRIBUTION_PRESETS: DistributionPreset[] = [
  {
    id: 'normal',
    name: '正态 / 高斯分布 (Normal Distribution)',
    description: '自然界与统计学基石分布，满足 68-95-99.7 经验法则',
    formulaLatex: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x - \\mu)^2}{2\\sigma^2}}',
    defaultParams: { mu: 0, sigma: 1.0 },
    xRange: [-4, 4],
  },
  {
    id: 'binomial',
    name: '二项分布与中心极限定理 (Binomial & CLT)',
    description: 'n 次独立伯努利试验成功次数分布，n 增大时趋近正态分布',
    formulaLatex: 'P(X = k) = \\binom{n}{k} p^k (1-p)^{n-k}',
    defaultParams: { n: 20, p: 0.5 },
    xRange: [0, 20],
  },
  {
    id: 'poisson',
    name: '泊松分布 (Poisson Distribution)',
    description: '单位时间或空间内稀有随机事件发生次数分布',
    formulaLatex: 'P(X = k) = \\frac{\\lambda^k e^{-\\lambda}}{k!}',
    defaultParams: { lambda: 4.0 },
    xRange: [0, 14],
  },
  {
    id: 'exponential',
    name: '指数分布 (Exponential Distribution)',
    description: '无记忆性连续随机变量分布，常用于排队论与寿命分析',
    formulaLatex: 'f(x) = \\lambda e^{-\\lambda x},\\quad x \\ge 0',
    defaultParams: { lambda: 1.2 },
    xRange: [0, 5],
  },
];

/** Factorial cache */
function factorial(n: number): number {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

/** Binomial coefficient nCk */
export function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const safeK = Math.min(k, n - k);
  let num = 1;
  let den = 1;
  for (let i = 1; i <= safeK; i++) {
    num *= n - i + 1;
    den *= i;
  }
  return num / den;
}

/** Error function approximation for Gaussian CDF */
export function erf(x: number): number {
  // Abramowitz and Stegun approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return sign * y;
}

/** Gaussian Normal Probability Density Function */
export function normalPdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 1e-4) return 0;
  const coeff = 1 / (sigma * Math.sqrt(2 * Math.PI));
  const exp = Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
  return coeff * exp;
}

/** Gaussian Normal Cumulative Distribution Function */
export function normalCdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 1e-4) return x >= mu ? 1 : 0;
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.sqrt(2))));
}

/** Binomial Probability Mass Function */
export function binomialPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0;
  return combinations(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

/** Poisson Probability Mass Function */
export function poissonPmf(k: number, lambda: number): number {
  if (k < 0 || lambda <= 0) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/** Exponential Probability Density Function */
export function exponentialPdf(x: number, lambda: number): number {
  if (x < 0 || lambda <= 0) return 0;
  return lambda * Math.exp(-lambda * x);
}

export interface DistributionPoint {
  x: number;
  y: number;
  isBar?: boolean;
}

/** Samples the active distribution into 2D plot points */
export function sampleDistribution(
  preset: DistributionPreset,
  params: Record<string, number>,
  numSamples = 80,
): { points: DistributionPoint[]; mean: number; variance: number; maxY: number } {
  const points: DistributionPoint[] = [];
  let mean = 0;
  let variance = 0;
  let maxY = 0;

  if (preset.id === 'normal') {
    const mu = params.mu ?? 0;
    const sigma = params.sigma ?? 1.0;
    mean = mu;
    variance = sigma * sigma;

    const xMin = mu - 3.8 * sigma;
    const xMax = mu + 3.8 * sigma;
    const step = (xMax - xMin) / numSamples;

    for (let x = xMin; x <= xMax + 1e-6; x += step) {
      const y = normalPdf(x, mu, sigma);
      if (y > maxY) maxY = y;
      points.push({ x, y });
    }
  } else if (preset.id === 'binomial') {
    const n = Math.round(params.n ?? 20);
    const p = params.p ?? 0.5;
    mean = n * p;
    variance = n * p * (1 - p);

    for (let k = 0; k <= n; k++) {
      const y = binomialPmf(k, n, p);
      if (y > maxY) maxY = y;
      points.push({ x: k, y, isBar: true });
    }
  } else if (preset.id === 'poisson') {
    const lambda = params.lambda ?? 4.0;
    mean = lambda;
    variance = lambda;

    const maxK = Math.max(12, Math.round(lambda + 4 * Math.sqrt(lambda)));
    for (let k = 0; k <= maxK; k++) {
      const y = poissonPmf(k, lambda);
      if (y > maxY) maxY = y;
      points.push({ x: k, y, isBar: true });
    }
  } else if (preset.id === 'exponential') {
    const lambda = params.lambda ?? 1.2;
    mean = 1 / lambda;
    variance = 1 / (lambda * lambda);

    const xMax = 4.5 * mean;
    const step = xMax / numSamples;
    for (let x = 0; x <= xMax + 1e-6; x += step) {
      const y = exponentialPdf(x, lambda);
      if (y > maxY) maxY = y;
      points.push({ x, y });
    }
  }

  return { points, mean, variance, maxY: maxY > 0 ? maxY : 1 };
}

/** Generates runnable Manim CE Python code for probability distribution */
export function generateProbabilityPythonCode(
  preset: DistributionPreset,
  params: Record<string, number>,
): string {
  if (preset.id === 'normal') {
    const mu = params.mu ?? 0;
    const sigma = params.sigma ?? 1.0;
    return `# Auto-generated by AnyVis - 3B1B Style Gaussian Normal Distribution
from manim import *
import numpy as np

class NormalDistributionScene(Scene):
    def construct(self):
        title = Title(r"Gaussian Normal Distribution $\\mathcal{N}(${mu}, ${sigma}^2)$", color=GOLD)
        self.play(Write(title))

        axes = Axes(
            x_range=[${mu - 4 * sigma}, ${mu + 4 * sigma}, 1],
            y_range=[0, 0.5, 0.1],
            axis_config={"color": BLUE_C},
        )

        def pdf(x):
            return (1 / (${sigma} * np.sqrt(2 * np.pi))) * np.exp(-0.5 * ((x - ${mu}) / ${sigma})**2)

        curve = axes.plot(pdf, color=TEAL, stroke_width=3)
        # 68% Empirical Rule area [-1 sigma, +1 sigma]
        area_1sigma = axes.get_area(curve, x_range=[${mu - sigma}, ${mu + sigma}], color=GOLD, opacity=0.45)

        lbl = MathTex(r"68.3\\% \\text{ (\\pm 1\\sigma)}", color=GOLD).next_to(axes.c2p(${mu}, 0.15), UP)

        self.play(Create(axes), run_time=1.5)
        self.play(Create(curve), run_time=2.0)
        self.play(FadeIn(area_1sigma), Write(lbl), run_time=1.5)
        self.wait(2.0)
`;
  }

  if (preset.id === 'binomial') {
    const n = Math.round(params.n ?? 20);
    const p = params.p ?? 0.5;
    return `# Auto-generated by AnyVis - 3B1B Style Binomial & CLT Convergence
from manim import *
import numpy as np

class BinomialDistributionScene(Scene):
    def construct(self):
        title = Title(r"Binomial Distribution $B(${n}, ${p})$", color=GOLD)
        self.play(Write(title))

        axes = Axes(
            x_range=[0, ${n}, 2],
            y_range=[0, 0.25, 0.05],
            axis_config={"color": BLUE_C},
        )

        # De Moivre-Laplace CLT normal approximation
        mu = ${n * p}
        sigma = np.sqrt(${n * p * (1 - p)})
        normal_curve = axes.plot(
            lambda x: (1 / (sigma * np.sqrt(2 * np.pi))) * np.exp(-0.5 * ((x - mu) / sigma)**2),
            color=GOLD,
            stroke_width=2.5,
        )

        self.play(Create(axes), run_time=1.5)
        self.play(Create(normal_curve), run_time=2.0)
        self.wait(2.0)
`;
  }

  return `# Auto-generated by AnyVis - Probability Distribution
from manim import *

class DistributionScene(Scene):
    def construct(self):
        title = Title(r"${preset.name}", color=GOLD)
        axes = Axes(x_range=[-4, 4, 1], y_range=[0, 1, 0.2])
        self.play(Write(title), Create(axes))
        self.wait(2)
`;
}

/** Injects probability distribution actions into project */
export function createProbabilityActions(
  project: Project,
  preset: DistributionPreset,
  _params?: Record<string, number>,
): { project: Project; actionIds: string[] } {
  const ts = Date.now();
  const axesName = `axes_prob_${ts.toString().slice(-4)}`;
  const titleName = `prob_title_${ts.toString().slice(-4)}`;

  const titleAction: Action = {
    id: `action_probtitle_${ts}`,
    type: 'create_text',
    fields: {
      name: titleName,
      text: `${preset.name}`,
      color: '#e2b340',
      x: 0,
      y: 3.2,
      fontSize: 28,
    },
    children: [],
  };

  const axesAction: Action = {
    id: `action_probaxes_${ts}`,
    type: 'create_axes',
    fields: {
      name: axesName,
      xMin: preset.xRange[0],
      xMax: preset.xRange[1],
      xStep: 1,
      yMin: 0,
      yMax: 1,
      yStep: 0.2,
    },
    children: [],
  };

  const formulaAction: Action = {
    id: `action_probformula_${ts}`,
    type: 'create_text',
    fields: {
      name: `probformula_${ts.toString().slice(-4)}`,
      text: preset.formulaLatex,
      color: '#58c4dd',
      x: 0,
      y: -3.2,
      fontSize: 20,
    },
    children: [],
  };

  const nextActions = [...project.actions, titleAction, axesAction, formulaAction];
  return {
    project: {
      ...project,
      actions: nextActions,
    },
    actionIds: [titleAction.id, axesAction.id, formulaAction.id],
  };
}
