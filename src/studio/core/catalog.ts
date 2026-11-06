import type { Action, BlockDefinition, FieldDefinition, FieldValue } from './types.ts';

/** These are concrete catalogue kinds, not Python inheritance categories. */
const VISUAL_OBJECT_KINDS = ['mobject', 'text', 'formula', 'number', 'axes', 'number_line', 'curve', 'matrix', 'graph', 'axes3d'];
const NUMERIC_HINTS: Record<string, string> = {
  fill: '0 表示完全透明，1 表示完全不透明。',
  opacity: '0 表示完全透明，1 表示完全不透明。',
  fontSize: '文字与公式的字号；字号越大，画面中显示越大。',
  x: '舞台横坐标；0 位于画面中心，正数向右。',
  y: '舞台纵坐标；0 位于画面中心，正数向上。',
  z: '舞台深度坐标；二维作品通常保持为 0。',
  dx: '横向移动或偏移距离；负数表示向左。',
  dy: '纵向移动或偏移距离；负数表示向下。',
  dz: '深度方向移动距离；二维作品通常保持为 0。',
  buff: '对象边缘之间的距离，单位与舞台坐标相同。',
  resolution: '每个参数方向的网格数；精度越高，渲染所需时间越长。',
};
const n = (name: string, label: string, value = 1, min = -1000, max = 1000, step = 0.1): FieldDefinition => {
  const field: FieldDefinition = { name, label, type: 'number', default: value, min, max, step };
  if (NUMERIC_HINTS[name]) field.description = NUMERIC_HINTS[name];
  if (name === 'duration') {
    field.label = label === '秒' ? '时长' : '用时';
    field.suffix = '秒';
    if (label.includes('0 为立即')) field.description = '设为 0 时立即定位镜头；大于 0 时播放镜头动画。';
  } else if (label.includes('（度）')) {
    field.label = label.replace('（度）', '');
    field.suffix = '°';
    field.description = '角度单位为度，不需要输入度数符号。';
  } else if (label.startsWith('弧度 / 秒')) {
    field.label = '环绕速度';
    field.suffix = '弧度/秒';
    field.description = '设为 0 时停止环绕；正负数控制相反的旋转方向。';
  } else if (name === 'factor' || name === 'zoom') {
    field.label = '缩放';
    field.suffix = '倍';
  } else if (name === 'count') {
    field.label = '重复';
    field.suffix = '次';
  }
  if (name === 'fill') field.label = '填充不透明度';
  if (name === 'opacity') field.label = '不透明度';
  return field;
};
const t = (name: string, label: string, value = ''): FieldDefinition => ({ name, label, type: 'text', default: value });
const e = (name: string, label: string, value: string): FieldDefinition => ({ name, label, type: 'expression', default: value, reference: 'expression', description: '输入数学表达式，可引用已声明的参数；乘法请写 *，幂可写 ^。' });
const o = (name = 'target', label = '对象', value = '圆', objectKinds = VISUAL_OBJECT_KINDS): FieldDefinition => ({ name, label, type: 'object', default: value, reference: 'object', objectKinds: [...objectKinds] });
const optionalAxes = (): FieldDefinition => ({ ...o('axes', '使用坐标', '', ['axes']), optional: true, emptyLabel: '画面坐标（不使用坐标系）', description: '选择坐标系时按它的数学坐标定位；选择画面坐标时直接使用舞台坐标。' });
const c = (name = 'color', label = '颜色', value = '#60A5FA'): FieldDefinition => ({ name, label, type: 'color', default: value });
const s = (name: string, label: string, value: string, options: [string, string][]): FieldDefinition => ({ name, label, type: 'select', default: value, options });
const position = () => [n('x', '横坐标', 0, -100, 100), n('y', '纵坐标', 0, -100, 100), n('z', '深度', 0, -100, 100)];
const duration = () => n('duration', '用时', 1, 0.05, 120, 0.1);
const rate = () => s('easing', '节奏', 'smooth', [['平滑', 'smooth'], ['匀速', 'linear'], ['慢入', 'ease_in_sine'], ['慢出', 'ease_out_sine'], ['来回', 'there_and_back']]);
const timing = () => [duration(), rate()];
const appear = (kind = 'create') => [{ ...s('appear', '显示方式', kind, [['绘制动画', 'create'], ['淡入动画', 'fade'], ['书写动画', 'write'], ['直接显示（无动画）', 'none'], ['暂不显示', 'hidden']]), description: '绘制、淡入和书写会播放出场动画；直接显示不耗时；暂不显示只创建对象，可用作变形目标。' }, { ...duration(), description: '仅在选择绘制、淡入或书写动画时使用此时长。' }];
const COLORS: Record<string, string> = { '图形': '#3B82F6', '文字公式': '#8B5CF6', '坐标函数': '#0D9488', '数据结构': '#4F46E5', '三维': '#6366F1', '动画': '#DB2777', '样式布局': '#D97706', '参数关系': '#059669', '编排': '#B45309', '高级': '#64748B' };
const block = (type: string, label: string, category: string, fields: FieldDefinition[], tooltip: string, extra: Partial<BlockDefinition> = {}): BlockDefinition => ({ type, label, category, fields, tooltip, colour: COLORS[category], ...extra });
const shape = (type: string, label: string, specific: FieldDefinition[], tooltip: string) => block(type, label, '图形', [t('name', '命名', label), ...specific, c(), n('fill', '填充', type === 'dot' ? 1 : 0.15, 0, 1), ...position(), ...appear()], tooltip, { createsObject: true, objectKind: 'mobject' });
const animated = (type: string, label: string, specific: FieldDefinition[], tooltip: string) => block(type, label, '动画', [o('target', type === 'matching_tex' ? '原公式' : '对象', type === 'matching_tex' ? '公式' : '圆', type === 'matching_tex' ? ['formula'] : VISUAL_OBJECT_KINDS), ...specific, ...timing()], tooltip);

