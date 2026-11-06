import type { Action, FieldValue, Project } from '../core/types.ts';
import { createAction } from '../core/catalog.ts';
import type { StudioTemplate } from './types.ts';
export type { StudioTemplate } from './types.ts';

const palette = { teal: '#64D9C1', gold: '#F2CB80', violet: '#AA9CF4', white: '#E5EDF8', muted: '#8494AF', grid: '#40516C', background: '#0B1020' };

function builder(templateId: string) {
  let nextId = 0;
  const a = (type: string, fields: Record<string, FieldValue> = {}, children?: Action[]): Action => {
    const result = createAction(type, fields);
    result.id = `${templateId}-${++nextId}`;
    if (children) result.children = children;
    return result;
  };
  const text = (name: string, content: string, x: number, y: number, fontSize = 25, color = palette.white, duration = 0.7) => a('text', { name, text: content, x, y, fontSize, color, duration });
  const heading = (title: string, subtitle: string): Action[] => [
    text('标题', title, 0, 3.05, 35, palette.white, 0.9),
    text('副标题', subtitle, 0, 2.45, 20, palette.muted, 0.6),
  ];
  const project = (name: string, actions: Action[], dimension: '2d' | '3d' = '2d'): Project => ({
    schemaVersion: 2,
    id: `template-${templateId}`,
    name,
    scene: { dimension, background: palette.background, width: 1280, height: 720, fps: 30 },
    actions,
  });
  return { a, text, heading, project };
}

function firstAnimation(): Project {
  const { a, text, heading, project } = builder('first-animation');
  return project('把想法，变成动画', [
    ...heading('把想法，变成动画', '从一个圆开始，认识对象、形变与动作'),
    a('circle', { name: '主图形', radius: 1.15, color: palette.teal, fill: 0.14, y: -0.15, duration: 1.4 }),
    a('wait', { duration: 0.7 }),
    a('square', { name: '方形目标', side: 2.1, color: palette.violet, fill: 0.16, y: -0.15, appear: 'hidden' }),
    a('transform', { target: '主图形', destination: '方形目标', duration: 1.8 }),
    a('rotate', { target: '主图形', angle: 45, duration: 1.4 }),
    a('scale', { target: '主图形', factor: 1.15, duration: 1.2 }),
    a('parallel', {}, [
      a('move', { target: '主图形', x: -2.8, y: -0.15, duration: 1.2 }),
      a('fade_out', { target: '副标题', duration: 0.8 }),
    ]),
    text('步骤一', '画出来', 2.6, 0.85, 29, palette.teal, 0.65),
    text('步骤二', '变一变', 2.6, -0.05, 29, palette.violet, 0.65),
    text('步骤三', '再动起来', 2.6, -0.95, 29, palette.gold, 0.65),
    a('circumscribe', { target: '步骤三', duration: 1 }),
    text('结语', '每一步，都是可以修改的积木', 0, -2.7, 21, palette.muted, 0.7),
    a('wait', { duration: 2.5 }),
  ]);
}

function unitCircle(): Project {
  const { a, text, heading, project } = builder('unit-circle');
  return project('从单位圆，到正弦曲线', [
    ...heading('从单位圆，到正弦曲线', '同一个角度，连接圆周运动与周期变化'),
    a('tracker', { name: 'theta', value: 0 }),
    a('circle', { name: '单位圆', radius: 1.15, x: -3.7, y: -0.2, color: palette.teal, fill: 0.035, duration: 1 }),
    a('line', { name: '圆的横轴', x1: -5.1, y1: -0.2, x2: -2.3, y2: -0.2, color: palette.grid, duration: 0.3 }),
    a('line', { name: '圆的纵轴', x1: -3.7, y1: -1.6, x2: -3.7, y2: 1.2, color: palette.grid, duration: 0.3 }),
    a('axes', { name: '波形坐标系', xMin: 0, xMax: 6.283185307179586, yMin: -1.25, yMax: 1.25, xLength: 5.4, yLength: 2.875, x: 2.65, y: -0.2, color: palette.grid, duration: 1 }),
    a('dynamic_dot', { name: '圆周动点', xExpr: '-3.7+1.15*cos(theta)', yExpr: '-0.2+1.15*sin(theta)', color: palette.gold, radius: 0.075, duration: 0.5 }),
    a('dynamic_dot', { name: '波形动点', axes: '波形坐标系', xExpr: 'theta', yExpr: 'sin(theta)', color: palette.teal, radius: 0.065, duration: 0.5 }),
    a('dynamic_line', { name: '旋转半径', x1Expr: '-3.7', y1Expr: '-0.2', x2Expr: '-3.7+1.15*cos(theta)', y2Expr: '-0.2+1.15*sin(theta)', color: palette.gold, duration: 0.5 }),
    a('trace', { name: '正弦轨迹', target: '波形动点', color: palette.teal, width: 4 }),
    text('圆标签', '圆周运动', -3.7, -2.1, 23, palette.teal, 0.5),
    text('波形标签', '纵坐标 = sin θ', 2.65, -2.1, 23, palette.gold, 0.5),
    a('animate_value', { target: 'theta', value: 6.283185307179586, duration: 7, easing: 'linear' }),
    text('解释', '一周旋转，对应一个完整周期', 0, -3.05, 22, palette.muted, 0.6),
    a('wait', { duration: 1.5 }),
  ]);
}

