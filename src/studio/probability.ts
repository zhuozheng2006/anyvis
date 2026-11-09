import { createAction } from './core/catalog.ts';
import { appendPlaygroundActions, playgroundName, emptyPlayground, playgroundPython } from './playground-actions.ts';
import type { Project } from './core/types';

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
export function generateProbabilityPythonCode(preset: DistributionPreset, params: Record<string, number>): string {
  return playgroundPython(createProbabilityActions(emptyPlayground(), preset, params), 'DistributionScene');
}

/** Injects probability distribution actions into project */
export function createProbabilityActions(project: Project, preset: DistributionPreset, params: Record<string, number> = preset.defaultParams): { project: Project; actionIds: string[] } {
  const values = { ...preset.defaultParams, ...params };
  const sampled = sampleDistribution(preset, values);
  const xMin = sampled.points[0].x, xMax = sampled.points.at(-1)!.x;
  const axes = playgroundName('概率坐标系'), yMax = sampled.maxY * 1.15;
  const actions = [createAction('axes', { name: axes, xMin, xMax, yMin: 0, yMax, xLength: 9, yLength: 5 })];
  if (preset.id === 'normal' || preset.id === 'exponential') {
    const expression = preset.id === 'normal'
      ? `exp(-0.5*((x-(${values.mu}))/(${values.sigma}))^2)/((${values.sigma})*sqrt(2*pi))`
      : `${values.lambda}*exp(-${values.lambda}*x)`;
    actions.push(createAction('function_plot', { name: playgroundName(preset.id), axes, expression, xMin, xMax, duration: 2 }));
  } else {
    // Same PMF samples as the workbench, mapped through the declared axes scales.
    for (const p of sampled.points) {
      if (p.y <= 0) continue;
      actions.push(createAction('rectangle', { name: playgroundName(`概率_${p.x}`), width: 0.8 * 9 / (xMax-xMin), height: Math.max(0.01, p.y * 5 / yMax), x: (p.x-(xMin+xMax)/2)*9/(xMax-xMin), y: -2.5+p.y*2.5/yMax, fill: 0.8, appear: 'none' }));
    }
    actions.push(createAction('wait', { duration: 2 }));
  }
  return appendPlaygroundActions(project, actions);
}
