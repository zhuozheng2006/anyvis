import { createAction } from './core/catalog.ts';
import { appendPlaygroundActions, playgroundName, playgroundPolyline, emptyPlayground, playgroundPython } from './playground-actions.ts';
import type { Action, Project } from './core/types';

export type Point2D = [number, number];

export type GeometryPresetId =
  | 'euler_line'
  | 'pythagoras'
  | 'incircle'
  | 'circumcircle'
  | 'curvature';

export interface GeometryPreset {
  id: GeometryPresetId;
  name: string;
  description: string;
  initialA: Point2D;
  initialB: Point2D;
  initialC: Point2D;
}

export interface TriangleCenters {
  A: Point2D;
  B: Point2D;
  C: Point2D;
  sideA: number; // |BC|
  sideB: number; // |AC|
  sideC: number; // |AB|
  area: number;
  perimeter: number;
  centroid: Point2D;     // G
  circumcenter: Point2D; // O
  circumradius: number;  // R
  incenter: Point2D;     // I
  inradius: number;      // r
  orthocenter: Point2D;   // H
  eulerRatio: number;    // |HG| / |GO| should be 2.0
}

export const GEOMETRY_PRESETS: GeometryPreset[] = [
  {
    id: 'euler_line',
    name: '欧拉线与四心共线定理 (Euler Line)',
    description: '外心 O、重心 G、垂心 H 永远共线，且垂心到重心距离等于重心到外心距离的两倍 (HG = 2·GO)',
    initialA: [-2.4, -1.2],
    initialB: [2.6, -1.2],
    initialC: [0.6, 2.2],
  },
  {
    id: 'pythagoras',
    name: '勾股定理几何弦图 (Pythagorean Theorem)',
    description: '直角三角形三边向外作正方形，两直角边正方形面积之和恒等于斜边正方形面积 (a² + b² = c²)',
    initialA: [-1.8, -1.5],
    initialB: [1.8, -1.5],
    initialC: [-1.8, 1.2],
  },
  {
    id: 'incircle',
    name: '三角形内切圆与三内角平分线 (Incircle)',
    description: '三条角平分线交于内心 I，内心到三边垂直距离等于内切圆半径 r = S / s',
    initialA: [-2.6, -1.4],
    initialB: [2.4, -1.4],
    initialC: [-0.4, 2.0],
  },
  {
    id: 'circumcircle',
    name: '三角形外接圆与三边中垂线 (Circumcircle)',
    description: '三边垂直平分线交于外心 O，外心到三个顶点距离相等，构成唯一外接圆',
    initialA: [-2.2, -1.0],
    initialB: [2.2, -1.0],
    initialC: [0.2, 2.2],
  },
  {
    id: 'curvature',
    name: '抛物线顶点密切曲率圆 (Osculating Circle)',
    description: '在曲线某点处具有相同切线与二阶导数的二阶相切密切圆，半径 R = (1+y\'²)^(3/2) / |y"|',
    initialA: [-2.0, 1.0],
    initialB: [0.0, -1.0],
    initialC: [2.0, 1.0],
  },
];

/** Distance between two 2D points */
export function dist2D(p1: Point2D, p2: Point2D): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** Computes triangle centers and classical Euclidean relations */
export function computeTriangleCenters(A: Point2D, B: Point2D, C: Point2D): TriangleCenters {
  const [ax, ay] = A;
  const [bx, by] = B;
  const [cx, cy] = C;

  const a = dist2D(B, C);
  const b = dist2D(A, C);
  const c = dist2D(A, B);
  const perimeter = a + b + c;
  const s = perimeter / 2;

  // Signed Area (positive for CCW)
  const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;

  // 1. Centroid G (重心) = (A + B + C) / 3
  const G: Point2D = [
    (ax + bx + cx) / 3,
    (ay + by + cy) / 3,
  ];

  // 2. Incenter I (内心) = (a*A + b*B + c*C) / (a + b + c)
  const safePerimeter = perimeter > 1e-6 ? perimeter : 1;
  const I: Point2D = [
    (a * ax + b * bx + c * cx) / safePerimeter,
    (a * ay + b * by + c * cy) / safePerimeter,
  ];
  const r = area / (s > 1e-6 ? s : 1);

  // 3. Circumcenter O (外心)
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  let O: Point2D;
  let R: number;

  if (Math.abs(D) < 1e-6) {
    O = [G[0], G[1]];
    R = 1.0;
  } else {
    const aSq = ax * ax + ay * ay;
    const bSq = bx * bx + by * by;
    const cSq = cx * cx + cy * cy;

    const ox = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / D;
    const oy = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / D;
    O = [ox, oy];
    R = dist2D(O, A);
  }

  // 4. Orthocenter H (垂心) via Euler relation: H = 3G - 2O
  const H: Point2D = [
    3 * G[0] - 2 * O[0],
    3 * G[1] - 2 * O[1],
  ];

  const distGO = dist2D(G, O);
  const distHG = dist2D(H, G);
  const eulerRatio = distGO > 1e-4 ? distHG / distGO : 2.0;

  return {
    A,
    B,
    C,
    sideA: a,
    sideB: b,
    sideC: c,
    area,
    perimeter,
    centroid: G,
    circumcenter: O,
    circumradius: R,
    incenter: I,
    inradius: r,
    orthocenter: H,
    eulerRatio,
  };
}