function tangent(): Project {
  const { a, text, heading, project } = builder('tangent');
  return project('让割线，慢慢成为切线', [
    ...heading('让割线，慢慢成为切线', '当两个点靠近，平均变化率趋于瞬时变化率'),
    a('tracker', { name: 'h', value: 1.8 }),
    a('axes', { name: '坐标系', xMin: -0.5, xMax: 4.1, yMin: -0.5, yMax: 4.6, xLength: 7.8, yLength: 4.2, x: -1.2, y: -0.35, color: palette.grid, duration: 1 }),
    a('function_plot', { name: '抛物线', axes: '坐标系', expression: 'x^2/3', xMin: 0, xMax: 3.65, color: palette.teal, duration: 1.2 }),
    a('dynamic_dot', { name: '固定点', axes: '坐标系', xExpr: '1.5', yExpr: '0.75', color: palette.gold, radius: 0.07, duration: 0.5 }),
    a('dynamic_dot', { name: '靠近的点', axes: '坐标系', xExpr: '1.5+h', yExpr: '(1.5+h)^2/3', color: palette.gold, radius: 0.07, duration: 0.5 }),
    a('dynamic_line', { name: '割线', axes: '坐标系', x1Expr: '0.9', y1Expr: '0.75+(1+h/3)*(-0.6)', x2Expr: '3.3', y2Expr: '0.75+(1+h/3)*1.8', color: palette.gold, duration: 0.6 }),
    a('tangent', { name: '目标切线', axes: '坐标系', expression: 'x^2/3', at: '1.5', length: 4.8, color: palette.violet, appear: 'hidden' }),
    text('间距标签', '两点间距 h', 4.25, 0.8, 23, palette.muted, 0.5),
    a('dynamic_number', { name: '间距数值', parameter: 'h', places: 2, fontSize: 44, x: 4.25, y: -0.1, color: palette.gold, duration: 0.5 }),
    a('animate_value', { target: 'h', value: 0.02, duration: 5, easing: 'smooth' }),
    a('fade_in', { target: '目标切线', duration: 0.8 }),
    text('结论', '割线斜率  →  导数', 0, -3.05, 25, palette.violet, 0.7),
    a('wait', { duration: 2 }),
  ]);
}

function formula(): Project {
  const { a, text, heading, project } = builder('formula');
  return project('看见平方展开', [
    ...heading('看见平方展开', '相同符号自动匹配，让推导保持连续'),
    a('formula', { name: '起始公式', tex: '{{(}} {{a}} + {{b}} {{)}}^2', fontSize: 64, y: 0.3, color: palette.white, duration: 1.5 }),
    a('wait', { duration: 0.8 }),
    a('formula', { name: '乘积公式', tex: '{{(}} {{a}} + {{b}} {{)}} {{(}} {{a}} + {{b}} {{)}}', fontSize: 64, y: 0.3, color: palette.white, appear: 'hidden' }),
    a('matching_tex', { target: '起始公式', destination: '乘积公式', duration: 2 }),
    text('分配提示', '每一项，分别相乘', 0, -1.3, 23, palette.muted, 0.7),
    a('formula', { name: '展开公式', tex: '{{a}}^2 + {{a}} {{b}} + {{b}} {{a}} + {{b}}^2', fontSize: 60, y: 0.3, color: palette.white, appear: 'hidden' }),
    a('matching_tex', { target: '乘积公式', destination: '展开公式', duration: 2 }),
    a('wait', { duration: 0.8 }),
    a('formula', { name: '结果公式', tex: '{{a}}^2 + 2 {{a}} {{b}} + {{b}}^2', fontSize: 64, y: 0.3, color: palette.teal, appear: 'hidden' }),
    a('matching_tex', { target: '展开公式', destination: '结果公式', duration: 2 }),
    a('fade_out', { target: '分配提示', duration: 0.4 }),
    text('结论', '合并同类项，得到熟悉的恒等式', 0, -1.3, 23, palette.gold, 0.7),
    a('circumscribe', { target: '结果公式', duration: 1.2 }),
    a('wait', { duration: 2 }),
  ]);
}

