import type { Action, Project } from './core/types';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export type Vector3DOperation = 'add' | 'dot' | 'cross';

export interface Vector3DPreset {
  id: string;
  name: string;
  description: string;
  u: Vector3D;
  v: Vector3D;
  operation: Vector3DOperation;
  category: string;
}

export const VECTOR3D_PRESETS: Vector3DPreset[] = [
  {
    id: 'ortho-basis',
    name: '标准正交基与叉乘',
    description: '展示经典标准正交基向量 i × j = k，以及右手法则垂直性质',
    u: { x: 2, y: 0, z: 0 },
    v: { x: 0, y: 2, z: 0 },
    operation: 'cross',
    category: '3B1B 线性代数',
  },
  {
    id: 'parallelogram-area',
    name: '对角向量与张成面积',
    description: '三维空间中两向量张成的平行四边形，面积恰好等于叉乘向量模长',
    u: { x: 2, y: 1, z: 0.5 },
    v: { x: 0.5, y: 2, z: 1 },
    operation: 'cross',
    category: '3B1B 线性代数',
  },
  {
    id: 'vector-addition',
    name: '三维平行四边形法则',
    description: '三维空间中的向量平移相加 u + v，合成对角线合向量',
    u: { x: 2, y: 1, z: 1.5 },
    v: { x: 1, y: 2, z: -0.5 },
    operation: 'add',
    category: '几何与力学',
  },
  {
    id: 'dot-projection',
    name: '三维空间正交投影',
    description: '内积与正交投影：u 在 v 方向上的影子长度与投影分向量',
    u: { x: 2, y: 2, z: 1 },
    v: { x: 3, y: 0, z: 0 },
    operation: 'dot',
    category: '3B1B 线性代数',
  },
  {
    id: 'torque-physics',
    name: '力矩与角动量 (τ = r × F)',
    description: '刚体转动力学中的力矩叉乘计算，力臂向量与作用力产生的力矩',
    u: { x: 1.5, y: 0, z: 0 },
    v: { x: 0, y: 2.5, z: 1 },
    operation: 'cross',
    category: '物理学模型',
  },
];

