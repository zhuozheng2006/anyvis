import { getBlockDefinition } from './catalog.ts';
import { compileExpression, RESERVED_SYMBOLS } from './expression.ts';
import { validateProject } from './project.ts';
import type { Action, CompileResult, Diagnostic, Project } from './types.ts';

const py = (value: string): string => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const TEX_COMMANDS = new Set(('frac dfrac tfrac sqrt sin cos tan arcsin arccos arctan sinh cosh tanh log ln exp lim limsup liminf max min sup inf det gcd mod bmod pmod arg deg ker dim hom Pr sum prod coprod int iint iiint oint bigcup bigcap cup cap union intersection left right middle big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr Biggl Biggr text textrm textbf textit mathrm mathbf mathit mathsf mathtt mathcal mathbb mathfrak boldsymbol operatorname overline underline overbrace underbrace overset underset hat widehat tilde widetilde bar vec dot ddot ddots vdots cdots ldots dots alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega infty partial nabla ell hbar imath jmath Re Im wp aleph forall exists nexists neg land lor lnot implies iff because therefore in notin ni subset supset subseteq supseteq nsubseteq nsupseteq emptyset varnothing setminus to mapsto rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow longrightarrow longleftarrow longleftrightarrow Longrightarrow Longleftarrow Longleftrightarrow uparrow downarrow updownarrow hookrightarrow hookleftarrow leadsto cdot times div pm mp ast star circ bullet odot otimes oplus ominus oslash wedge vee perp parallel angle measuredangle triangle le leq ge geq ne neq equiv approx sim simeq cong propto ll gg prec succ preceq succeq asymp mid colon quad qquad enspace thinspace medspace thickspace space hspace vspace phantom hphantom vphantom smash color textcolor begin end displaystyle textstyle scriptstyle scriptscriptstyle limits nolimits substack binom dbinom tbinom choose brace brack bmatrix pmatrix matrix cases aligned gather split cancel boxed fbox lbrace rbrace langle rangle lfloor rfloor lceil rceil vert Vert lvert rvert lVert rVert backslash complement degree percent').split(' '));
function texNeedsTrust(source: string): boolean {
  if (source.includes('^^')) return true;
  for (const match of source.matchAll(/\\([a-zA-Z]+|.)/g)) {
    const command = match[1];
    if (command.length === 1 && !/[a-z]/i.test(command)) continue;
    if (!TEX_COMMANDS.has(command)) return true;
  }
  for (const match of source.matchAll(/\\(?:begin|end)\s*\{([^}]+)\}/g)) {
    if (!/^(?:[bpvBV]?matrix|smallmatrix|cases|aligned|gathered|split|array|align\*?)$/.test(match[1])) return true;
  }
  return false;
}
interface ObjectInfo { kind: string; visible: boolean; retired?: boolean; members?: string[]; vertices?: string[]; }
interface AnimationValue { expression: string; duration: number; targets: string[]; }
export function compileProject(input: Project | unknown): CompileResult {
  const diagnostics: Diagnostic[] = [];
  let project: Project;
  try { project = validateProject(input); }
  catch (error) { return { code: '', sourceMap: {}, duration: 0, requiresTrust: false, diagnostics: [{ message: String((error as Error).message), severity: 'error' }] }; }
  const lines: string[] = [];
  const sourceMap: Record<number, string> = {};
  const objects = new Map<string, ObjectInfo>();
  const trackers = new Map<string, string>();
  let requiresTrust = false;
  let uncertainDuration = false;
  let expanded = 0;
  const emit = (text: string, action?: Action) => {
    lines.push(text);
    if (action) sourceMap[lines.length] = action.id;
  };
  const stmt = (text: string, action: Action) => emit(`        ${text}`, action);
  const str = (a: Action, key: string) => String(a.fields[key] ?? '');
  const num = (a: Action, key: string) => Number(a.fields[key]);
  const symbolMap = (locals: string[] = []) => Object.assign(Object.fromEntries(trackers), Object.fromEntries(locals.map((v) => [v, v]))) as Record<string, string>;
  const expr = (a: Action, key: string, locals: string[] = []) => compileExpression(str(a, key), symbolMap(locals));
  const ref = (a: Action, key = 'target', kinds?: string[]) => {
    const name = str(a, key);
    const info = objects.get(name);
    if (info?.retired) throw new Error(`对象“${name}”已被替换，请操作替换后的新对象，或先用“直接显示”重新加入旧对象。`);
    if (!info) throw new Error(`找不到对象“${name || '（未选择）'}”。请先创建它，再连接这一步。`);
    if (!kinds && info.kind === 'tracker') throw new Error(`“${name}”是数值参数，不能当作图形使用。请用“改变参数”积木。`);
    if (kinds && !kinds.includes(info.kind)) throw new Error(`“${name}”的类型不适合这里，需要 ${kinds.join(' / ')}。`);
    return `objects[${py(name)}]`;
  };
  const point = (a: Action) => `[${num(a, 'x')}, ${num(a, 'y')}, ${num(a, 'z')}]`;
  const tint = (a: Action) => py(str(a, 'color'));
  const contrastingText = (hex: string) => { const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2] > 140 ? '"#0B1020"' : '"#F8FAFC"'; };
  const timing = (a: Action) => `run_time=${num(a, 'duration')}, rate_func=rate_functions.${str(a, 'easing') || 'smooth'}`;
  const parseNumbers = (a: Action, key: string, matrix = false): string => {
    let values: unknown;
    try { values = JSON.parse(str(a, key)); } catch { throw new Error('矩阵需要 JSON 格式，例如 [[1,0],[0,1]]。'); }
    if (!Array.isArray(values) || values.length < 1 || values.length > 12 || !values.every((row) => Array.isArray(row) && row.length > 0 && row.length <= 12)) throw new Error('矩阵需要 1–12 行和 1–12 列。');
    const rows = values as unknown[][];
    if (!rows.every((row) => row.length === rows[0].length)) throw new Error('矩阵各行的元素数量必须相同。');
    if (matrix && (rows.length !== 2 || rows[0].length !== 2)) throw new Error('线性变换需要 2×2 矩阵。');
    if (!rows.every((row) => row.every((v) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 10000) || (!matrix && typeof v === 'string' && v.length < 200)))) throw new Error('矩阵元素需要有限数字或简短数学字符串。');
    if (!matrix && rows.flat().some((v) => typeof v === 'string' && texNeedsTrust(v))) throw new Error('矩阵中的公式包含未允许的 LaTeX 指令。');
    return `[${rows.map((row) => `[${row.map((v) => typeof v === 'string' ? py(v) : String(v)).join(', ')}]`).join(', ')}]`;
  };
  const range = (a: Action, min: string, max: string) => {
    if (num(a, min) >= num(a, max)) throw new Error('区间右端必须大于左端。');
    return `[${num(a, min)}, ${num(a, max)}]`;
  };
  emit('from manim import *');
  emit('import numpy as np');
  emit('import manimpango');
  emit('');
  emit('def _anyvis_font():');
  emit('    available = set(manimpango.list_fonts())');
  emit('    for font in ("Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", "Heiti SC", "Arial Unicode MS"):');
  emit('        if font in available:');
  emit('            return font');
  emit('    return "sans-serif"');
  emit('');
  emit(`class AnyVisScene(${project.scene.dimension === '3d' ? 'ThreeDScene' : 'MovingCameraScene'}):`);
  emit('    def construct(self):');
  emit('        objects = {}');
  emit('        _font = _anyvis_font()');
  emit(`        self.camera.background_color = ${py(project.scene.background)}`);
  emit('        np.random.seed(0)');

  const appearance = (a: Action, target: string): AnimationValue | null => {
    const kind = str(a, 'appear');
    if (kind === 'hidden') return null;
    if (kind === 'none') { stmt(`self.add(${target})`, a); return null; }
    const constructor = kind === 'write' ? 'Write' : kind === 'fade' ? 'FadeIn' : 'Create';
    return { expression: `${constructor}(${target}, run_time=${num(a, 'duration')})`, duration: num(a, 'duration'), targets: [str(a, 'name')] };
  };
  const creation = (a: Action): AnimationValue | null => {
    const definition = getBlockDefinition(a.type)!;
    const name = str(a, 'name').trim();
    if (!name || name.length > 100 || /[\r\n\0]/.test(name)) throw new Error('对象需要 1–100 个字符的名称，不可包含换行。');
    if (objects.has(name)) throw new Error(`对象“${name}”已经存在。请使用不同名称；重复积木内建议操作已有对象。`);
    // Normalize whitespace consistently before creating and referencing the name.
    if (name !== str(a, 'name')) throw new Error('对象名称开头或结尾不能包含空格。');
    const target = `objects[${py(name)}]`;
    let construction = '';
    let reposition = false;
    switch (a.type) {
      case 'circle': construction = `Circle(radius=${num(a, 'radius')})`; reposition = true; break;
      case 'square': construction = `Square(side_length=${num(a, 'side')})`; reposition = true; break;
      case 'rectangle': construction = `Rectangle(width=${num(a, 'width')}, height=${num(a, 'height')})`; reposition = true; break;
      case 'rounded_rectangle': construction = `RoundedRectangle(width=${num(a, 'width')}, height=${num(a, 'height')}, corner_radius=${num(a, 'corner')})`; reposition = true; break;
      case 'triangle': construction = `Triangle().scale(${num(a, 'scale')})`; reposition = true; break;
      case 'polygon': construction = `RegularPolygon(n=${num(a, 'sides')}, radius=${num(a, 'radius')})`; reposition = true; break;
      case 'ellipse': construction = `Ellipse(width=${num(a, 'width')}, height=${num(a, 'height')})`; reposition = true; break;
      case 'dot': construction = `Dot(radius=${num(a, 'radius')})`; reposition = true; break;
      case 'arc': construction = `Arc(radius=${num(a, 'radius')}, start_angle=${num(a, 'start')}*DEGREES, angle=${num(a, 'angle')}*DEGREES)`; reposition = true; break;
      case 'line': case 'arrow': {
        if (num(a, 'x1') === num(a, 'x2') && num(a, 'y1') === num(a, 'y2')) throw new Error('线段的两个端点不能重合。');
        construction = `${a.type === 'line' ? 'Line' : 'Arrow'}([${num(a, 'x1')}, ${num(a, 'y1')}, 0], [${num(a, 'x2')}, ${num(a, 'y2')}, 0]${a.type === 'arrow' ? ', buff=0' : ''})`; break;
      }
      case 'text': construction = `Text(${py(str(a, 'text'))}, font=_font, font_size=${num(a, 'fontSize')})`; reposition = true; break;
      case 'formula':
        if (texNeedsTrust(str(a, 'tex'))) throw new Error('公式含未允许的 LaTeX 指令。请使用普通数学排版指令；文件、宏定义和外部命令不可在公式积木中执行。');
        construction = `MathTex(${py(str(a, 'tex'))}, font_size=${num(a, 'fontSize')})`; reposition = true; break;
      case 'decimal': construction = `DecimalNumber(${num(a, 'value')}, num_decimal_places=${num(a, 'places')}, font_size=${num(a, 'fontSize')})`; reposition = true; break;
      case 'axes':
        range(a, 'xMin', 'xMax'); range(a, 'yMin', 'yMax');
        construction = `Axes(x_range=[${num(a, 'xMin')}, ${num(a, 'xMax')}, 1], y_range=[${num(a, 'yMin')}, ${num(a, 'yMax')}, 1], x_length=${num(a, 'xLength')}, y_length=${num(a, 'yLength')}, tips=False, axis_config={"include_numbers": False, "stroke_width": 2})`; reposition = true; break;
      case 'plane':
        range(a, 'xMin', 'xMax'); range(a, 'yMin', 'yMax');
        construction = `NumberPlane(x_range=[${num(a, 'xMin')}, ${num(a, 'xMax')}, 1], y_range=[${num(a, 'yMin')}, ${num(a, 'yMax')}, 1], background_line_style={"stroke_color": ${tint(a)}, "stroke_opacity": 0.45}, axis_config={"stroke_width": 2})`; reposition = true; break;
      case 'number_line':
        if ((num(a, 'max') - num(a, 'min')) / num(a, 'step') > 400) throw new Error('数轴刻度超过 400 个，请增大刻度间隔。');
        range(a, 'min', 'max'); construction = `NumberLine(x_range=[${num(a, 'min')}, ${num(a, 'max')}, ${num(a, 'step')}], length=${num(a, 'length')}, include_numbers=True)`; reposition = true; break;
      case 'function_plot': case 'dynamic_plot': {
        const axes = ref(a, 'axes', ['axes']);
        construction = `${axes}.plot(lambda x: ${expr(a, 'expression', ['x'])}, x_range=${range(a, 'xMin', 'xMax')}, color=${tint(a)}, use_smoothing=False)`;
        if (a.type === 'dynamic_plot') construction = `always_redraw(lambda: ${construction})`;
        break;
      }
      case 'parametric_curve': construction = `ParametricFunction(lambda t: np.array([${expr(a, 'xExpr', ['t'])}, ${expr(a, 'yExpr', ['t'])}, ${expr(a, 'zExpr', ['t'])}]), t_range=${range(a, 'tMin', 'tMax')}, color=${tint(a)}, use_smoothing=False)`; break;
      case 'area': construction = `${ref(a, 'axes', ['axes'])}.get_area(${ref(a, 'curve', ['curve'])}, x_range=${range(a, 'xMin', 'xMax')}, color=${tint(a)}, opacity=${num(a, 'opacity')})`; break;
      case 'riemann':
        if ((num(a, 'xMax') - num(a, 'xMin')) / num(a, 'dx') > 400) throw new Error('黎曼矩形超过 400 个，请增大矩形宽度。');
        construction = `${ref(a, 'axes', ['axes'])}.get_riemann_rectangles(${ref(a, 'curve', ['curve'])}, x_range=${range(a, 'xMin', 'xMax')}, dx=${num(a, 'dx')}, color=${tint(a)}, fill_opacity=0.5, stroke_width=0.8)`; break;
      case 'tangent': {
        const axes = ref(a, 'axes', ['axes']);
        const fn = expr(a, 'expression', ['x']);
        const at = expr(a, 'at');
        const unique = `_tangent_${objects.size}`;
        stmt(`def ${unique}():`, a);
        stmt(`    _f = lambda x: ${fn}`, a);
        stmt(`    _x = ${at}`, a);
        stmt('    _slope = (_f(_x+0.0001)-_f(_x-0.0001))/0.0002', a);
        stmt(`    _center = ${axes}.c2p(_x, _f(_x))`, a);
        stmt(`    _direction = ${axes}.c2p(_x+1, _f(_x)+_slope)-_center`, a);
        stmt(`    _direction = _direction / max(np.linalg.norm(_direction), 1e-8) * ${num(a, 'length')}/2`, a);
        stmt(`    return Line(_center-_direction, _center+_direction, color=${tint(a)})`, a);
        construction = `always_redraw(${unique})`; break;
      }
      case 'matrix': construction = `Matrix(${parseNumbers(a, 'values')}).scale(${num(a, 'scale')})`; reposition = true; break;
      case 'graph': {
        const vertices = str(a, 'vertices').split(',').map((v) => v.trim()).filter(Boolean);
        if (!vertices.length || vertices.length > 30 || new Set(vertices).size !== vertices.length || vertices.some((v) => v.length > 20 || v.includes('-'))) throw new Error('图需要 1–30 个不重复顶点名，不可包含连字符。');
        const edges = str(a, 'edges').split(',').filter((v) => v.trim()).map((v) => v.split('-').map((x) => x.trim()));
        if (edges.length > 100 || edges.some((edge) => edge.length !== 2 || !vertices.includes(edge[0]) || !vertices.includes(edge[1]) || edge[0] === edge[1])) throw new Error('图的边格式需要 A-B，且两个端点必须存在并不同。');
        if (str(a, 'layout') === 'tree') {
          const visited = new Set([vertices[0]]);
          let changed = true;
          while (changed) { changed = false; for (const [from, to] of edges) { if (visited.has(from) && !visited.has(to)) { visited.add(to); changed = true; } if (visited.has(to) && !visited.has(from)) { visited.add(from); changed = true; } } }
          if (edges.length !== vertices.length - 1 || visited.size !== vertices.length) throw new Error('树形布局需要连通且无环的图；请调整边，或选择圆形布局。');
        }
        construction = `Graph([${vertices.map(py).join(', ')}], [${edges.map((edge) => `(${py(edge[0])}, ${py(edge[1])})`).join(', ')}], layout=${py(str(a, 'layout'))}, layout_scale=${num(a, 'scale')}${str(a, 'layout') === 'tree' ? `, root_vertex=${py(vertices[0])}` : ''}, labels={${vertices.map((v) => `${py(v)}: Text(${py(v)}, font=_font, font_size=22, color=${contrastingText(str(a, 'color'))})`).join(', ')}}, vertex_config={"radius": 0.24, "fill_color": ${tint(a)}}, edge_config={"stroke_color": "#64748B"})`; break;
      }
      case 'bar_chart': {
        const values = str(a, 'values').split(',').map(Number);
        if (!values.length || values.length > 30 || values.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e4)) throw new Error('柱状图需要最多 30 个有限数值，用逗号分隔。');
        construction = `BarChart(values=${JSON.stringify(values)}, x_length=${num(a, 'width')}, y_length=${num(a, 'height')})`; reposition = true; break;
      }
      case 'tracker':
        if (!/^[A-Za-z][A-Za-z_0-9]{0,30}$/.test(name) || RESERVED_SYMBOLS.has(name)) throw new Error('参数名用英文字母开头，可含数字与下划线；不能使用 x、t、pi 或数学函数名。');
        construction = `ValueTracker(${num(a, 'value')})`; trackers.set(name, `${target}.get_value()`); break;
      case 'dynamic_dot': {
        const axes = str(a, 'axes') ? ref(a, 'axes', ['axes']) : '';
        const location = axes ? `${axes}.c2p(${expr(a, 'xExpr')}, ${expr(a, 'yExpr')}, ${expr(a, 'zExpr')})` : `np.array([${expr(a, 'xExpr')}, ${expr(a, 'yExpr')}, ${expr(a, 'zExpr')}])`;
        construction = `always_redraw(lambda: Dot(${location}, radius=${num(a, 'radius')}, color=${tint(a)}))`; break;
      }
      case 'dynamic_line': {
        const axes = str(a, 'axes') ? ref(a, 'axes', ['axes']) : '';
        const p1 = axes ? `${axes}.c2p(${expr(a, 'x1Expr')}, ${expr(a, 'y1Expr')})` : `np.array([${expr(a, 'x1Expr')}, ${expr(a, 'y1Expr')}, 0])`;
        const p2 = axes ? `${axes}.c2p(${expr(a, 'x2Expr')}, ${expr(a, 'y2Expr')})` : `np.array([${expr(a, 'x2Expr')}, ${expr(a, 'y2Expr')}, 0])`;
        construction = `always_redraw(lambda: Line(${p1}, ${p2}, color=${tint(a)}, stroke_width=${num(a, 'width')}))`; break;
      }
      case 'dynamic_number': construction = `always_redraw(lambda: DecimalNumber(${ref(a, 'parameter', ['tracker'])}.get_value(), num_decimal_places=${num(a, 'places')}, font_size=${num(a, 'fontSize')}, color=${tint(a)}).move_to(${point(a)}))`; break;
      case 'trace': construction = `TracedPath(${ref(a)}.get_center, stroke_color=${tint(a)}, stroke_width=${num(a, 'width')})`; break;
      case 'three_axes': construction = `ThreeDAxes(x_range=[-${num(a, 'range')}, ${num(a, 'range')}, 1], y_range=[-${num(a, 'range')}, ${num(a, 'range')}, 1], z_range=[-${num(a, 'range')}, ${num(a, 'range')}, 1], x_length=${num(a, 'length')}, y_length=${num(a, 'length')}, z_length=${num(a, 'length')})`; break;
      case 'sphere': construction = `Sphere(radius=${num(a, 'radius')}, resolution=(18, 24)).set_color(${tint(a)})`; reposition = true; break;
      case 'cube': construction = `Cube(side_length=${num(a, 'side')}, fill_opacity=0.85).set_color(${tint(a)})`; reposition = true; break;
      case 'cylinder': construction = `Cylinder(radius=${num(a, 'radius')}, height=${num(a, 'height')}, resolution=(18, 24)).set_color(${tint(a)})`; reposition = true; break;
      case 'surface': construction = `Surface(lambda u, v: np.array([${expr(a, 'xExpr', ['u', 'v'])}, ${expr(a, 'yExpr', ['u', 'v'])}, ${expr(a, 'zExpr', ['u', 'v'])}]), u_range=${range(a, 'uMin', 'uMax')}, v_range=${range(a, 'vMin', 'vMax')}, resolution=(${num(a, 'resolution')}, ${num(a, 'resolution')}), checkerboard_colors=[${tint(a)}, "#164E63"], fill_opacity=0.85, stroke_width=0.3)`; break;
      case 'group': {
        const members = str(a, 'members').split(',').map((v) => v.trim()).filter(Boolean);
        if (!members.length || members.length > 100 || new Set(members).size !== members.length) throw new Error('组合需要不重复的成员名称。');
        construction = `VGroup(${members.map((v) => ref({ ...a, fields: { target: v } })).join(', ')})`; break;
      }
      case 'copy': construction = `${ref(a)}.copy()`; reposition = true; break;
      default: throw new Error(`创建积木 ${a.type} 尚未实现。`);
    }
    stmt(`${target} = ${construction}`, a);
    objects.set(name, { kind: definition.objectKind ?? 'mobject', visible: str(a, 'appear') !== 'hidden', ...(a.type === 'group' ? {members: str(a, 'members').split(',').map(v => v.trim())} : {}), ...(a.type === 'graph' ? {vertices: str(a, 'vertices').split(',').map(v => v.trim())} : {}) });
    if (definition.category === '图形' && a.type !== 'line' && a.type !== 'arrow') stmt(`${target}.set_color(${tint(a)}).set_fill(${tint(a)}, opacity=${num(a, 'fill')})`, a);
    else if (a.fields.color !== undefined && !['tracker', 'graph', 'surface', 'sphere', 'cube', 'cylinder', 'dynamic_dot', 'dynamic_plot', 'dynamic_line', 'dynamic_number', 'trace', 'area', 'riemann', 'plane', 'tangent'].includes(a.type)) stmt(`${target}.set_color(${tint(a)})`, a);
    if (reposition) stmt(`${target}.move_to(${point(a)})`, a);
    if (a.type === 'trace') { stmt(`self.add(${target})`, a); return null; }
    if (a.type === 'tracker' || a.type === 'group') return null;
    return appearance(a, target);
  };
  const animation = (a: Action): AnimationValue | null => {
    const definition = getBlockDefinition(a.type)!;
    if (definition.createsObject) return creation(a);
    const name = str(a, 'target');
    let expression = '';
    const direct: Record<string, string> = { create: 'Create', write: 'Write', fade_in: 'FadeIn', fade_out: 'FadeOut', uncreate: 'Uncreate', grow: 'GrowFromCenter', draw_border: 'DrawBorderThenFill', indicate: 'Indicate', circumscribe: 'Circumscribe', flash: 'Flash', wiggle: 'Wiggle' };
    if (direct[a.type]) expression = `${direct[a.type]}(${ref(a)}, ${timing(a)})`;
    else switch (a.type) {
      case 'transform': case 'replacement_transform': case 'matching_tex': {
        const from = ref(a); const to = ref(a, 'destination');
        if (name === str(a, 'destination')) throw new Error('变形的源对象和目标不能是同一个对象。');
        const constructor = a.type === 'transform' ? 'Transform' : a.type === 'replacement_transform' ? 'ReplacementTransform' : 'TransformMatchingTex';
        if (a.type === 'matching_tex') { ref(a, 'target', ['formula']); ref(a, 'destination', ['formula']); }
        expression = `${constructor}(${from}, ${to}, ${timing(a)})`;
        if (a.type !== 'transform') objects.get(name)!.retired = true;
        break;
      }
      case 'move': expression = `${ref(a)}.animate(${timing(a)}).move_to(${point(a)})`; break;
      case 'shift': expression = `${ref(a)}.animate(${timing(a)}).shift([${num(a, 'dx')}, ${num(a, 'dy')}, ${num(a, 'dz')}])`; break;
      case 'rotate': expression = `Rotate(${ref(a)}, angle=${num(a, 'angle')}*DEGREES, axis=${str(a, 'axis')}, ${timing(a)})`; break;
      case 'scale': expression = `${ref(a)}.animate(${timing(a)}).scale(${num(a, 'factor')})`; break;
      case 'color': expression = `${ref(a)}.animate(${timing(a)}).set_color(${tint(a)})`; break;
      case 'opacity': expression = `${ref(a)}.animate(${timing(a)}).set_opacity(${num(a, 'opacity')})`; break;
      case 'apply_matrix': expression = `${ref(a)}.animate(${timing(a)}).apply_matrix(${parseNumbers(a, 'matrix', true)})`; break;
      case 'animate_value': expression = `${ref(a, 'target', ['tracker'])}.animate(${timing(a)}).set_value(${num(a, 'value')})`; break;
      case 'path_move': expression = `MoveAlongPath(${ref(a)}, ${ref(a, 'path')}, ${timing(a)})`; break;
      case 'graph_highlight':
        ref(a, 'target', ['graph']);
        if (!objects.get(name)?.vertices?.includes(str(a, 'vertex'))) throw new Error(`图中不存在顶点“${str(a, 'vertex')}”。`);
        {
          const vertex = `${ref(a, 'target', ['graph'])}.vertices[${py(str(a, 'vertex'))}]`;
          expression = `AnimationGroup(${vertex}.animate(${timing(a)}).set_fill(${tint(a)}, family=False).set_stroke(${tint(a)}, family=False), *[label.animate(${timing(a)}).set_color(${contrastingText(str(a, 'color'))}) for label in ${vertex}.submobjects], lag_ratio=0)`;
        }
        break;
      case 'wait': return { expression: `Wait(run_time=${num(a, 'duration')})`, duration: num(a, 'duration'), targets: [] };
      default: return null;
    }
    return { expression, duration: num(a, 'duration'), targets: [name, ...(['replacement_transform', 'matching_tex'].includes(a.type) ? [str(a, 'destination')] : [])] };
  };
  const command = (a: Action): number | null => {
    switch (a.type) {
      case 'set_position': stmt(`${ref(a)}.move_to(${point(a)})`, a); break;
      case 'set_style': stmt(`${ref(a)}.set_color(${tint(a)}).set_fill(opacity=${num(a, 'fill')}).set_stroke(width=${num(a, 'stroke')})`, a); break;
      case 'next_to': stmt(`${ref(a)}.next_to(${ref(a, 'other')}, ${str(a, 'direction')}, buff=${num(a, 'buff')})`, a); break;
      case 'arrange': stmt(`${ref(a)}.arrange(${str(a, 'direction')}, buff=${num(a, 'buff')})`, a); break;
      case 'add':
        if (objects.get(str(a, 'target'))) objects.get(str(a, 'target'))!.retired = false;
        stmt(`self.add(${ref(a)})`, a); break;
      case 'remove': stmt(`self.remove(${ref(a)})`, a); break;
      case 'follow': stmt(`${ref(a)}.add_updater(lambda m: m.move_to(${ref(a, 'leader')}.get_center()+np.array([${num(a, 'dx')}, ${num(a, 'dy')}, 0])))`, a); break;
      case 'stop_updaters': stmt(`${ref(a)}.clear_updaters()`, a); break;
      case 'camera':
        if (num(a, 'duration') === 0) stmt(`self.set_camera_orientation(phi=${num(a, 'phi')}*DEGREES, theta=${num(a, 'theta')}*DEGREES, zoom=${num(a, 'zoom')})`, a);
        else { stmt(`self.move_camera(phi=${num(a, 'phi')}*DEGREES, theta=${num(a, 'theta')}*DEGREES, zoom=${num(a, 'zoom')}, run_time=${num(a, 'duration')})`, a); return num(a, 'duration'); }
        break;
      case 'ambient_rotation': stmt(num(a, 'rate') === 0 ? 'self.stop_ambient_camera_rotation()' : `self.begin_ambient_camera_rotation(rate=${num(a, 'rate')})`, a); break;
      case 'fixed_in_frame': stmt(`self.add_fixed_in_frame_mobjects(${ref(a)})`, a); break;
      case 'code':
        requiresTrust = true; uncertainDuration = true;
        for (const line of str(a, 'code').split('\n')) stmt(line, a);
        diagnostics.push({ blockId: a.id, message: 'Python 扩展需显式授权，运行时可以访问本机文件和网络；它不属于原生积木覆盖。', severity: 'warning' });
        break;
      default: return null;
    }
    return 0;
  };
  const check = (a: Action) => {
    if (++expanded > 2000) throw new Error('展开后的步骤超过 2000，请减少重复次数或拆分场景。');
    const definition = getBlockDefinition(a.type)!;
    if (definition.requires3d && project.scene.dimension !== '3d') throw new Error('此积木需要三维场景，请在场景设置中切换到三维。');
  };
  const collect = (a: Action): AnimationValue => {
    check(a);
    if (a.type === 'parallel') return parallel(a);
    if (getBlockDefinition(a.type)!.container) throw new Error('同时执行中暂只支持单个动画或嵌套的同时执行，请把顺序段落放在外层。');
    const result = animation(a);
    if (!result) throw new Error('此操作没有动画时长，不能放入“同时执行”；请将它移到前面。');
    return result;
  };
  const parallel = (a: Action): AnimationValue => {
    const children = a.branches ? a.branches.map((branch) => {
      if (branch.length !== 1) throw new Error('本版本并行分支需要恰好一个动画；多步分支尚未支持。');
      return branch[0];
    }) : a.children ?? [];
    if (!children.length) throw new Error('“同时执行”里还没有动画。');
    const animations = children.map(collect);
    const family = (name: string): string[] => [name, ...(objects.get(name)?.members ?? []).flatMap(family)];
    const targets = animations.flatMap((v) => [...new Set(v.targets.flatMap(family))]);
    if (new Set(targets).size !== targets.length) throw new Error('同时执行的动画正在修改同一个对象。请改为依次执行，或分别操作不同对象。');
    return { expression: `AnimationGroup(${animations.map((v) => v.expression).join(', ')}, lag_ratio=0)`, duration: Math.max(...animations.map((v) => v.duration)), targets };
  };
  const run = (actions: Action[]): number => {
    let total = 0;
    for (const a of actions) {
      try {
        check(a);
        stmt(`# block ${py(a.id)}: ${getBlockDefinition(a.type)!.label}`, a);
        if (a.type === 'sequence') { total += run(a.children ?? []); if (total > 600) throw new Error('单个场景超过 10 分钟，请拆分为多个项目。'); continue; }
        if (a.type === 'repeat') {
          for (let i = 0; i < num(a, 'count'); i++) { total += run(a.children ?? []); if (total > 600 || expanded > 2000) throw new Error('重复后超出场景预算（10 分钟 / 2000 步骤），请减少重复次数。'); }
          continue;
        }
        if (a.type === 'parallel') {
          const value = parallel(a); stmt(`self.play(${value.expression})`, a); total += value.duration; if (total > 600) throw new Error('单个场景超过 10 分钟，请拆分为多个项目。'); continue;
        }
        if (a.type === 'wait') {
          if (num(a, 'duration') > 0) stmt(`self.wait(${num(a, 'duration')}, frozen_frame=False)`, a);
          total += num(a, 'duration'); if (total > 600) throw new Error('单个场景超过 10 分钟，请拆分为多个项目。'); continue;
        }
        const value = animation(a);
        if (value) { stmt(`self.play(${value.expression})`, a); total += value.duration; }
        else if (!getBlockDefinition(a.type)!.createsObject) {
          const length = command(a);
          if (length === null) throw new Error(`积木 ${a.type} 尚未实现。`);
          total += length;
        }
        if (total > 600) throw new Error('单个场景超过 10 分钟，请拆分为多个项目。');
      } catch (error) { diagnostics.push({ blockId: a.id, severity: 'error', message: (error as Error).message }); }
    }
    return total;
  };
  const duration = run(project.actions);
  if (duration === 0 && !uncertainDuration) emit('        self.wait(0.1)');
  return { code: lines.join('\n') + '\n', sourceMap, duration: uncertainDuration ? null : Math.max(duration, 0.1), diagnostics, requiresTrust };
}
