import { createAction } from './core/catalog.ts';
import { appendPlaygroundActions, playgroundName, playgroundPolyline, emptyPlayground, playgroundPython } from './playground-actions.ts';
import type { Action, Project } from './core/types';

export type VectorFieldPresetId =
  | 'vortex'
  | 'dipole'
  | 'saddle'
  | 'vanderpol'
  | 'pendulum'
  | 'quadrupole';

export interface VectorFieldPreset {
  id: VectorFieldPresetId;
  name: string;
  description: string;
  formulaLatex: string;
  pFormula: string;
  qFormula: string;
  sample: (x: number, y: number) => [number, number];
  defaultBounds: { xMin: number; xMax: number; yMin: number; yMax: number };
}

export interface VectorFieldSample {
  x: number;
  y: number;
  u: number;
  v: number;
  magnitude: number;
  angle: number;
  color: string;
}

export interface VectorProbeResult {
  x: number;
  y: number;
  u: number;
  v: number;
  magnitude: number;
  angle: number;
  divergence: number;
  curl: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  age: number;
  maxAge: number;
  trail: Array<{ x: number; y: number }>;
}

export type ColorTheme = '3b1b' | 'electric' | 'plasma';

export const VECTOR_FIELD_PRESETS: VectorFieldPreset[] = [
  {
    id: 'vortex',
    name: '旋转涡流 (Rotational Vortex)',
    description: '角速度恒定的逆时针旋转场，散度为 0，旋度为 2',
    formulaLatex: '\\vec{F}(x, y) = (-y,\\; x)',
    pFormula: '-y',
    qFormula: 'x',
    sample: (x: number, y: number) => [-y, x],
    defaultBounds: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 },
  },
  {
    id: 'dipole',
    name: '偶极子源汇场 (Source-Sink Dipole)',
    description: '左侧正源 (+1.2, 0) 发散，右侧负汇 (-1.2, 0) 吸收的二维偶极场',
    formulaLatex: '\\vec{F}(x, y) = \\frac{\\mathbf{r}_1}{r_1^2} - \\frac{\\mathbf{r}_2}{r_2^2}',
    pFormula: '(x+1.2)/r1^2 - (x-1.2)/r2^2',
    qFormula: 'y/r1^2 - y/r2^2',
    sample: (x: number, y: number) => {
      const r1Sq = (x + 1.2) * (x + 1.2) + y * y + 0.15;
      const r2Sq = (x - 1.2) * (x - 1.2) + y * y + 0.15;
      return [
        (x + 1.2) / r1Sq - (x - 1.2) / r2Sq,
        y / r1Sq - y / r2Sq,
      ];
    },
    defaultBounds: { xMin: -3, xMax: 3, yMin: -2.5, yMax: 2.5 },
  },
  {
    id: 'saddle',
    name: '鞍点双曲流 (Hyperbolic Saddle)',
    description: '沿 X 轴发散、沿 Y 轴汇聚的无旋无散双曲流动场',
    formulaLatex: '\\vec{F}(x, y) = (x,\\; -y)',
    pFormula: 'x',
    qFormula: '-y',
    sample: (x: number, y: number) => [x, -y],
    defaultBounds: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 },
  },
  {
    id: 'vanderpol',
    name: '范德波尔极限环 (Van der Pol Limit Cycle)',
    description: '非线性自激振荡相平面，轨迹最终吸引并收敛于封闭极限环',
    formulaLatex: '\\dot{x} = y,\\quad \\dot{y} = 0.8(1 - x^2)y - x',
    pFormula: 'y',
    qFormula: '0.8*(1 - x^2)*y - x',
    sample: (x: number, y: number) => [y, 0.8 * (1 - x * x) * y - x],
    defaultBounds: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 },
  },
  {
    id: 'pendulum',
    name: '阻尼单摆相图 (Damped Pendulum)',
    description: '大角度非线性单摆相空间，含鞍点分界线与稳定螺旋焦点',
    formulaLatex: '\\dot{\\theta} = \\omega,\\quad \\dot{\\omega} = -\\sin(\\theta) - 0.35\\omega',
    pFormula: 'y',
    qFormula: '-sin(x) - 0.35*y',
    sample: (x: number, y: number) => [y, -Math.sin(x) - 0.35 * y],
    defaultBounds: { xMin: -4, xMax: 4, yMin: -3, yMax: 3 },
  },
  {
    id: 'quadrupole',
    name: '谐波四极场 (Harmonic Quadrupole)',
    description: '解析复映射 f(z) = z^2 对应的二维保角调和场',
    formulaLatex: '\\vec{F}(x, y) = (x^2 - y^2,\\; -2xy)',
    pFormula: 'x^2 - y^2',
    qFormula: '-2*x*y',
    sample: (x: number, y: number) => [x * x - y * y, -2 * x * y],
    defaultBounds: { xMin: -2.5, xMax: 2.5, yMin: -2.5, yMax: 2.5 },
  },
];