/** Computes the four vertices of a square constructed outwardly on edge P1 -> P2 */
export function getAttachedSquare(p1: Point2D, p2: Point2D): [Point2D, Point2D, Point2D, Point2D] {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  // Normal vector rotated 90 degrees outward (-dy, dx)
  const nx = dy;
  const ny = -dx;

  const p3: Point2D = [p2[0] + nx, p2[1] + ny];
  const p4: Point2D = [p1[0] + nx, p1[1] + ny];

  return [p1, p2, p3, p4];
}

/** Generates runnable Manim CE Python code for geometric theorem */
export function generateGeometryPythonCode(preset: GeometryPreset, A: Point2D, B: Point2D, C: Point2D): string {
  return playgroundPython(createGeometryActions(emptyPlayground(),preset,A,B,C),'GeometryScene');
}
export function createGeometryActions(project: Project, preset: GeometryPreset, A: Point2D, B: Point2D, C: Point2D): {project:Project;actionIds:string[]} {
  const centers=computeTriangleCenters(A,B,C), actions:Action[]=[];
  const point=(name:string,p:Point2D,color='#e2b340')=>{
    actions.push(createAction('dot',{name:playgroundName(name),x:p[0],y:p[1],color,appear:'none'}));
    actions.push(createAction('text',{name:playgroundName('标注'),text:name,x:p[0]+0.2,y:p[1]+0.2,fontSize:20,appear:'none'}));
  };
  const circle=(name:string,p:Point2D,r:number,color:string)=>actions.push(createAction('circle',{name:playgroundName(name),x:p[0],y:p[1],radius:r,color,fill:0}));
  if (preset.id === 'curvature') {
    const [x1,y1]=A,[x2,y2]=B,[x3,y3]=C;
    if(Math.abs((x1-x2)*(x1-x3)*(x2-x3))<1e-8) throw new Error('拟合抛物线需要三个不同的横坐标。');
    const a=((y1-y2)/(x1-x2)-(y2-y3)/(x2-x3))/(x1-x3);
    const b=(y1-y2)/(x1-x2)-a*(x1+x2), c=y1-a*x1*x1-b*x1;
    if(Math.abs(a)<1e-6) throw new Error('直线没有有限半径的密切圆。');
    const m=2*a*x2+b, factor=(1+m*m)/(2*a);
    actions.push(createAction('parametric_curve',{name:playgroundName('抛物线'),xExpr:'t',yExpr:`${a}*t^2+(${b})*t+(${c})`,zExpr:'0',tMin:Math.min(x1,x2,x3),tMax:Math.max(x1,x2,x3)}));
    circle('密切圆',[x2-m*factor,y2+factor],Math.abs(factor)*Math.sqrt(1+m*m),'#38bdf8');point('P',B);
  } else {
    const area=Math.abs((B[0]-A[0])*(C[1]-A[1])-(B[1]-A[1])*(C[0]-A[0]));
    if(area<1e-6) throw new Error('三角形顶点不能共线。');
    actions.push(...playgroundPolyline(playgroundName('三角形'),[A,B,C,A].map(p=>[...p,0])));
    point('A',A);point('B',B);point('C',C);
    if(preset.id==='pythagoras') {
      for(const [p,q] of [[A,B],[B,C],[C,A]]) { const points=getAttachedSquare(p,q);actions.push(...playgroundPolyline(playgroundName('边上正方形'),[...points,points[0]].map(p=>[...p,0]),'#83c167')); }
    } else if(preset.id==='incircle') {
      circle('内切圆',centers.incenter,centers.inradius,'#83c167');point('I',centers.incenter);
      for(const p of [A,B,C]) actions.push(createAction('line',{name:playgroundName('角平分线'),x1:p[0],y1:p[1],x2:centers.incenter[0],y2:centers.incenter[1],color:'#83c167'}));
    } else {
      circle('外接圆',centers.circumcenter,centers.circumradius,'#38bdf8');point('O',centers.circumcenter);
      if(preset.id==='euler_line') {
        point('G',centers.centroid);point('H',centers.orthocenter);
        if(dist2D(centers.circumcenter,centers.orthocenter)>1e-6) actions.push(createAction('line',{name:playgroundName('欧拉线'),x1:centers.circumcenter[0],y1:centers.circumcenter[1],x2:centers.orthocenter[0],y2:centers.orthocenter[1],color:'#e2b340'}));
      }
    }
  }
  return appendPlaygroundActions(project,actions);
}