function linearMap(): Project {
  const { a, text, heading, project } = builder('linear-map');
  return project('矩阵如何改变空间', [
    ...heading('矩阵如何改变空间', '观察剪切变换：水平坐标加上纵坐标'),
    a('plane', { name: '坐标网格', xMin: -5, xMax: 5, yMin: -2, yMax: 2, color: '#263752', y: 0, duration: 1.2 }),
    a('square', { name: '参考正方形', side: 1.6, x: 0.8, y: 0.8, color: palette.teal, fill: 0.17, duration: 0.8 }),
    a('arrow', { name: '水平向量', x1: 0, y1: 0, x2: 1.6, y2: 0, color: palette.gold, duration: 0.5 }),
    a('arrow', { name: '竖直向量', x1: 0, y1: 0, x2: 0, y2: 1.6, color: palette.violet, duration: 0.5 }),
    a('matrix', { name: '变换矩阵', values: '[[1,1],[0,1]]', scale: 0.7, x: -4.5, y: 0.6, color: palette.white, duration: 0.8 }),
    text('矩阵标签', '剪切矩阵 A', -4.5, -0.85, 20, palette.muted, 0.4),
    a('group', { name: '待变换空间', members: '坐标网格,参考正方形,水平向量,竖直向量' }),
    a('wait', { duration: 0.7 }),
    a('apply_matrix', { target: '待变换空间', matrix: '[[1,1],[0,1]]', duration: 3 }),
    text('观察', '直线仍是直线，平行关系保持不变', 0, -3.05, 22, palette.teal, 0.7),
    a('wait', { duration: 1.5 }),
    a('apply_matrix', { target: '待变换空间', matrix: '[[1,-1],[0,1]]', duration: 2.5 }),
    text('恢复', '施加逆变换，回到原来的空间', 0, -3.55, 20, palette.muted, 0.6),
    a('wait', { duration: 1.5 }),
  ]);
}

function bfs(): Project {
  const { a, text, heading, project } = builder('bfs');
  return project('BFS：一层一层地探索', [
    ...heading('BFS：一层一层地探索', '从 A 出发，同层按字母顺序访问'),
    a('graph', { name: '示例图', vertices: 'A,B,C,D,E,F,G', edges: 'A-C,A-B,B-E,B-D,C-G,C-F', layout: 'tree', scale: 1.8, color: palette.grid, appear: 'hidden' }),
    a('set_position', { target: '示例图', x: 0, y: -0.25 }),
    a('create', { target: '示例图', duration: 1.5 }),
    text('访问记录', '访问顺序', -4.75, 0.4, 22, palette.muted, 0.5),
    text('第一层', 'A', -4.75, -0.2, 28, palette.gold, 0.4),
    a('graph_highlight', { target: '示例图', vertex: 'A', color: palette.gold, duration: 0.7 }),
    a('wait', { duration: 0.4 }),
    text('第二层', 'B   C', -4.75, -0.9, 28, palette.teal, 0.5),
    a('graph_highlight', { target: '示例图', vertex: 'B', color: palette.teal, duration: 0.7 }),
    a('graph_highlight', { target: '示例图', vertex: 'C', color: palette.teal, duration: 0.7 }),
    a('wait', { duration: 0.4 }),
    text('第三层', 'D E F G', -4.75, -1.6, 24, palette.violet, 0.5),
    a('graph_highlight', { target: '示例图', vertex: 'D', color: palette.violet, duration: 0.6 }),
    a('graph_highlight', { target: '示例图', vertex: 'E', color: palette.violet, duration: 0.6 }),
    a('graph_highlight', { target: '示例图', vertex: 'F', color: palette.violet, duration: 0.6 }),
    a('graph_highlight', { target: '示例图', vertex: 'G', color: palette.violet, duration: 0.6 }),
    text('层级一', '第 0 层', 4.7, 0.6, 23, palette.gold, 0.4),
    text('层级二', '第 1 层', 4.7, -0.2, 23, palette.teal, 0.4),
    text('层级三', '第 2 层', 4.7, -1, 23, palette.violet, 0.4),
    text('算法解释', '队列保证：先发现的顶点先被展开', 0, -3.05, 23, palette.muted, 0.7),
    a('wait', { duration: 2 }),
  ]);
}

