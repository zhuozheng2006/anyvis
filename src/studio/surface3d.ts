import { createAction } from './core/catalog.ts';
import { appendPlaygroundActions, playgroundName, playgroundApi, emptyPlayground, playgroundPython } from './playground-actions.ts';
import type { Project } from './core/types';

export type SurfacePresetId =
  | 'saddle'
  | 'paraboloid'
  | 'torus'
  | 'mobius'
  | 'sphere'
  | 'ripple'
  | 'monkey';

export type Point3D = [number, number, number];
export type Point2D = [number, number];

export interface SurfacePreset {
  id: SurfacePresetId;
  name: string;
  description: string;
  formulaLatex: string;
  uRange: [number, number];
  vRange: [number, number];
  uResolution: number;
  vResolution: number;
  func: (u: number, v: number) => Point3D;
  pythonFuncStr: string;
}

export interface CameraOrientation {
  phi: number; // elevation angle in degrees, 0 to 90
  theta: number; // azimuth angle in degrees, -180 to 180
  distance: number; // camera distance
  scale: number; // viewport scale factor
}

export interface ProjectedFace {
  id: string;
  screenPoints: Point2D[];
  depthZ: number;
  avgHeight: number;
  fillColor: string;
  strokeColor: string;
}

export const SURFACE_PRESETS: SurfacePreset[] = [
  {
    id: 'saddle',
    name: '双曲抛物面 / 马鞍面 (Hyperbolic Paraboloid)',
    description: '经典的鞍点极小曲面与直纹曲面，主曲率异号',
    formulaLatex: 'z = x^2 - y^2',
    uRange: [-1.5, 1.5],
    vRange: [-1.5, 1.5],
    uResolution: 20,
    vResolution: 20,
    func: (u, v) => [u, v, (u * u - v * v) * 0.6],
    pythonFuncStr: 'lambda u, v: np.array([u, v, (u**2 - v**2) * 0.6])',
  },
  {
    id: 'paraboloid',
    name: '椭圆抛物面 / 碗面 (Elliptic Paraboloid)',
    description: '旋转对称碗状极小值曲面，横截面为同心椭圆族',
    formulaLatex: 'z = \\frac{1}{2}(x^2 + y^2)',
    uRange: [-1.6, 1.6],
    vRange: [-1.6, 1.6],
    uResolution: 20,
    vResolution: 20,
    func: (u, v) => [u, v, 0.45 * (u * u + v * v) - 1.1],
    pythonFuncStr: 'lambda u, v: np.array([u, v, 0.45 * (u**2 + v**2) - 1.1])',
  },
  {
    id: 'torus',
    name: '三维环面 (Torus)',
    description: '圆沿共面圆周旋转扫掠成的闭合环状曲面，亏格为 1',
    formulaLatex: '\\mathbf{r}(u,v) = ((R+r\\cos v)\\cos u,\\; (R+r\\cos v)\\sin u,\\; r\\sin v)',
    uRange: [0, 2 * Math.PI],
    vRange: [0, 2 * Math.PI],
    uResolution: 22,
    vResolution: 16,
    func: (u, v) => {
      const R = 1.5;
      const r = 0.65;
      return [
        (R + r * Math.cos(v)) * Math.cos(u),
        (R + r * Math.cos(v)) * Math.sin(u),
        r * Math.sin(v),
      ];
    },
    pythonFuncStr: 'lambda u, v: np.array([(1.5 + 0.65*np.cos(v))*np.cos(u), (1.5 + 0.65*np.cos(v))*np.sin(u), 0.65*np.sin(v)])',
  },
  {
    id: 'mobius',
    name: '莫比乌斯单侧带 (Möbius Strip)',
    description: '拓扑学中经典的不可定向单侧单边界曲面',
    formulaLatex: '\\mathbf{r}(u,v) = \\left(\\left(1+\\frac{v}{2}\\cos\\frac{u}{2}\\right)\\cos u,\\;\\left(1+\\frac{v}{2}\\cos\\frac{u}{2}\\right)\\sin u,\\;\\frac{v}{2}\\sin\\frac{u}{2}\\right)',
    uRange: [0, 2 * Math.PI],
    vRange: [-1.0, 1.0],
    uResolution: 26,
    vResolution: 10,
    func: (u, v) => {
      const halfU = u / 2;
      const factor = 1.3 + (v * 0.5) * Math.cos(halfU);
      return [
        factor * Math.cos(u),
        factor * Math.sin(u),
        v * 0.5 * Math.sin(halfU),
      ];
    },
    pythonFuncStr: 'lambda u, v: np.array([(1.3 + v*0.5*np.cos(u/2))*np.cos(u), (1.3 + v*0.5*np.cos(u/2))*np.sin(u), v*0.5*np.sin(u/2)])',
  },
  {
    id: 'sphere',
    name: '参数球面 (Parametric Sphere)',
    description: '恒定正高斯曲率紧致曲面，由纬度与经度参数化',
    formulaLatex: '\\mathbf{r}(u,v) = (R\\cos u\\sin v,\\; R\\sin u\\sin v,\\; R\\cos v)',
    uRange: [0, 2 * Math.PI],
    vRange: [0.05, Math.PI - 0.05],
    uResolution: 20,
    vResolution: 14,
    func: (u, v) => {
      const R = 1.4;
      return [
        R * Math.cos(u) * Math.sin(v),
        R * Math.sin(u) * Math.sin(v),
        R * Math.cos(v),
      ];
    },
    pythonFuncStr: 'lambda u, v: np.array([1.4*np.cos(u)*np.sin(v), 1.4*np.sin(u)*np.sin(v), 1.4*np.cos(v)])',
  },
  {
    id: 'ripple',
    name: '阻尼水波涟漪 (Damped Radial Waves)',
    description: '中心点源径向扩散的正弦驻波干涉花样',
    formulaLatex: 'z = 0.8\\cdot\\frac{\\sin(3r)}{r+0.2},\\quad r=\\sqrt{x^2+y^2}',
    uRange: [-2.2, 2.2],
    vRange: [-2.2, 2.2],
    uResolution: 22,
    vResolution: 22,
    func: (u, v) => {
      const r = Math.sqrt(u * u + v * v);
      const z = (0.75 * Math.sin(3.5 * r)) / (r + 0.3);
      return [u, v, z];
    },
    pythonFuncStr: 'lambda u, v: np.array([u, v, 0.75 * np.sin(3.5 * np.sqrt(u**2+v**2)) / (np.sqrt(u**2+v**2) + 0.3)])',
  },
  {
    id: 'monkey',
    name: '猴鞍面 (Monkey Saddle)',
    description: '满足三个马鞍凹陷（两腿与一尾巴）的三阶退化鞍点曲面',
    formulaLatex: 'z = x^3 - 3xy^2',
    uRange: [-1.2, 1.2],
    vRange: [-1.2, 1.2],
    uResolution: 18,
    vResolution: 18,
    func: (u, v) => [u, v, (u * u * u - 3 * u * v * v) * 0.5],
    pythonFuncStr: 'lambda u, v: np.array([u, v, (u**3 - 3*u*v**2) * 0.5])',
  },
];

