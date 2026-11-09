import { createAction } from './core/catalog.ts';
import { appendPlaygroundActions, playgroundName, playgroundPolyline, emptyPlayground, playgroundPython } from './playground-actions.ts';
import type { Action, Project } from './core/types';

export interface Complex {
  re: number;
  im: number;
}

export const cAdd = (a: Complex, b: Complex): Complex => ({
  re: a.re + b.re,
  im: a.im + b.im,
});

export const cSub = (a: Complex, b: Complex): Complex => ({
  re: a.re - b.re,
  im: a.im - b.im,
});

export const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export const cDiv = (a: Complex, b: Complex): Complex => {
  const denom = b.re * b.re + b.im * b.im;
  if (denom < 1e-12) return { re: 0, im: 0 };
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
};

export const cAbs = (z: Complex): number => Math.sqrt(z.re * z.re + z.im * z.im);

export const cArg = (z: Complex): number => Math.atan2(z.im, z.re);

export const cExp = (z: Complex): Complex => {
  const r = Math.exp(Math.max(-10, Math.min(10, z.re)));
  return {
    re: r * Math.cos(z.im),
    im: r * Math.sin(z.im),
  };
};

export const cSin = (z: Complex): Complex => ({
  re: Math.sin(z.re) * Math.cosh(Math.max(-5, Math.min(5, z.im))),
  im: Math.cos(z.re) * Math.sinh(Math.max(-5, Math.min(5, z.im))),
});

export const cInv = (z: Complex): Complex => {
  const denom = z.re * z.re + z.im * z.im;
  if (denom < 1e-9) return { re: 10, im: 0 };
  return {
    re: z.re / denom,
    im: -z.im / denom,
  };
};

export type ComplexPresetId =
  | 'square'
  | 'cube'
  | 'exp'
  | 'inv'
  | 'mobius'
  | 'joukowsky';

export interface ComplexPreset {
  id: ComplexPresetId;
  name: string;
  description: string;
  formulaLatex: string;
  pythonFuncStr: string;
  map: (z: Complex) => Complex;
  defaultBounds: { min: number; max: number };
}

export const COMPLEX_PRESETS: ComplexPreset[] = [
  {
    id: 'square',
    name: '二次平方映射 (z²)',
    description: '幅角加倍、模长平方；笛卡尔网格变形为相互正交的双曲线族',
    formulaLatex: 'f(z) = z^2 = (x^2 - y^2) + 2ixy',
    pythonFuncStr: 'lambda z: z**2',
    map: (z) => ({
      re: z.re * z.re - z.im * z.im,
      im: 2 * z.re * z.im,
    }),
    defaultBounds: { min: -2.0, max: 2.0 },
  },
  {
    id: 'cube',
    name: '三次立方映射 (z³)',
    description: '幅角变为三倍，呈现三叶螺旋对称保角扭曲',
    formulaLatex: 'f(z) = z^3 = (x^3 - 3xy^2) + i(3x^2y - y^3)',
    pythonFuncStr: 'lambda z: z**3',
    map: (z) => ({
      re: z.re * z.re * z.re - 3 * z.re * z.im * z.im,
      im: 3 * z.re * z.re * z.im - z.im * z.im * z.im,
    }),
    defaultBounds: { min: -1.8, max: 1.8 },
  },
  {
    id: 'exp',
    name: '复指数映射 (eᶻ)',
    description: '垂直线映射为同心圆，水平线映射为自原点发散的射线',
    formulaLatex: 'f(z) = e^z = e^x(\\cos y + i\\sin y)',
    pythonFuncStr: 'lambda z: np.exp(z)',
    map: (z) => cExp(z),
    defaultBounds: { min: -2.0, max: 2.0 },
  },
  {
    id: 'inv',
    name: '圆反演映射 (1/z)',
    description: '单位圆内部与外部互换，水平与垂直直线反演为过原点的正交圆族',
    formulaLatex: 'f(z) = \\frac{1}{z} = \\frac{x - iy}{x^2 + y^2}',
    pythonFuncStr: 'lambda z: 1 / z if z != 0 else 0',
    map: (z) => cInv(z),
    defaultBounds: { min: -2.5, max: 2.5 },
  },
  {
    id: 'mobius',
    name: '莫比乌斯 Cayley 变换 ((z-i)/(z+i))',
    description: '经典共形自同构，将实轴映射为单位圆周，上半复平面保角压缩入单位圆盘',
    formulaLatex: 'f(z) = \\frac{z - i}{z + i}',
    pythonFuncStr: 'lambda z: (z - 1j) / (z + 1j)',
    map: (z) => cDiv(cSub(z, { re: 0, im: 1 }), cAdd(z, { re: 0, im: 1 })),
    defaultBounds: { min: -2.5, max: 2.5 },
  },
  {
    id: 'joukowsky',
    name: '儒可夫斯基变换 (z + 1/z)',
    description: '空气动力学中机翼截面保角变换的数学基石',
    formulaLatex: 'f(z) = z + \\frac{1}{z}',
    pythonFuncStr: 'lambda z: z + 1/z if z != 0 else 0',
    map: (z) => cAdd(z, cInv(z)),
    defaultBounds: { min: -2.5, max: 2.5 },
  },
];