export const BLOCK_CATALOG: BlockDefinition[] = [
  shape('circle', '圆', [n('radius', '半径', 1, 0.01, 50)], '创建并画出一个圆。选择“暂不显示”可把它用作变形目标。'),
  shape('square', '正方形', [n('side', '边长', 2, 0.01, 50)], '创建正方形，边长使用舞台坐标。'),
  shape('rectangle', '矩形', [n('width', '宽', 3, 0.01, 50), n('height', '高', 1.5, 0.01, 50)], '创建矩形。'),
  shape('rounded_rectangle', '圆角矩形', [n('width', '宽', 3, 0.01, 50), n('height', '高', 1.5, 0.01, 50), n('corner', '圆角半径', 0.2, 0.01, 10)], '创建圆角矩形。'),
  shape('triangle', '三角形', [{ ...n('scale', '缩放', 1, 0.01, 20), suffix: '倍' }], '创建等边三角形。'),
  shape('polygon', '正多边形', [n('sides', '边数', 6, 3, 30, 1), n('radius', '半径', 1.2, 0.01, 50)], '按边数创建正多边形。'),
  shape('ellipse', '椭圆', [n('width', '宽', 3, 0.01, 50), n('height', '高', 1.5, 0.01, 50)], '创建椭圆。'),
  shape('dot', '点', [n('radius', '半径', 0.08, 0.01, 10)], '创建一个可动画的点。'),
  block('line', '线段', '图形', [t('name', '命名', '线段'), n('x1', '起点 x', -2), n('y1', '起点 y', 0), n('x2', '终点 x', 2), n('y2', '终点 y', 0), c(), ...appear()], '在两个舞台坐标之间创建线段。', { createsObject: true, objectKind: 'mobject' }),
  block('arrow', '箭头', '图形', [t('name', '命名', '箭头'), n('x1', '起点 x', 0), n('y1', '起点 y', 0), n('x2', '终点 x', 2), n('y2', '终点 y', 1), c(), ...appear()], '创建两点之间的箭头。', { createsObject: true, objectKind: 'mobject' }),
  shape('arc', '圆弧', [n('radius', '半径', 1, 0.01, 50), n('start', '起始角（度）', 0, -3600, 3600), n('angle', '角度（度）', 90, -3600, 3600)], '按半径、起始角与角度创建弧线。'),
  block('text', '文字', '文字公式', [t('name', '命名', '标题'), t('text', '内容', '让数学动起来'), n('fontSize', '字号', 42, 8, 180, 1), c('color', '颜色', '#F1F5F9'), ...position(), ...appear('write')], '使用可用的中文字体，以真实 Manim Write 书写。', { createsObject: true, objectKind: 'text' }),
  block('formula', '数学公式', '文字公式', [t('name', '命名', '公式'), t('tex', 'LaTeX', 'e^{i\\pi}+1=0'), n('fontSize', '字号', 48, 8, 180, 1), c('color', '颜色', '#F1F5F9'), ...position(), ...appear('write')], '输入 LaTeX 数学公式；使用 MathTex，需公式工具链。', { createsObject: true, objectKind: 'formula' }),
  block('decimal', '数字', '文字公式', [t('name', '命名', '数值'), n('value', '数值', 3.14), n('places', '小数位', 2, 0, 8, 1), n('fontSize', '字号', 40, 8, 180, 1), c('color', '颜色', '#FBBF24'), ...position(), ...appear('write')], '创建具有固定小数位的数字。', { createsObject: true, objectKind: 'number' }),
  block('axes', '坐标系', '坐标函数', [t('name', '命名', '坐标系'), n('xMin', 'x 最小', -4), n('xMax', 'x 最大', 4), n('yMin', 'y 最小', -2), n('yMax', 'y 最大', 3), n('xLength', '宽', 9, 1, 30), n('yLength', '高', 5, 1, 20), c('color', '颜色', '#94A3B8'), ...position(), ...appear()], '创建数学坐标系。函数和点通过它完成数学坐标到舞台坐标的转换。', { createsObject: true, objectKind: 'axes' }),
  block('plane', '网格坐标系', '坐标函数', [t('name', '命名', '坐标系'), n('xMin', 'x 最小', -6), n('xMax', 'x 最大', 6), n('yMin', 'y 最小', -3), n('yMax', 'y 最大', 3), c('color', '颜色', '#334155'), ...position(), ...appear()], '创建带网格的 NumberPlane。', { createsObject: true, objectKind: 'axes' }),
  block('number_line', '数轴', '坐标函数', [t('name', '命名', '数轴'), n('min', '最小', -5), n('max', '最大', 5), n('step', '刻度间隔', 1, 0.01, 100), n('length', '长度', 10, 1, 30), c('color', '颜色', '#94A3B8'), ...position(), ...appear()], '创建带数值标签的数轴。', { createsObject: true, objectKind: 'number_line' }),
  block('function_plot', '函数图像', '坐标函数', [t('name', '命名', '曲线'), o('axes', '坐标系', '坐标系', ['axes']), e('expression', 'y =', 'sin(x)'), n('xMin', 'x 从', -4), n('xMax', 'x 到', 4), c('color', '颜色', '#38BDF8'), ...appear()], '绘制数学函数。支持 sin、cos、exp、log、sqrt、abs、pi 和幂运算；可引用已声明参数。', { createsObject: true, objectKind: 'curve' }),
  block('parametric_curve', '参数曲线', '坐标函数', [t('name', '命名', '参数曲线'), e('xExpr', 'x(t)', '2*cos(t)'), e('yExpr', 'y(t)', 'sin(2*t)'), e('zExpr', 'z(t)', '0'), n('tMin', 't 从', 0), n('tMax', 't 到', 6.2832), c(), ...appear()], '通过 t 的三个表达式创建二维或三维参数曲线。', { createsObject: true, objectKind: 'curve' }),
  block('area', '曲线下方面积', '坐标函数', [t('name', '命名', '面积'), o('axes', '坐标系', '坐标系', ['axes']), o('curve', '函数曲线', '曲线', ['curve']), n('xMin', '左端', 0), n('xMax', '右端', 2), c('color', '颜色', '#34D399'), n('opacity', '透明度', 0.4, 0, 1), ...appear('fade')], '填充函数图像与横轴之间的区域。', { createsObject: true, objectKind: 'mobject' }),
  block('riemann', '黎曼矩形', '坐标函数', [t('name', '命名', '黎曼和'), o('axes', '坐标系', '坐标系', ['axes']), o('curve', '函数曲线', '曲线', ['curve']), n('xMin', '左端', 0), n('xMax', '右端', 3), n('dx', '矩形宽度', 0.25, 0.02, 5), c('color', '颜色', '#34D399'), ...appear()], '用矩形近似曲线下方面积，最多生成 400 个矩形。', { createsObject: true, objectKind: 'mobject' }),
  block('tangent', '切线', '坐标函数', [t('name', '命名', '切线'), o('axes', '坐标系', '坐标系', ['axes']), e('expression', '函数', 'x^2/3'), e('at', '切点 x', 'a'), n('length', '长度', 4, 0.1, 30), c('color', '颜色', '#FBBF24'), ...appear()], '根据函数与切点创建动态切线；切点可以引用参数。采用中心差分计算斜率。', { createsObject: true, objectKind: 'mobject' }),
  block('matrix', '矩阵', '数据结构', [t('name', '命名', '矩阵'), { ...t('values', '矩阵元素', '[[1,2],[3,4]]'), editor: 'matrix', description: '在网格中填写数字或简短数学公式。所有行需要相同数量的元素。' }, { ...n('scale', '缩放', 0.8, 0.1, 4), suffix: '倍' }, c('color', '颜色', '#F1F5F9'), ...position(), ...appear('write')], '创建矩阵。元素是数字或数学字符串，不作为 Python 执行。', { createsObject: true, objectKind: 'matrix' }),
  block('graph', '图结构', '数据结构', [t('name', '命名', '图'), t('vertices', '顶点（逗号分隔）', 'A,B,C,D'), t('edges', '边（A-B,B-C）', 'A-B,B-C,C-D,D-A,A-C'), s('layout', '布局', 'circular', [['圆形', 'circular'], ['树形', 'tree']]), { ...n('scale', '布局大小', 2, 0.1, 5), description: '控制顶点之间的距离；数值越大，图占据的画面越大。' }, c(), ...appear()], '创建带标签的图；可选择圆形或树形布局。边使用已有顶点名称连接，树形布局要求连通且无环。', { createsObject: true, objectKind: 'graph' }),
  block('graph_highlight', '强调图顶点', '数据结构', [o('target', '图', '图', ['graph']), t('vertex', '顶点', 'A'), c('color', '颜色', '#FBBF24'), ...timing()], '改变图中指定顶点的颜色，用于算法步骤。'),
  block('bar_chart', '柱状图', '数据结构', [t('name', '命名', '柱状图'), t('values', '数值（逗号分隔）', '2,5,3,7'), n('width', '宽', 8, 1, 20), n('height', '高', 4, 1, 10), ...position(), ...appear()], '创建数值柱状图。', { createsObject: true, objectKind: 'mobject' }),
  block('tracker', '声明参数', '参数关系', [t('name', '参数名', 'a'), n('value', '初值', 0)], '声明 ValueTracker。参数名只能包含字母、数字或下划线，且不能与数学变量重名。', { createsObject: true, objectKind: 'tracker' }),
  block('animate_value', '改变参数', '参数关系', [o('target', '参数', 'a', ['tracker']), n('value', '变到', 3), ...timing()], '让参数随时间变化，绑定图形会自动更新。'),
  block('dynamic_dot', '随参数运动的点', '参数关系', [t('name', '命名', '动点'), optionalAxes(), e('xExpr', 'x =', '2*cos(a)'), e('yExpr', 'y =', '2*sin(a)'), e('zExpr', 'z =', '0'), n('radius', '半径', 0.08, 0.01, 2), c('color', '颜色', '#FBBF24'), ...appear('fade')], '用表达式绑定点的位置。留空坐标系时使用舞台坐标。', { createsObject: true, objectKind: 'mobject' }),
  block('dynamic_line', '随参数变化的线', '参数关系', [t('name', '命名', '动态线'), optionalAxes(), e('x1Expr', '起点 x', '0'), e('y1Expr', '起点 y', '0'), e('x2Expr', '终点 x', '2*cos(a)'), e('y2Expr', '终点 y', '2*sin(a)'), c('color', '颜色', '#FBBF24'), n('width', '线宽', 3, 0.1, 20), ...appear()], '用表达式绑定线段的两个端点；支持坐标系转换，适合半径、投影和割线。', { createsObject: true, objectKind: 'mobject' }),
  block('dynamic_plot', '随参数变化的函数', '参数关系', [t('name', '命名', '动态曲线'), o('axes', '坐标系', '坐标系', ['axes']), e('expression', 'y =', 'sin(a*x)'), n('xMin', 'x 从', -4), n('xMax', 'x 到', 4), c('color', '颜色', '#38BDF8'), ...appear()], '参数变化时重新生成函数图像。用于观察频率、振幅等参数影响。', { createsObject: true, objectKind: 'curve' }),
  block('dynamic_number', '显示参数数值', '参数关系', [t('name', '命名', '参数数值'), o('parameter', '参数', 'a', ['tracker']), n('places', '小数位', 2, 0, 8, 1), n('fontSize', '字号', 36, 8, 180, 1), c('color', '颜色', '#FBBF24'), ...position(), ...appear('fade')], '数值显示持续跟随一个参数更新。', { createsObject: true, objectKind: 'number' }),
  block('trace', '留下运动轨迹', '参数关系', [t('name', '命名', '轨迹'), o('target', '跟踪对象', '动点'), c('color', '颜色', '#FBBF24'), n('width', '线宽', 3, 0.1, 20)], '用 TracedPath 记录对象运动历史。轨迹依赖执行过程。', { createsObject: true, objectKind: 'mobject' }),
  block('follow', '文字跟随对象', '参数关系', [o('target', '跟随者', '标题'), o('leader', '目标', '动点'), n('dx', '横向偏移', 0), n('dy', '纵向偏移', 0.4)], '让标签持续跟随目标移动，直到清除更新关系。'),
  block('stop_updaters', '停止自动更新', '参数关系', [o()], '清除对象及子对象的更新器，保留当前画面。'),
  block('three_axes', '三维坐标系', '三维', [t('name', '命名', '三维坐标系'), n('range', '坐标范围', 3, 1, 20), n('length', '轴长度', 6, 1, 20), ...appear()], '创建三维坐标轴。需三维场景。', { createsObject: true, objectKind: 'axes3d', requires3d: true }),
  block('sphere', '球体', '三维', [t('name', '命名', '球'), n('radius', '半径', 1, 0.1, 10), c(), ...position(), ...appear('fade')], '创建带光照层次的球体。', { createsObject: true, objectKind: 'mobject', requires3d: true }),
  block('cube', '立方体', '三维', [t('name', '命名', '立方体'), n('side', '边长', 2, 0.1, 10), c(), ...position(), ...appear('fade')], '创建立方体。', { createsObject: true, objectKind: 'mobject', requires3d: true }),
  block('cylinder', '圆柱', '三维', [t('name', '命名', '圆柱'), n('radius', '半径', 1, 0.1, 10), n('height', '高度', 2, 0.1, 10), c(), ...position(), ...appear('fade')], '创建圆柱体。', { createsObject: true, objectKind: 'mobject', requires3d: true }),
  block('surface', '参数曲面', '三维', [t('name', '命名', '曲面'), e('xExpr', 'x(u,v)', 'u'), e('yExpr', 'y(u,v)', 'v'), e('zExpr', 'z(u,v)', 'sin(u)*cos(v)'), n('uMin', 'u 从', -3), n('uMax', 'u 到', 3), n('vMin', 'v 从', -3), n('vMax', 'v 到', 3), n('resolution', '网格精度', 20, 4, 40, 1), c('color', '颜色', '#60A5FA'), ...appear('fade')], '由两个参数的表达式构造曲面。精度越高渲染越慢。', { createsObject: true, objectKind: 'mobject', requires3d: true }),
  block('camera', '三维镜头', '三维', [n('phi', '俯仰角（度）', 65, 0, 180), n('theta', '方位角（度）', -45, -3600, 3600), n('zoom', '缩放', 0.9, 0.1, 5), n('duration', '用时（0 为立即）', 0, 0, 60)], '调整 ThreeDScene 的镜头。角度单位是度。', { requires3d: true }),
  block('ambient_rotation', '镜头自动环绕', '三维', [n('rate', '弧度 / 秒（0 停止）', 0.2, -5, 5)], '开始或停止相机持续环绕；后续动画和等待期间继续旋转。', { requires3d: true }),
  block('fixed_in_frame', '固定到屏幕', '三维', [o('target', '对象', '标题')], '将文字等对象固定在屏幕上，避免随三维镜头旋转。', { requires3d: true }),
  block('group', '组合对象', '样式布局', [t('name', '组合名', '组合'), { ...t('members', '成员', ''), reference: 'object-list', objectKinds: [...VISUAL_OBJECT_KINDS], description: '勾选已经创建的图形。组合共享这些对象，不会复制它们。' }], '创建共享成员的 VGroup；不复制对象，也不改变已有出场时间。', { createsObject: true, objectKind: 'mobject' }),
  block('copy', '复制对象', '样式布局', [t('name', '新名称', '副本'), o(), ...position(), ...appear('fade')], '复制对象产生独立副本，后续变换互不影响。', { createsObject: true, objectKind: 'mobject' }),
  block('set_position', '立即定位', '样式布局', [o(), ...position()], '将对象立即放到舞台坐标；使用“移动到”产生动画。'),
  block('set_style', '设置样式', '样式布局', [o(), c(), n('fill', '填充透明度', 0.15, 0, 1), n('stroke', '线宽', 3, 0, 30)], '立即修改颜色、填充和描边。'),
  block('next_to', '放在对象旁', '样式布局', [o(), o('other', '参照对象', '标题'), s('direction', '方向', 'DOWN', [['下方', 'DOWN'], ['上方', 'UP'], ['左侧', 'LEFT'], ['右侧', 'RIGHT']]), n('buff', '间距', 0.3, 0, 10)], '使用 Manim next_to 自动计算相对位置。'),
  block('arrange', '排列组合', '样式布局', [o('target', '组合', '组合'), s('direction', '方向', 'RIGHT', [['横向', 'RIGHT'], ['纵向', 'DOWN']]), n('buff', '间距', 0.4, 0, 10)], '在组合内部排列成员。'),
  block('add', '直接显示', '样式布局', [o()], '立即显示已创建的对象，不播放动画也不占用时长。需要入场效果时，使用绘制、淡入或书写积木。'),
  block('remove', '立即移除', '样式布局', [o()], '立即从画面移除对象，不占用时长；名称仍保留，可以再次显示。需要退场动画时使用淡出或擦除。'),
  animated('create', '绘制对象', [], '对已有对象播放 Create。'),
  animated('write', '书写对象', [], '对文字或公式播放 Write。'),
  animated('fade_in', '淡入', [], '播放 FadeIn。'),
  animated('fade_out', '淡出', [], '播放 FadeOut，结束后从场景移除。'),
  animated('uncreate', '擦除', [], '反向绘制并移除对象。'),
  animated('grow', '从中心生长', [], '播放 GrowFromCenter。'),
  animated('draw_border', '描边并填充', [], '播放 DrawBorderThenFill。'),
  animated('transform', '变成另一个形状', [o('destination', '目标形状', '正方形')], 'Transform 保留原对象名称及身份。目标建议选择“暂不显示”。'),
  animated('replacement_transform', '替换为另一个对象', [o('destination', '新对象', '正方形')], 'ReplacementTransform 将原对象从场景移除，后续应操作新对象。'),
  animated('matching_tex', '匹配公式变形', [o('destination', '新公式', '新公式', ['formula'])], '用 TransformMatchingTex 匹配公式片段，建议在 LaTeX 中用双花括号隔离符号。'),
  animated('move', '移动到', position(), '让对象中心移动到指定舞台坐标。'),
  animated('shift', '移动一段距离', [n('dx', '向右', 2), n('dy', '向上', 0), n('dz', '向前', 0)], '按向量平移对象。'),
  animated('rotate', '旋转', [n('angle', '角度（度）', 90, -3600, 3600), s('axis', '旋转轴', 'OUT', [['平面 / z 轴', 'OUT'], ['x 轴', 'RIGHT'], ['y 轴', 'UP']])], '绕对象中心旋转，角度单位是度。'),
  animated('scale', '缩放', [n('factor', '倍数', 1.5, 0.01, 30)], '绕对象中心均匀缩放。'),
  animated('color', '改变颜色', [c('color', '变为', '#FBBF24')], '将对象颜色平滑变到目标颜色。'),
  animated('opacity', '改变透明度', [n('opacity', '透明度', 0.3, 0, 1)], '设置整个对象的透明度。'),
  animated('indicate', '突出强调', [], '短暂放大和着色，结束恢复。'),
  animated('circumscribe', '圈出重点', [], '在对象周围画一个临时边框。'),
  animated('flash', '闪光强调', [], '在对象中心产生一圈闪光。'),
  animated('wiggle', '轻轻摇晃', [], '播放 Wiggle 强调对象。'),
  animated('path_move', '沿路径运动', [o('path', '路径', '曲线')], '让对象沿已有曲线移动。'),
  animated('apply_matrix', '线性变换', [{ ...t('matrix', '变换矩阵', '[[1,1],[0,1]]'), editor: 'matrix', description: '填写 2×2 数值矩阵，对图形应用对应的二维线性变换。' }], '对对象应用二维线性变换，可用于网格、向量或图形。'),
  block('wait', '等待', '编排', [n('duration', '秒', 1, 0, 120)], '保持画面并继续运行动态关系；不等待观众输入。'),
  block('parallel', '同时执行', '编排', [], '内部动画同时开始。不同对象可以组合；同一对象的重叠动画会报错。', { container: 'parallel' }),
  block('sequence', '一组步骤', '编排', [], '将多个步骤组织为可折叠段落，依次执行。', { container: 'sequence' }),
  block('repeat', '重复执行', '编排', [n('count', '次数', 3, 1, 50, 1)], '依次重复内部动作；建议只重复已有对象的动画，不反复声明同名对象。', { container: 'repeat' }),
  block('code', 'Python 扩展', '高级', [{ ...t('code', 'Python', '# 在这里使用 self 和 objects\nself.wait(1)'), type: 'multiline' }], '高级扩展具备本机 Python 权限；仅在明确启用后运行。代码不会被计入原生积木覆盖。', { requiresTrust: true }),
];

export const BLOCK_CATEGORIES = Object.entries(COLORS).map(([name, colour]) => ({ name, colour }));
const byType = new Map(BLOCK_CATALOG.map((definition) => [definition.type, definition]));
export function getBlockDefinition(type: string): BlockDefinition | undefined { return byType.get(type); }
export function createAction(type: string, overrides: Record<string, FieldValue> = {}): Action {
  const definition = getBlockDefinition(type);
  if (!definition) throw new Error(`未知积木：${type}`);
  const action: Action = { id: crypto.randomUUID(), type, fields: Object.fromEntries(definition.fields.map((field) => [field.name, field.default])) };
  Object.assign(action.fields, overrides);
  if (definition.container) action.children = [];
  return action;
}