/** Interpolates height color: #58c4dd (teal) -> #83c167 (green) -> #e2b340 (gold) -> #fc6255 (coral) */
export function getSurfaceColor(normHeight: number): { fill: string; stroke: string } {
  const clamped = Math.max(0, Math.min(1, normHeight));
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const lerp = (c1: string, c2: string, t: number) => {
    const [r1, g1, b1] = parse(c1);
    const [r2, g2, b2] = parse(c2);
    const r = Math.round(r1 + (r2 - r1) * t).toString(16).padStart(2, '0');
    const g = Math.round(g1 + (g2 - g1) * t).toString(16).padStart(2, '0');
    const b = Math.round(b1 + (b2 - b1) * t).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  };

  let fillHex: string;
  if (clamped < 0.33) {
    fillHex = lerp('#38bdf8', '#58c4dd', clamped / 0.33);
  } else if (clamped < 0.67) {
    fillHex = lerp('#58c4dd', '#e2b340', (clamped - 0.33) / 0.34);
  } else {
    fillHex = lerp('#e2b340', '#fc6255', (clamped - 0.67) / 0.33);
  }

  return {
    fill: fillHex,
    stroke: lerp(fillHex, '#ffffff', 0.25),
  };
}

/** Project a 3D coordinate to 2D screen coordinate using camera pitch/yaw and perspective */
export function project3DToScreen(
  point: Point3D,
  camera: CameraOrientation,
  viewportWidth = 600,
  viewportHeight = 400,
): { screenPoint: Point2D; cameraZ: number } {
  const [x, y, z] = point;
  const thetaRad = (camera.theta * Math.PI) / 180;
  const phiRad = (camera.phi * Math.PI) / 180;

  // 1. Azimuth rotation (around Z-axis)
  const x1 = x * Math.cos(thetaRad) - y * Math.sin(thetaRad);
  const y1 = x * Math.sin(thetaRad) + y * Math.cos(thetaRad);
  const z1 = z;

  // 2. Elevation rotation (around X-axis)
  const cosPhi = Math.cos(phiRad);
  const sinPhi = Math.sin(phiRad);
  const x2 = x1;
  const y2 = y1 * cosPhi - z1 * sinPhi;
  const z2 = y1 * sinPhi + z1 * cosPhi;

  // 3. Camera distance & perspective
  const cameraZ = z2 + camera.distance;
  const safeZ = cameraZ > 0.2 ? cameraZ : 0.2;
  const perspectiveScale = (camera.scale / safeZ) * 180;

  const screenX = viewportWidth / 2 + x2 * perspectiveScale;
  const screenY = viewportHeight / 2 - y2 * perspectiveScale;

  return { screenPoint: [screenX, screenY], cameraZ };
}

