import type { Dimension, GraphEdge, GraphNode, Project, SceneObject } from './types';

const object = (id: string, name: string, kind: SceneObject['kind'], color: string, rest: Partial<SceneObject> = {}): SceneObject => ({ id, name, kind, color, visible: true, x: 0, y: 0, z: 0, scale: 1, rotation: 0, ...rest });
const edge = (source: string, target: string, input: 'a' | 'b' = 'a'): GraphEdge => ({ id: `e_${source}_${target}_${input}`, source, target, input });
const binding = (id: string, label: string, objectId: string, property: GraphNode['property'], x: number, y: number): GraphNode => ({ id, kind: 'binding', label, objectId, property, position: { x, y } });

export function createBlank(dimension: Dimension): Project {
  return {
    version: 1, id: `anyvis_${Date.now().toString(36)}`, name: dimension === '2d' ? '新的二维课件' : '新的三维课件', dimension,
    duration: 12, parameters: [{ id: 'value', name: '数值', value: 1, min: 0, max: 5, step: 0.01, color: '#b5f36c' }],
    objects: [], nodes: [], edges: [], clips: [], cues: [],
    code: '// 每帧执行：t 为时间，params 为参数表，objects 为当前场景对象。\n// 例如：return objects.map(o => o.kind === \'cube\' ? { ...o, rotation: t } : o);\nreturn objects;', codeEnabled: false,
  };
}

export function createDemo(dimension: Dimension): Project {
  const project = createBlank(dimension);
  project.id = `demo_${dimension}_${Date.now().toString(36)}`;
  project.name = dimension === '2d' ? '单位圆与正弦波' : '空间轨道与旋转';
  project.parameters = [
    { id: 'radius', name: '半径', value: 1.4, min: 0.3, max: 2.2, step: 0.01, color: '#b5f36c' },
    { id: 'speed', name: '角速度', value: 0.8, min: 0.1, max: 2, step: 0.01, color: '#9e8dff' },
    { id: 'phase', name: '相位', value: 0, min: -Math.PI, max: Math.PI, step: 0.01, color: '#ffbe77' },
  ];
  project.nodes = [
    { id: 'clock', kind: 'time', label: '场景时间', position: { x: 30, y: 35 } },
    { id: 'speed_node', kind: 'parameter', label: '角速度', parameterId: 'speed', position: { x: 30, y: 175 } },
    { id: 'radius_node', kind: 'parameter', label: '半径', parameterId: 'radius', position: { x: 260, y: 360 } },
    { id: 'angle', kind: 'formula', label: '转过的角度', expression: 'a * b + phase', position: { x: 280, y: 50 } },
    { id: 'cosine', kind: 'formula', label: '水平位置', expression: 'b * cos(a)', position: { x: 540, y: 20 } },
    { id: 'sine', kind: 'formula', label: '竖直位置', expression: 'b * sin(a)', position: { x: 540, y: 220 } },
    binding('point_x', '运动点 · X', 'point', 'x', 800, 20),
    binding('point_y', '运动点 · Y', 'point', 'y', 800, 200),
  ];
  project.edges = [edge('clock', 'angle'), edge('speed_node', 'angle', 'b'), edge('angle', 'cosine'), edge('angle', 'sine'), edge('radius_node', 'cosine', 'b'), edge('radius_node', 'sine', 'b'), edge('cosine', 'point_x'), edge('sine', 'point_y')];
  project.clips = [{ id: 'radius_clip', parameterId: 'radius', start: 0, duration: 12, from: 1, to: 1.8, easing: 'smooth' }];
  project.cues = [
    { id: 'explore_radius', time: 4, title: '改变半径，会发生什么？', description: '拖动右侧「半径」滑块，观察运动点与波形的变化。试着找出哪些量保持不变。准备好后继续播放。' },
    { id: 'explore_speed', time: 8, title: '探索角速度与相位', description: '调整「角速度」和「相位」，比较波形间距与当前位置。参数调整会覆盖动画轨道；点击参数旁的重置按钮可交还给时间轴。' },
  ];
  if (dimension === '2d') {
    project.objects = [
      object('circle', '参考圆', 'circle', '#b5f36c', { scale: 1.4 }),
      object('vector', '旋转向量', 'vector', '#b5f36c', { x: 1.4 }),
      object('point', '运动点', 'point', '#ffbe77', { x: 1.4, scale: 0.13 }),
      object('wave', '正弦曲线', 'curve', '#9e8dff', { x: 3, expression: 'radius * sin(speed * x + phase)' }),
    ];
    project.nodes.push(binding('circle_scale', '参考圆 · 半径', 'circle', 'scale', 540, 430), binding('vector_x', '向量 · X', 'vector', 'x', 1050, 20), binding('vector_y', '向量 · Y', 'vector', 'y', 1050, 200));
    project.edges.push(edge('radius_node', 'circle_scale'), edge('cosine', 'vector_x'), edge('sine', 'vector_y'));
  } else {
    project.objects = [
      object('cube', '旋转立方体', 'cube', '#9e8dff', { scale: 0.8 }),
      object('circle', '轨道圆', 'circle', '#b5f36c', { scale: 1.4 }),
      object('point', '轨道球', 'sphere', '#ffbe77', { x: 1.4, scale: 0.2 }),
    ];
    project.nodes.push(binding('cube_rotation', '立方体 · 旋转', 'cube', 'rotation', 1050, 20), binding('circle_scale', '轨道圆 · 半径', 'circle', 'scale', 540, 430), { id: 'height', kind: 'formula', label: '空间起伏', expression: '0.5 * sin(2 * a)', position: { x: 800, y: 430 } }, binding('point_z', '轨道球 · Z', 'point', 'z', 1050, 430));
    project.edges.push(edge('angle', 'cube_rotation'), edge('radius_node', 'circle_scale'), edge('angle', 'height'), edge('height', 'point_z'));
    project.cues[0].description = '拖动半径参数，观察轨道球的位置。可拖动画面旋转视角，滚轮缩放，检查三维空间中的运动。';
    project.cues[1].description = '改变角速度或相位，实时比较轨道球与立方体的姿态。完成探索后继续播放。';
  }
  return project;
}
