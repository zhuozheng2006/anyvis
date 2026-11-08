import { API_ENTRIES, API_REGISTRY, getApiEntry, type ApiEntry } from './api-registry.ts';
import { compileApiValue, type ApiValueContext } from './api-values.ts';
import { apiFieldName } from './api-catalog.ts';
import type { Action } from './types.ts';
const py = JSON.stringify;
export const API_BUILTINS = ['@scene', '@camera', '@frame', '@renderer'] as const;
const localParameter = (name:string) => /(?:file_name|filename|file_path|font_file|background_image|tex_template|preamble|tex_string)/i.test(name);
function hasLocalParameter(value:unknown):boolean {
    if(Array.isArray(value))return value.some(hasLocalParameter);
    if(!value || typeof value!=='object')return false;
    return Object.entries(value).some(([key,v])=>(localParameter(key)&&v!==null&&v!=='')||hasLocalParameter(v));
}
// Only generated registry paths become Python identifiers. User values always
// go through the structured value compiler, never import/getattr/eval.
export function createApiCompiler() {
    const imports = new Map<string, string>();
    const code = (module: string, path: string) => {
        if (!/^(?:manim|manimpango)(?:\.[A-Za-z_][A-Za-z_0-9]*)*$/.test(module) || !/^[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z][A-Za-z_0-9]*)*$/.test(path))
            throw new Error('API 清单包含无效路径。');
        let alias = imports.get(module);
        if (!alias) {
            alias = `_av_module_${imports.size}`;
            imports.set(module, alias);
        }
        return `${alias}.${path}`;
    };
    // Lazy code getters keep unused modules (e.g. OpenGL) out of rendered scenes.
    const constants: ApiValueContext['constants'] = Object.create(null);
    for (const [key, value] of Object.entries(API_REGISTRY.constants)) {
        Object.defineProperty(constants, key, { enumerable: true, get: () => ({ code: code(value.module, value.path), requiresTrust: value.requiresTrust }) });
    }
    const callables: ApiValueContext['callables'] = Object.create(null);
    const properties: NonNullable<ApiValueContext['properties']> = Object.create(null);
    for (const entry of API_ENTRIES.filter(e => e.kind === 'property')) {
        for (const key of [entry.id, entry.path])
            Object.defineProperty(properties, key, { configurable: true, enumerable: true, get: () => ({ name: entry.name, ownerCode: code(entry.module, entry.path.split('.').slice(0, -1).join('.')), requiresTrust: entry.requiresTrust }) });
    }
    const add = (key: string, entry: ApiEntry) => Object.defineProperty(callables, key, { configurable: true, enumerable: true, get: () => ({ code: code(entry.module, entry.path), requiresTrust: entry.requiresTrust, instance: entry.kind === 'method', methodName: entry.name, ownerCode: entry.kind === 'method' ? code(entry.module, entry.path.split('.').slice(0, -1).join('.')) : undefined }) });
    const counts = new Map<string, number>();
    const candidates = API_ENTRIES.filter(e => ['class', 'function', 'staticmethod', 'classmethod', 'method'].includes(e.kind));
    for (const entry of candidates)
        counts.set(entry.path, (counts.get(entry.path) || 0) + 1);
    for (const entry of candidates) {
        add(entry.id, entry);
        if (counts.get(entry.path) === 1)
            add(entry.path, entry);
    }
    for (const [alias, id] of Object.entries(API_REGISTRY.aliases)) {
        const entry = candidates.find(e => e.id === id);
        if (entry)
            add(alias, entry);
    }
    const resolveCallable = (name: string) => { const entry = getApiEntry(name); return entry && entry.kind !== 'property' ? callables[entry.id] : undefined; };
    const resolveProperty = (name: string) => { const entry = getApiEntry(name); return entry?.kind === 'property' ? properties[entry.id] : undefined; };
    return {
        imports: () => [...imports].map(([module, alias]) => `import ${module} as ${alias}`),
        value(raw: string, references: ReadonlySet<string>, symbols: Record<string, string>) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            }
            catch {
                throw new Error('请填写有效的结构化参数值。');
            }
            const result=compileApiValue(parsed, { references, symbols, constants, callables, properties, resolveCallable, resolveProperty });
            result.requiresTrust ||= hasLocalParameter(parsed);
            return result;
        },
        compile(action: Action, entry: ApiEntry, references: ReadonlySet<string>, symbols: Record<string, string>) {
            let trust = entry.requiresTrust;
            const refs = new Set<string>();
            const value = (raw: unknown) => { const result = compileApiValue(raw, { references, symbols, constants, callables, properties, resolveCallable, resolveProperty }); trust ||= result.requiresTrust || hasLocalParameter(raw); result.references.forEach(r => refs.add(r)); return result.code; };
            const parse = (key: string) => { try {
                return JSON.parse(String(action.fields[key]));
            }
            catch {
                throw new Error(`参数 ${key.replace(/^p_/, '')} 格式无效，请打开参数编辑器修改。`);
            } };
            const named: string[] = [];
            let args = '[]';
            let kwargs = '{}';
            for (const p of [...entry.parameters, ...entry.inheritedParameters]) {
                const key = apiFieldName(p.name);
                const raw = action.fields[key];
                if (raw === undefined || raw === '') {
                    if (p.required)
                        throw new Error(`请填写必需参数 ${p.name}。`);
                    continue;
                }
                const parsed = parse(key);
                if(localParameter(p.name)&&parsed!==null&&parsed!=='')trust=true;
                if (p.kind === 'var_positional') {
                    if (!Array.isArray(parsed))
                        throw new Error(`${p.name} 必须是参数列表。`);
                    args = value(parsed);
                }
                else if (p.kind === 'var_keyword') {
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some(k => !(/^[A-Za-z][A-Za-z_0-9]*$/).test(k)))
                        throw new Error(`${p.name} 必须是命名参数字典。`);
                    kwargs = value(parsed);
                }
                else
                    named.push(`${py(p.name)}: ${value(parsed)}`);
            }
            const mode = String(action.fields.mode || 'store');
            const receiver = String(action.fields.receiver || '');
            const prelude: string[] = [];
            let target = code(entry.module, entry.path);
            if (entry.kind === 'method' || entry.kind === 'property') {
                if (!references.has(receiver))
                    throw new Error('请先选择操作对象。');
                refs.add(receiver);
                const owner = code(entry.module, entry.path.split('.').slice(0, -1).join('.'));
                prelude.push(`_av_check_receiver(objects[${py(receiver)}], ${owner})`);
                target = `objects[${py(receiver)}].${entry.name}`;
                if (mode === 'animate')
                    target = `objects[${py(receiver)}].animate(run_time=${Number(action.fields.duration)}).${entry.name}`;
            }
            if (entry.kind === 'classmethod' && action.fields.classTarget) {
                const cls = value(parse('classTarget'));
                prelude.push(`_av_check_class(${cls}, ${code(entry.module, entry.path.split('.').slice(0, -1).join('.'))})`);
                target = `(${cls}).${entry.name}`;
            }
            let expression = entry.kind === 'property' ? target : `_av_invoke(${target}, {${named.join(', ')}}, ${args}, ${kwargs})`;
            if (mode === 'set') {
                if (!entry.writable || entry.kind !== 'property')
                    throw new Error('这个属性只读。');
                if (!action.fields.setValue)
                    throw new Error('请填写新的属性值。');
                prelude.push(`${target} = ${value(parse('setValue'))}`);
                expression = target;
            }
            return { prelude, expression, requiresTrust: trust, references: [...refs], mode };
        },
    };
}
export const API_RUNTIME = `
from pathlib import Path as _av_Path
import inspect as _av_inspect
def _av_point_cloud_compat():
    # Manim CE 0.20.1 indexes PMobject.points with np.floor's float result.
    # Probe without initializing a renderer; leave already-fixed versions and
    # subclass overrides alone. Keep the intended discrete (floor) sampling.
    import manim as _av_manim
    from manim.mobject.types.point_cloud_mobject import PMobject as _av_PMobject
    if _av_manim.__version__ != '0.20.1': return
    original = _av_PMobject.point_from_proportion
    if getattr(original, '_anyvis_integer_index', False): return
    probe = object.__new__(_av_PMobject)
    probe.points = np.array([[0., 0., 0.], [2., 0., 0.], [4., 0., 0.]])
    try:
        original(probe, 0.5)
        return
    except IndexError:
        pass
    except Exception:
        return
    def point_from_proportion(self, alpha):
        if not isinstance(alpha, (int, float, np.integer, np.floating)) or not np.isfinite(alpha) or not 0 <= alpha <= 1:
            raise ValueError('Point-cloud proportion must be a finite number between 0 and 1.')
        count = self.get_num_points()
        if count == 0:
            raise ValueError('Cannot sample an empty point cloud.')
        return self.points[int(np.floor(alpha * (count - 1)))]
    point_from_proportion._anyvis_integer_index = True
    _av_PMobject.point_from_proportion = point_from_proportion
_av_point_cloud_compat()
def _av_default_camera_compat():
    # 0.20.1's constructor and default-orientation method use different names.
    # Probe only that method, without creating a scene or rendering resources.
    import manim as _av_manim
    from manim.scene.three_d_scene import ThreeDScene as _av_ThreeDScene
    if _av_manim.__version__ != '0.20.1': return
    original = _av_ThreeDScene.set_to_default_angled_camera_orientation
    if original.__module__ != 'manim.scene.three_d_scene': return
    probe = object.__new__(_av_ThreeDScene)
    probe.default_angled_camera_orientation_kwargs = {'phi': 0.7, 'theta': -0.4}
    probe.set_camera_orientation = lambda **kwargs: None
    try:
        original(probe)
        return
    except AttributeError as error:
        if error.name != 'default_camera_orientation_kwargs': return
    except Exception:
        return
    def set_to_default_angled_camera_orientation(self, **kwargs):
        if hasattr(self, 'default_camera_orientation_kwargs'):
            return original(self, **kwargs)
        settings = dict(self.default_angled_camera_orientation_kwargs)
        settings.update(kwargs)
        self.set_camera_orientation(**settings)
    _av_ThreeDScene.set_to_default_angled_camera_orientation = set_to_default_angled_camera_orientation
_av_default_camera_compat()
def _av_foreground_compat():
    # 0.20.1 adds a foreground object twice, which doubles updater execution.
    # Preserve the final occurrence so foreground draw order stays on top.
    import manim as _av_manim
    from manim.scene.scene import Scene as _av_Scene
    from types import SimpleNamespace as _av_Namespace
    if _av_manim.__version__ != '0.20.1': return
    original = _av_Scene.add
    if original.__module__ != 'manim.scene.scene': return
    probe = object.__new__(_av_Scene)
    probe.mobjects, probe.moving_mobjects = [], []
    probe.foreground_mobjects = [_av_manim.Mobject()]
    probe.renderer = _av_Namespace(camera=_av_Namespace(use_z_index=False))
    try:
        with _av_manim.tempconfig({'renderer': 'cairo'}):
            original(probe, *probe.foreground_mobjects)
    except Exception:
        return
    if len({id(m) for m in probe.mobjects}) == len(probe.mobjects): return
    def unique_family_last(scene, items):
        seen, overlap, families = set(), False, []
        for item in items:
            family = item.get_family()
            identities = {id(member) for member in family}
            overlap = overlap or bool(seen & identities)
            seen.update(identities)
            families.append(family)
        if not overlap: return items
        kept = []
        for item, family in zip(items, families):
            # Match Scene's normal group-extraction semantics: later foreground
            # children are extracted from earlier groups; independent groups stay.
            kept = scene.get_restructured_mobject_list(kept, family)
            kept.append(item)
        return kept
    def add(self, *mobjects):
        result = original(self, *mobjects)
        if _av_manim.config.renderer == _av_manim.RendererType.CAIRO:
            self.mobjects = unique_family_last(self, self.mobjects)
            self.foreground_mobjects = unique_family_last(self, self.foreground_mobjects)
            self.moving_mobjects = unique_family_last(self, self.moving_mobjects)
        return result
    _av_Scene.add = add
_av_foreground_compat()
def _av_check_receiver(value, owner):
    if not isinstance(value, owner):
        raise TypeError(f"操作对象需要 {owner.__name__}，实际是 {type(value).__name__}")
def _av_receiver(value, owner):
    _av_check_receiver(value, owner)
    return value
def _av_check_class(value, owner):
    if not isinstance(value, type) or not issubclass(value, owner):
        raise TypeError(f"调用类需要是 {owner.__name__} 的子类")
def _av_method(receiver, owner, name, args, kwargs):
    _av_check_receiver(receiver, owner)
    return getattr(receiver, name)(*args, **kwargs)
def _av_invoke(function, values, extra_args, extra_kwargs):
    duplicate = values.keys() & extra_kwargs.keys()
    if duplicate:
        raise TypeError(f"命名参数重复: {sorted(duplicate)}")
    values = dict(values)
    try:
        parameters = list(_av_inspect.signature(function).parameters.values())
    except (TypeError, ValueError):
        return function(*extra_args, **values, **extra_kwargs)
    positional = [p for p in parameters if p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)]
    last = max((i for i,p in enumerate(positional) if p.kind == p.POSITIONAL_ONLY and p.name in values), default=-1)
    if extra_args:
        last = len(positional)-1
    args = []
    for p in positional[:last+1]:
        if p.name in values:
            args.append(values.pop(p.name))
        elif p.default is not p.empty:
            args.append(p.default)
        else:
            raise TypeError(f"缺少位置参数 {p.name}")
    return function(*args, *extra_args, **values, **extra_kwargs)
def _av_show(scene, value):
    from manim.mobject.opengl.opengl_mobject import OpenGLMobject
    if not isinstance(value, (Mobject, OpenGLMobject)):
        raise TypeError("此结果不是图形，请选择保存结果")
    scene.add(value)
`;