export interface GridLine {
  id: string;
  type: 'real' | 'imag';
  constantVal: number;
  points: Array<{ x: number; y: number }>;
}

/** Generates morphed grid lines for complex mapping visualization */
export function generateMorphedGrid(
  preset: ComplexPreset,
  bounds: { min: number; max: number },
  lineSpacing: number,
  t: number,
  samplesPerLine = 40,
): GridLine[] {
  const lines: GridLine[] = [];
  const clampedT = Math.max(0, Math.min(1, t));

  // Vertical lines: x = const, y varies from min to max
  for (let x = bounds.min; x <= bounds.max + 1e-6; x += lineSpacing) {
    const pts: Array<{ x: number; y: number }> = [];
    for (let s = 0; s <= samplesPerLine; s++) {
      const y = bounds.min + (s / samplesPerLine) * (bounds.max - bounds.min);
      const z: Complex = { re: x, im: y };
      const w = preset.map(z);
      // Linear interpolation: z_t = (1 - t) * z + t * w
      const interpX = (1 - clampedT) * z.re + clampedT * w.re;
      const interpY = (1 - clampedT) * z.im + clampedT * w.im;
      pts.push({ x: interpX, y: interpY });
    }
    lines.push({
      id: `real_${x.toFixed(2)}`,
      type: 'real',
      constantVal: x,
      points: pts,
    });
  }

  // Horizontal lines: y = const, x varies from min to max
  for (let y = bounds.min; y <= bounds.max + 1e-6; y += lineSpacing) {
    const pts: Array<{ x: number; y: number }> = [];
    for (let s = 0; s <= samplesPerLine; s++) {
      const x = bounds.min + (s / samplesPerLine) * (bounds.max - bounds.min);
      const z: Complex = { re: x, im: y };
      const w = preset.map(z);
      const interpX = (1 - clampedT) * z.re + clampedT * w.re;
      const interpY = (1 - clampedT) * z.im + clampedT * w.im;
      pts.push({ x: interpX, y: interpY });
    }
    lines.push({
      id: `imag_${y.toFixed(2)}`,
      type: 'imag',
      constantVal: y,
      points: pts,
    });
  }

  return lines;
}

export interface ComplexProbeResult {
  z0: Complex;
  w0: Complex;
  fPrime: Complex;
  magnification: number; // |f'(z0)|
  rotationDeg: number;   // arg(f'(z0)) in degrees
}

/** Computes value and complex derivative f'(z0) to inspect local conformal scaling and rotation */
export function probeComplexMapping(
  z0: Complex,
  preset: ComplexPreset,
  h = 0.001,
): ComplexProbeResult {
  const w0 = preset.map(z0);
  const wPlusH = preset.map({ re: z0.re + h, im: z0.im });
  // f'(z) ≈ (f(z0 + h) - f(z0)) / h
  const fPrime: Complex = {
    re: (wPlusH.re - w0.re) / h,
    im: (wPlusH.im - w0.im) / h,
  };

  const mag = cAbs(fPrime);
  const rotationRad = cArg(fPrime);
  const rotationDeg = (rotationRad * 180) / Math.PI;

  return {
    z0,
    w0,
    fPrime,
    magnification: mag,
    rotationDeg,
  };
}

/** Generates runnable Manim CE Python code for complex mapping animation */
export function generateComplexMappingPythonCode(preset: ComplexPreset, bounds: {min: number; max: number}, spacing = 0.5, morphT = 1): string {
  return playgroundPython(createComplexMappingActions(emptyPlayground(), preset, bounds, spacing, morphT), 'ComplexMappingScene');
}
export function createComplexMappingActions(project: Project, preset: ComplexPreset, bounds: {min: number; max: number}, spacing = 0.5, morphT = 1): {project: Project; actionIds: string[]} {
  if (!(spacing > 0) || (bounds.max-bounds.min)/spacing > 30) throw new Error('网格过密，请增大网格间隔。');
  const before = generateMorphedGrid(preset,bounds,spacing,0,50);
  const after = generateMorphedGrid(preset,bounds,spacing,morphT,50);
  const actions: Action[] = [], originals: string[] = [], targets: string[] = [];
  for (let i=0;i<before.length;i++) {
    const source = playgroundName('网格线'), target = playgroundName('映射线');
    originals.push(source); targets.push(target);
    const color = before[i].type === 'real' ? '#38bdf8' : '#e2b340';
    actions.push(...playgroundPolyline(source,before[i].points.map(p=>[p.x,p.y,0]),color,false));
    actions.push(...playgroundPolyline(target,after[i].points.map(p=>[p.x,p.y,0]),color,false));
  }
  const source = playgroundName('复平面'), target = playgroundName('映射后平面');
  actions.push(createAction('group',{name:source,members:originals.join(',')}),createAction('group',{name:target,members:targets.join(',')}));
  actions.push(createAction('create',{target:source}),createAction('transform',{target:source,destination:target,duration:3.5}));
  return appendPlaygroundActions(project,actions);
}