/** Builds a sorted list of projected mesh quadrilaterals using Painter's algorithm */
export function generateProjectedMesh(
  preset: SurfacePreset,
  camera: CameraOrientation,
  viewportWidth = 600,
  viewportHeight = 400,
): ProjectedFace[] {
  const [uMin, uMax] = preset.uRange;
  const [vMin, vMax] = preset.vRange;
  const uSteps = preset.uResolution;
  const vSteps = preset.vResolution;

  // 1. Sample 3D grid
  const grid: Point3D[][] = [];
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  for (let i = 0; i <= uSteps; i++) {
    const row: Point3D[] = [];
    const u = uMin + (i / uSteps) * (uMax - uMin);
    for (let j = 0; j <= vSteps; j++) {
      const v = vMin + (j / vSteps) * (vMax - vMin);
      const pt = preset.func(u, v);
      if (pt[2] < minHeight) minHeight = pt[2];
      if (pt[2] > maxHeight) maxHeight = pt[2];
      row.push(pt);
    }
    grid.push(row);
  }

  const heightSpan = maxHeight - minHeight > 1e-4 ? maxHeight - minHeight : 1;

  // 2. Construct quad faces
  const faces: ProjectedFace[] = [];

  for (let i = 0; i < uSteps; i++) {
    for (let j = 0; j < vSteps; j++) {
      const p00 = grid[i][j];
      const p10 = grid[i + 1][j];
      const p11 = grid[i + 1][j + 1];
      const p01 = grid[i][j + 1];

      const proj00 = project3DToScreen(p00, camera, viewportWidth, viewportHeight);
      const proj10 = project3DToScreen(p10, camera, viewportWidth, viewportHeight);
      const proj11 = project3DToScreen(p11, camera, viewportWidth, viewportHeight);
      const proj01 = project3DToScreen(p01, camera, viewportWidth, viewportHeight);

      // Average depth for Painter's algorithm sorting (largest cameraZ rendered first)
      const avgCameraZ = (proj00.cameraZ + proj10.cameraZ + proj11.cameraZ + proj01.cameraZ) / 4;
      const avgZ = (p00[2] + p10[2] + p11[2] + p01[2]) / 4;
      const normHeight = (avgZ - minHeight) / heightSpan;
      const colorScheme = getSurfaceColor(normHeight);

      faces.push({
        id: `face_${i}_${j}`,
        screenPoints: [
          proj00.screenPoint,
          proj10.screenPoint,
          proj11.screenPoint,
          proj01.screenPoint,
        ],
        depthZ: avgCameraZ,
        avgHeight: avgZ,
        fillColor: colorScheme.fill,
        strokeColor: colorScheme.stroke,
      });
    }
  }

  // 3. Sort back-to-front (descending depthZ)
  faces.sort((a, b) => b.depthZ - a.depthZ);
  return faces;
}

/** Generates runnable Manim CE Python code for 3D parametric surface */
export function generateSurfacePythonCode(preset: SurfacePreset, camera: CameraOrientation, ambientRotation = true): string {
  return playgroundPython(createSurfaceActions(emptyPlayground(), preset, camera, ambientRotation), 'ParametricSurfaceScene');
}

/** Injects 3D surface scene actions into AnyVis project */
export function createSurfaceActions(
  project: Project, preset: SurfacePreset,
  camera: CameraOrientation = { phi: 65, theta: -45, distance: 5, scale: 1 },
  ambientRotation = true,
): { project: Project; actionIds: string[] } {
  const [xExpr, yExpr, zExpr] = preset.pythonFuncStr.split('np.array([')[1].split('])')[0].split(',').map(s => s.trim().replaceAll('np.', '').replaceAll('**', '^'));
  const actions = [
    createAction('camera', { phi: camera.phi, theta: camera.theta, zoom: Math.max(0.1, Math.min(5, camera.scale)), duration: 0 }),
    playgroundApi('ThreeDScene.set_camera_orientation', playgroundName('镜头视距'), { focal_distance: camera.distance }, {receiver: '@scene', mode: 'store'}),
    createAction('three_axes', { name: playgroundName('三维坐标系') }),
    createAction('surface', { name: playgroundName(preset.id), xExpr, yExpr, zExpr, uMin: preset.uRange[0], uMax: preset.uRange[1], vMin: preset.vRange[0], vMax: preset.vRange[1], resolution: preset.uResolution }),
    ...(ambientRotation ? [createAction('ambient_rotation', { rate: 0.25 }), createAction('wait', { duration: 3 }), createAction('ambient_rotation', { rate: 0 })] : []),
  ];
  return appendPlaygroundActions(project, actions, '3d');
}