function surface(): Project {
  const { a, project } = builder('surface');
  return project('走进三维函数的世界', [
    a('camera', { phi: 65, theta: -45, zoom: 0.68 }),
    a('text', { name: '标题', text: '走进三维函数的世界', fontSize: 35, y: 3.05, color: palette.white, appear: 'hidden' }),
    a('fixed_in_frame', { target: '标题' }),
    a('write', { target: '标题', duration: 1 }),
    a('text', { name: '副标题', text: 'z = sin(x) cos(y)', fontSize: 25, y: 2.4, color: palette.teal, appear: 'hidden' }),
    a('fixed_in_frame', { target: '副标题' }),
    a('write', { target: '副标题', duration: 0.7 }),
    a('three_axes', { name: '空间坐标系', range: 3, length: 6, duration: 1 }),
    a('surface', { name: '波浪曲面', xExpr: 'u', yExpr: 'v', zExpr: 'sin(u)*cos(v)', uMin: -2.7, uMax: 2.7, vMin: -2.7, vMax: 2.7, resolution: 18, color: palette.teal, duration: 1.8 }),
    a('ambient_rotation', { rate: 0.16 }),
    a('wait', { duration: 5 }),
    a('ambient_rotation', { rate: 0 }),
    a('camera', { phi: 35, theta: 35, zoom: 0.60, duration: 2.2 }),
    a('text', { name: '结语', text: '换一个角度，看见同一个结构', fontSize: 22, y: -3.1, color: palette.muted, appear: 'hidden' }),
    a('fixed_in_frame', { target: '结语' }),
    a('write', { target: '结语', duration: 0.8 }),
    a('wait', { duration: 1.5 }),
  ], '3d');
}

const entries: Omit<StudioTemplate, 'thumbnailKind' | 'thumbnail' | 'previewUrl' | 'posterUrl' | 'previewKind' | 'previewEngine'>[] = [
  { id: 'first-animation', title: '第一段动画', description: '画一个圆，变成方形，再让它动起来。', category: '入门', duration: 15.35, color: palette.violet, icon: 'shapes', project: firstAnimation() },
  { id: 'unit-circle', title: '单位圆与正弦', description: '一个参数，同时驱动圆周运动与波形轨迹。', category: '数学', duration: 15.7, color: palette.teal, icon: 'waves', project: unitCircle() },
  { id: 'tangent', title: '割线趋近切线', description: '改变两点间距，直观看见导数的来源。', category: '数学', duration: 14.8, color: palette.gold, icon: 'activity', project: tangent() },
  { id: 'formula', title: '公式连续推导', description: '用符号匹配变形，呈现平方公式的展开。', category: '数学', duration: 15.6, color: palette.violet, icon: 'sigma', project: formula() },
  { id: 'linear-map', title: '矩阵改变空间', description: '让网格与向量一起剪切，再施加逆变换。', category: '数学', duration: 16.2, color: palette.teal, icon: 'grid', project: linearMap() },
  { id: 'bfs', title: '图的广度优先搜索', description: '逐步演示给定图的 BFS 访问次序与分层。', category: '算法', duration: 14.1, color: palette.gold, icon: 'network', project: bfs() },
  { id: 'surface', title: '三维函数曲面', description: '创建参数曲面，用环绕镜头观察空间结构。', category: '三维', duration: 14, color: palette.teal, icon: 'box', project: surface() },
];

export const templateCatalog: StudioTemplate[] = entries.map((entry) => ({
  ...entry,
  thumbnail: `/templates/${entry.id}.svg`,
  thumbnailKind: 'illustration',
  previewUrl: `/templates/rendered/${entry.id}.webm`,
  posterUrl: `/templates/rendered/${entry.id}.png`,
  previewKind: 'prerendered-native-manim',
  previewEngine: 'Manim Community 0.20.1',
}));

/** A template is copied before editing; shared catalogue data remains immutable. */
export function getTemplate(id: string): Project {
  const entry = templateCatalog.find((template) => template.id === id);
  if (!entry) throw new Error(`找不到模板：${id}`);
  const project = structuredClone(entry.project);
  project.id = crypto.randomUUID();
  return project;
}
