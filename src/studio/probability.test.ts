import { compileProject } from './core/compiler.ts';
import { describe, it, expect } from 'vitest';
import {
  DISTRIBUTION_PRESETS,
  combinations,
  normalPdf,
  normalCdf,
  binomialPmf,
  poissonPmf,
  exponentialPdf,
  sampleDistribution,
  generateProbabilityPythonCode,
  createProbabilityActions,
  computeIntervalProbability,
} from './probability';
import type { Project } from './core/types';

describe('probability distributions math, CDF, and Manim CE code generator', () => {
  it('correctly calculates binomial combinations nCk', () => {
    expect(combinations(5, 2)).toBe(10);
    expect(combinations(6, 3)).toBe(20);
    expect(combinations(4, 0)).toBe(1);
    expect(combinations(4, 4)).toBe(1);
    expect(combinations(3, 5)).toBe(0);
  });

  it('correctly computes normal PDF and empirical rule CDF', () => {
    // Normal PDF at peak
    const peak = normalPdf(0, 0, 1);
    expect(peak).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 4);

    // CDF at median is 0.5
    expect(normalCdf(0, 0, 1)).toBeCloseTo(0.5, 4);

    // 68-95-99.7 Empirical Rule:
    // P(-1 <= X <= 1) = CDF(1) - CDF(-1) ≈ 0.6827
    const p1Sigma = normalCdf(1, 0, 1) - normalCdf(-1, 0, 1);
    expect(p1Sigma).toBeCloseTo(0.6827, 3);

    // P(-2 <= X <= 2) = CDF(2) - CDF(-2) ≈ 0.9545
    const p2Sigma = normalCdf(2, 0, 1) - normalCdf(-2, 0, 1);
    expect(p2Sigma).toBeCloseTo(0.9545, 3);
  });

  it('correctly computes discrete PMF for binomial and Poisson', () => {
    // Binomial B(4, 0.5) at k=2 -> 6 * (0.5)^4 = 0.375
    expect(binomialPmf(2, 4, 0.5)).toBeCloseTo(0.375, 4);

    // Poisson Pois(2) at k=0 -> e^-2 ≈ 0.1353
    expect(poissonPmf(0, 2)).toBeCloseTo(Math.exp(-2), 4);
    // Poisson Pois(2) at k=2 -> 2^2 * e^-2 / 2 = 2 * e^-2 ≈ 0.2707
    expect(poissonPmf(2, 2)).toBeCloseTo(2 * Math.exp(-2), 4);

    // Exponential Exp(1) at x=0 -> 1.0
    expect(exponentialPdf(0, 1)).toBe(1.0);
  });

  it('samples normal distribution and computes exact mean and variance', () => {
    const normal = DISTRIBUTION_PRESETS.find((p) => p.id === 'normal')!;
    const res = sampleDistribution(normal, { mu: 2.0, sigma: 1.5 });

    expect(res.mean).toBe(2.0);
    expect(res.variance).toBe(2.25);
    expect(res.points.length).toBeGreaterThan(0);
    expect(res.maxY).toBeCloseTo(normalPdf(2.0, 2.0, 1.5), 3);
  });

  it('samples binomial distribution and calculates expected value and variance', () => {
    const binom = DISTRIBUTION_PRESETS.find((p) => p.id === 'binomial')!;
    const res = sampleDistribution(binom, { n: 10, p: 0.4 });

    // Mean = np = 4, Var = np(1-p) = 2.4
    expect(res.mean).toBe(4.0);
    expect(res.variance).toBeCloseTo(2.4, 4);
    // 11 bars (k = 0 to 10)
    expect(res.points).toHaveLength(11);
    expect(res.points[0].isBar).toBe(true);
  });

  it('generates runnable Manim CE Python code for Normal and Binomial distribution', () => {
    const normal = DISTRIBUTION_PRESETS.find((p) => p.id === 'normal')!;
    const normalCode = generateProbabilityPythonCode(normal, { mu: 0, sigma: 1.0 });

    expect(normalCode).toContain('class DistributionScene(MovingCameraScene):');
    expect(normalCode).toContain('.plot(lambda x:');

    const binom = DISTRIBUTION_PRESETS.find((p) => p.id === 'binomial')!;
    const binomCode = generateProbabilityPythonCode(binom, { n: 20, p: 0.5 });
    expect(binomCode).toContain('class DistributionScene(MovingCameraScene):');
  });

  it('injects probability distribution actions into project without mutating original project', () => {
    const dummyProject: Project = {
      schemaVersion: 2,
      id: 'p_prob',
      name: 'Prob Test',
      scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
      actions: [],
    };
    const normal = DISTRIBUTION_PRESETS.find((p) => p.id === 'normal')!;
    const { project: nextProject, actionIds } = createProbabilityActions(dummyProject, normal, { mu: 0, sigma: 1 });

    expect(dummyProject.actions).toHaveLength(0);
    expect(compileProject(nextProject).diagnostics).toEqual([]);
    expect(actionIds).toHaveLength(nextProject.actions.length);
  });

  it('computes accurate interval probabilities across normal, discrete, and exponential distributions', () => {
    expect(computeIntervalProbability('normal', { mu: 0, sigma: 1 }, -1, 1)).toBeCloseTo(0.682689, 5);
    expect(computeIntervalProbability('binomial', { n: 4, p: 0.5 }, 0, 2)).toBeCloseTo(11 / 16, 6);
    expect(computeIntervalProbability('poisson', { lambda: 2 }, 0, 1)).toBeCloseTo(3 * Math.exp(-2), 6);
    expect(computeIntervalProbability('exponential', { lambda: 2 }, -2, 1)).toBeCloseTo(1 - Math.exp(-2), 6);
    expect(computeIntervalProbability('normal', { mu: 0, sigma: 1 }, 2, 1)).toBe(0);
    expect(computeIntervalProbability('binomial', { n: 4, p: 0.5 }, 3, 1)).toBe(0);
  });
});