/** Interpolates color between stops */
function lerpColor(c1: string, c2: string, t: number): string {
  const parse = (hex: string) => {
    const raw = hex.replace('#', '');
    return [
      parseInt(raw.substring(0, 2), 16),
      parseInt(raw.substring(2, 4), 16),
      parseInt(raw.substring(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(c1);
  const [r2, g2, b2] = parse(c2);
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(r1 + (r2 - r1) * clamped).toString(16).padStart(2, '0');
  const g = Math.round(g1 + (g2 - g1) * clamped).toString(16).padStart(2, '0');
  const b = Math.round(b1 + (b2 - b1) * clamped).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function getMagnitudeColor(t: number, theme: ColorTheme = '3b1b'): string {
  const clamped = Math.max(0, Math.min(1, t));
  if (theme === '3b1b') {
    // #58c4dd (teal) -> #83c167 (green) -> #e2b340 (gold) -> #fc6255 (coral)
    if (clamped < 0.33) {
      return lerpColor('#58c4dd', '#83c167', clamped / 0.33);
    } else if (clamped < 0.67) {
      return lerpColor('#83c167', '#e2b340', (clamped - 0.33) / 0.34);
    } else {
      return lerpColor('#e2b340', '#fc6255', (clamped - 0.67) / 0.33);
    }
  } else if (theme === 'electric') {
    // #38bdf8 (sky) -> #bb86fc (purple) -> #ff9f43 (amber)
    if (clamped < 0.5) {
      return lerpColor('#38bdf8', '#bb86fc', clamped * 2);
    }
    return lerpColor('#bb86fc', '#ff9f43', (clamped - 0.5) * 2);
  } else {
    // plasma
    if (clamped < 0.5) {
      return lerpColor('#0d0887', '#cc4778', clamped * 2);
    }
    return lerpColor('#cc4778', '#f0f921', (clamped - 0.5) * 2);
  }
}

/** Samples the vector field over a rectangular grid */
export function sampleVectorField(
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  step: number,
  func: (x: number, y: number) => [number, number],
  theme: ColorTheme = '3b1b',
): { samples: VectorFieldSample[]; maxMagnitude: number } {
  const rawSamples: Array<{ x: number; y: number; u: number; v: number; magnitude: number; angle: number }> = [];
  let maxMagnitude = 0;

  for (let x = bounds.xMin; x <= bounds.xMax + 1e-6; x += step) {
    for (let y = bounds.yMin; y <= bounds.yMax + 1e-6; y += step) {
      const [u, v] = func(x, y);
      const mag = Math.sqrt(u * u + v * v);
      if (mag > maxMagnitude) maxMagnitude = mag;
      const angle = Math.atan2(v, u);
      rawSamples.push({ x, y, u, v, magnitude: mag, angle });
    }
  }

  const safeMax = maxMagnitude > 1e-6 ? maxMagnitude : 1;
  const samples: VectorFieldSample[] = rawSamples.map((s) => ({
    ...s,
    color: getMagnitudeColor(s.magnitude / safeMax, theme),
  }));

  return { samples, maxMagnitude };
}

/** Calculates vector field properties (divergence and curl) at (x, y) */
export function probeVectorField(
  x: number,
  y: number,
  func: (x: number, y: number) => [number, number],
  h = 0.005,
): VectorProbeResult {
  const [u, v] = func(x, y);
  const mag = Math.sqrt(u * u + v * v);
  const angle = Math.atan2(v, u);

  // Central differences for partial derivatives
  const [uRight] = func(x + h, y);
  const [uLeft] = func(x - h, y);
  const dudx = (uRight - uLeft) / (2 * h);

  const [, vTop] = func(x, y + h);
  const [, vBottom] = func(x, y - h);
  const dvdy = (vTop - vBottom) / (2 * h);

  const [, vRight] = func(x + h, y);
  const [, vLeft] = func(x - h, y);
  const dvdx = (vRight - vLeft) / (2 * h);

  const [uTop] = func(x, y + h);
  const [uBottom] = func(x, y - h);
  const dudy = (uTop - uBottom) / (2 * h);

  // Divergence = ∇·F = du/dx + dv/dy
  const divergence = dudx + dvdy;
  // 2D Curl (Vorticity) = (∇×F)_z = dv/dx - du/dy
  const curl = dvdx - dudy;

  return {
    x,
    y,
    u,
    v,
    magnitude: mag,
    angle,
    divergence,
    curl,
  };
}

/** Advances virtual particles along the vector field using 4th-order Runge-Kutta */
export function stepParticles(
  particles: Particle[],
  func: (x: number, y: number) => [number, number],
  dt: number,
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  speedScale = 0.8,
): Particle[] {
  return particles.map((p) => {
    let { x, y, age, maxAge, trail } = p;
    age += 1;

    // Check if particle expired or out of bounds
    const outOfBounds =
      x < bounds.xMin || x > bounds.xMax || y < bounds.yMin || y > bounds.yMax;
    if (age >= maxAge || outOfBounds) {
      // Respawn randomly within bounds
      const nextX = bounds.xMin + Math.random() * (bounds.xMax - bounds.xMin);
      const nextY = bounds.yMin + Math.random() * (bounds.yMax - bounds.yMin);
      return {
        id: p.id,
        x: nextX,
        y: nextY,
        age: 0,
        maxAge: Math.floor(40 + Math.random() * 60),
        trail: [{ x: nextX, y: nextY }],
      };
    }

    // RK4 integration
    const [k1u, k1v] = func(x, y);
    const [k2u, k2v] = func(x + 0.5 * dt * k1u * speedScale, y + 0.5 * dt * k1v * speedScale);
    const [k3u, k3v] = func(x + 0.5 * dt * k2u * speedScale, y + 0.5 * dt * k2v * speedScale);
    const [k4u, k4v] = func(x + dt * k3u * speedScale, y + dt * k3v * speedScale);

    const nextX = x + ((dt * speedScale) / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
    const nextY = y + ((dt * speedScale) / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);

    const nextTrail = [...trail.slice(-12), { x: nextX, y: nextY }];

    return {
      id: p.id,
      x: nextX,
      y: nextY,
      age,
      maxAge,
      trail: nextTrail,
    };
  });
}

/** Generates runnable Manim CE Python code for vector field */
export function generateVectorFieldPythonCode(preset: VectorFieldPreset, bounds: {xMin:number;xMax:number;yMin:number;yMax:number}, type: 'arrows'|'streamlines' = 'arrows', step = 0.5, theme: ColorTheme = '3b1b'): string {
  return playgroundPython(createVectorFieldActions(emptyPlayground(),preset,bounds,type,step,theme),'VectorFieldScene');
}
export function createVectorFieldActions(project: Project, preset: VectorFieldPreset, bounds: {xMin:number;xMax:number;yMin:number;yMax:number}, type: 'arrows'|'streamlines' = 'arrows', step = 0.5, theme: ColorTheme = '3b1b'): {project:Project;actionIds:string[]} {
  if (!(step>0) || ((bounds.xMax-bounds.xMin)/step+1)*((bounds.yMax-bounds.yMin)/step+1)>400) throw new Error('向量网格过密，请增大间距。');
  const {samples}=sampleVectorField(bounds,step,preset.sample,theme);
  const actions: Action[]=[];
  if (type === 'arrows') {
    for(const sample of samples) {
      if(sample.magnitude<1e-9) continue;
      const length=0.28;
      actions.push(createAction('arrow',{name:playgroundName('场向量'),x1:sample.x,y1:sample.y,x2:sample.x+length*Math.cos(sample.angle),y2:sample.y+length*Math.sin(sample.angle),color:sample.color,appear:'none'}));
    }
    actions.push(createAction('wait',{duration:2}));
  } else {
    const animations: Action[]=[];
    for(const seed of samples.filter((_,i)=>i % Math.ceil(samples.length/24)===0)) {
      if(seed.magnitude<1e-9) continue;
      const points=[[seed.x,seed.y,0]];
      for(let i=0;i<100;i++) {
        const [x,y]=points.at(-1)!; const [u,v]=preset.sample(x,y); const nx=x+u*0.025,ny=y+v*0.025;
        if(!Number.isFinite(nx+ny)||nx<bounds.xMin||nx>bounds.xMax||ny<bounds.yMin||ny>bounds.yMax) break;
        points.push([nx,ny,0]);
      }
      if(points.length<2) continue;
      const path=playgroundName('流线'),dot=playgroundName('流动点');
      actions.push(...playgroundPolyline(path,points,seed.color,false),createAction('create',{target:path,duration:0.1}),createAction('dot',{name:dot,x:seed.x,y:seed.y,radius:0.04,appear:'none'}));
      animations.push(createAction('path_move',{target:dot,path,duration:2.5,easing:'linear'}));
    }
    const parallel=createAction('parallel');parallel.children=animations;actions.push(parallel);
  }
  return appendPlaygroundActions(project,actions);
}