export function magnitude3D(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function add3D(u: Vector3D, v: Vector3D): Vector3D {
  return {
    x: u.x + v.x,
    y: u.y + v.y,
    z: u.z + v.z,
  };
}

export function dot3D(u: Vector3D, v: Vector3D): number {
  return u.x * v.x + u.y * v.y + u.z * v.z;
}

export function cross3D(u: Vector3D, v: Vector3D): Vector3D {
  return {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  };
}

export function angle3D(u: Vector3D, v: Vector3D): { radians: number; degrees: number } {
  const magU = magnitude3D(u);
  const magV = magnitude3D(v);
  if (magU === 0 || magV === 0) {
    return { radians: 0, degrees: 0 };
  }
  const cosTheta = Math.max(-1, Math.min(1, dot3D(u, v) / (magU * magV)));
  const radians = Math.acos(cosTheta);
  return {
    radians,
    degrees: (radians * 180) / Math.PI,
  };
}

export function project3D(u: Vector3D, v: Vector3D): Vector3D {
  const magSqV = v.x * v.x + v.y * v.y + v.z * v.z;
  if (magSqV === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  const scalar = dot3D(u, v) / magSqV;
  return {
    x: v.x * scalar,
    y: v.y * scalar,
    z: v.z * scalar,
  };
}

/**
 * 3D Isometric / Orbit projection to 2D screen coordinates
 */
export function project3DTo2D(
  pt: Vector3D,
  azimuthDeg: number,
  elevationDeg: number,
  scale = 32,
  centerX = 200,
  centerY = 180
): { x: number; y: number; depth: number } {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;

  // Yaw rotation around Z axis
  const x1 = pt.x * Math.cos(az) - pt.y * Math.sin(az);
  const y1 = pt.x * Math.sin(az) + pt.y * Math.cos(az);
  const z1 = pt.z;

  // Pitch rotation around X axis
  const x2 = x1;
  const y2 = y1 * Math.cos(el) - z1 * Math.sin(el);
  const z2 = y1 * Math.sin(el) + z1 * Math.cos(el);

  // Screen mapping: standard Manim coordinate system (X right, Z up)
  const screenX = centerX + x2 * scale;
  const screenY = centerY - z2 * scale;

  return { x: screenX, y: screenY, depth: y2 };
}

export function generateVector3DManimCode(
  u: Vector3D,
  v: Vector3D,
  operation: Vector3DOperation
): string {
  const { degrees } = angle3D(u, v);
  const angStr = degrees.toFixed(1);

  let opCode = '';
  if (operation === 'add') {
    const sum = add3D(u, v);
    opCode = `
        # 向量相加 (平行四边形法则)
        sum_vec = [${sum.x}, ${sum.y}, ${sum.z}]
        arrow_sum = Arrow3D(
            start=ORIGIN,
            end=axes.c2p(*sum_vec),
            color=YELLOW,
            thickness=0.03
        )
        
        # 辅助虚线
        line_u_sum = DashedLine(axes.c2p(*u_coords), axes.c2p(*sum_vec), color=WHITE, stroke_opacity=0.5)
        line_v_sum = DashedLine(axes.c2p(*v_coords), axes.c2p(*sum_vec), color=WHITE, stroke_opacity=0.5)
        
        formula = MathTex(r"\\vec{u} + \\vec{v} = \\begin{bmatrix} ${sum.x.toFixed(1)} \\\\ ${sum.y.toFixed(1)} \\\\ ${sum.z.toFixed(1)} \\end{bmatrix}", color=YELLOW).to_corner(UL)
        
        self.play(FadeIn(line_u_sum), FadeIn(line_v_sum))
        self.play(Create(arrow_sum), Write(formula))`;
  } else if (operation === 'dot') {
    const dotVal = dot3D(u, v).toFixed(2);
    const proj = project3D(u, v);
    opCode = `
        # 内积与投影
        proj_coords = [${proj.x.toFixed(2)}, ${proj.y.toFixed(2)}, ${proj.z.toFixed(2)}]
        arrow_proj = Arrow3D(
            start=ORIGIN,
            end=axes.c2p(*proj_coords),
            color=GREEN,
            thickness=0.035
        )
        drop_line = DashedLine(axes.c2p(*u_coords), axes.c2p(*proj_coords), color=GRAY, stroke_opacity=0.7)
        
        formula = MathTex(
            r"\\vec{u} \\cdot \\vec{v} = |\\vec{u}||\\vec{v}|\\cos(${angStr}^\\circ) = ${dotVal}",
            color=GREEN
        ).to_corner(UL)
        
        self.play(Create(drop_line))
        self.play(Create(arrow_proj), Write(formula))`;
  } else {
    const cross = cross3D(u, v);
    const area = magnitude3D(cross).toFixed(2);
    opCode = `
        # 叉乘与张成平行四边形
        cross_coords = [${cross.x.toFixed(2)}, ${cross.y.toFixed(2)}, ${cross.z.toFixed(2)}]
        arrow_cross = Arrow3D(
            start=ORIGIN,
            end=axes.c2p(*cross_coords),
            color=PURPLE_B,
            thickness=0.035
        )
        
        # 张成的空间平行四边形
        sum_vec = [${u.x + v.x}, ${u.y + v.y}, ${u.z + v.z}]
        poly = Polygon(
            axes.c2p(0, 0, 0),
            axes.c2p(*u_coords),
            axes.c2p(*sum_vec),
            axes.c2p(*v_coords),
            color=PURPLE,
            fill_opacity=0.35,
            stroke_width=1.5
        )
        
        formula = MathTex(
            r"\\vec{w} = \\vec{u} \\times \\vec{v} = \\begin{bmatrix} ${cross.x.toFixed(1)} \\\\ ${cross.y.toFixed(1)} \\\\ ${cross.z.toFixed(1)} \\end{bmatrix},\\; \\text{面积} = ${area}",
            color=PURPLE_B
        ).to_corner(UL)
        
        self.play(FadeIn(poly))
        self.play(Create(arrow_cross), Write(formula))`;
  }

  return `from manim import *

class Vector3DScene(ThreeDScene):
    def construct(self):
        self.set_camera_orientation(phi=65 * DEGREES, theta=-45 * DEGREES)
        self.begin_ambient_camera_rotation(rate=0.1)

        axes = ThreeDAxes(
            x_range=[-3, 3, 1],
            y_range=[-3, 3, 1],
            z_range=[-3, 3, 1],
            x_length=6,
            y_length=6,
            z_length=6
        )
        self.play(Create(axes))

        u_coords = [${u.x}, ${u.y}, ${u.z}]
        v_coords = [${v.x}, ${v.y}, ${v.z}]

        arrow_u = Arrow3D(start=ORIGIN, end=axes.c2p(*u_coords), color=BLUE, thickness=0.03)
        arrow_v = Arrow3D(start=ORIGIN, end=axes.c2p(*v_coords), color=RED, thickness=0.03)
        
        label_u = MathTex(r"\\vec{u}", color=BLUE).next_to(axes.c2p(*u_coords), UP)
        label_v = MathTex(r"\\vec{v}", color=RED).next_to(axes.c2p(*v_coords), RIGHT)

        self.play(Create(arrow_u), Write(label_u))
        self.play(Create(arrow_v), Write(label_v))
${opCode}
        self.wait(2)
`;
}

export function createVector3DActions(
  project: Project,
  u: Vector3D,
  v: Vector3D,
  operation: Vector3DOperation
): { project: Project; actionCount: number } {
  const actions: Action[] = [];
  const uid = () => 'vec3d_' + Math.random().toString(36).slice(2, 9);

  // 1. Create 3D Axes
  const axesId = uid();
  actions.push({
    id: axesId,
    type: 'three_d_axes_create',
    fields: {
      name: 'axes3d',
      x_min: -3,
      x_max: 3,
      y_min: -3,
      y_max: 3,
      z_min: -3,
      z_max: 3,
    },
  });

  // 2. Play creation animation for axes
  actions.push({
    id: uid(),
    type: 'animate_create',
    fields: {
      target: 'axes3d',
      duration: 1.0,
    },
  });

  // 3. Create Vector u
  const uId = uid();
  actions.push({
    id: uId,
    type: 'arrow_create',
    fields: {
      name: 'vec_u',
      start: '0,0,0',
      end: `${u.x},${u.y},${u.z}`,
      color: '#38bdf8',
    },
  });

  // 4. Create Vector v
  const vId = uid();
  actions.push({
    id: vId,
    type: 'arrow_create',
    fields: {
      name: 'vec_v',
      start: '0,0,0',
      end: `${v.x},${v.y},${v.z}`,
      color: '#f43f5e',
    },
  });

  // 5. Fade in vectors
  actions.push({
    id: uid(),
    type: 'animate_fade_in',
    fields: {
      target: 'vec_u',
      duration: 0.8,
    },
  });
  actions.push({
    id: uid(),
    type: 'animate_fade_in',
    fields: {
      target: 'vec_v',
      duration: 0.8,
    },
  });

  // 6. Operation-specific result
  if (operation === 'add') {
    const sum = add3D(u, v);
    actions.push({
      id: uid(),
      type: 'arrow_create',
      fields: {
        name: 'vec_sum',
        start: '0,0,0',
        end: `${sum.x},${sum.y},${sum.z}`,
        color: '#facc15',
      },
    });
    actions.push({
      id: uid(),
      type: 'animate_create',
      fields: {
        target: 'vec_sum',
        duration: 1.0,
      },
    });
    actions.push({
      id: uid(),
      type: 'tex_create',
      fields: {
        name: 'sum_label',
        text: `\\vec{u} + \\vec{v} = (${sum.x.toFixed(1)}, ${sum.y.toFixed(1)}, ${sum.z.toFixed(1)})`,
        color: '#facc15',
        scale: 0.8,
      },
    });
  } else if (operation === 'dot') {
    const dotVal = dot3D(u, v);
    const proj = project3D(u, v);
    actions.push({
      id: uid(),
      type: 'arrow_create',
      fields: {
        name: 'vec_proj',
        start: '0,0,0',
        end: `${proj.x.toFixed(2)},${proj.y.toFixed(2)},${proj.z.toFixed(2)}`,
        color: '#4ade80',
      },
    });
    actions.push({
      id: uid(),
      type: 'animate_create',
      fields: {
        target: 'vec_proj',
        duration: 1.0,
      },
    });
    actions.push({
      id: uid(),
      type: 'tex_create',
      fields: {
        name: 'dot_label',
        text: `\\vec{u} \\cdot \\vec{v} = ${dotVal.toFixed(2)}`,
        color: '#4ade80',
        scale: 0.8,
      },
    });
  } else {
    const cross = cross3D(u, v);
    actions.push({
      id: uid(),
      type: 'arrow_create',
      fields: {
        name: 'vec_cross',
        start: '0,0,0',
        end: `${cross.x.toFixed(2)},${cross.y.toFixed(2)},${cross.z.toFixed(2)}`,
        color: '#c084fc',
      },
    });
    actions.push({
      id: uid(),
      type: 'animate_create',
      fields: {
        target: 'vec_cross',
        duration: 1.0,
      },
    });
    actions.push({
      id: uid(),
      type: 'tex_create',
      fields: {
        name: 'cross_label',
        text: `\\vec{w} = \\vec{u} \\times \\vec{v} = (${cross.x.toFixed(1)}, ${cross.y.toFixed(1)}, ${cross.z.toFixed(1)})`,
        color: '#c084fc',
        scale: 0.8,
      },
    });
  }

  // 7. Wait 2 seconds
  actions.push({
    id: uid(),
    type: 'wait',
    fields: {
      duration: 2.0,
    },
  });

  const nextProject: Project = {
    ...project,
    scene: {
      ...project.scene,
      dimension: '3d',
    },
    actions: [...project.actions, ...actions],
  };

  return { project: nextProject, actionCount: actions.length };
}
