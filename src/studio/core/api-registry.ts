import raw from './api-registry.json' with { type: 'json' };
export interface ApiParameter {
    name: string;
    kind: 'positional_only' | 'positional_or_keyword' | 'keyword_only' | 'var_positional' | 'var_keyword';
    annotation: string;
    required: boolean;
    default: {
        value?: unknown;
        description?: string;
    } | null;
    inheritedFrom?: string;
}
export interface ApiEntry {
    id: string;
    type: string;
    name: string;
    kind: 'class' | 'function' | 'method' | 'staticmethod' | 'classmethod' | 'property';
    module: string;
    path: string;
    owner: string | null;
    parameters: ApiParameter[];
    inheritedParameters: ApiParameter[];
    signature: string | null;
    description: string;
    category: string;
    resultKind: string;
    requiresTrust: boolean;
    renderer: 'any' | 'opengl';
    writable: boolean;
    bases?: string[];
}
export interface ApiConstant {
    module: string;
    path: string;
    preview: unknown;
    requiresTrust?: boolean;
}
export const API_REGISTRY = raw as unknown as {
    schemaVersion: number;
    engineVersion: string;
    aliases: Record<string, string>;
    entries: ApiEntry[];
    constants: Record<string, ApiConstant>;
    scope: {
        modules: string[];
        excluded: string[];
        unavailableModules: {
            module: string;
            error: string;
        }[];
    };
};
export const API_ENTRIES = API_REGISTRY.entries;
export const API_CHINESE_NAMES:Record<string,string> = {
    Circle:'圆',Square:'正方形',Rectangle:'矩形',Triangle:'三角形',Polygon:'多边形',RegularPolygon:'正多边形',Ellipse:'椭圆',Dot:'点',Line:'线段',Arrow:'箭头',Arc:'圆弧',Annulus:'圆环',Sector:'扇形',Star:'星形',Brace:'标注括号',Text:'文字',MathTex:'数学公式',Tex:'公式排版',DecimalNumber:'数值文字',Integer:'整数文字',ValueTracker:'数值参数',Axes:'坐标系',ThreeDAxes:'三维坐标系',NumberPlane:'平面网格',ComplexPlane:'复平面',NumberLine:'数轴',FunctionGraph:'函数曲线',ParametricFunction:'参数曲线',Surface:'参数曲面',Sphere:'球',Cube:'立方体',Cylinder:'圆柱',Cone:'圆锥',Torus:'环面',VGroup:'矢量对象组合',Group:'对象组合',Matrix:'矩阵',Table:'表格',Graph:'图结构',BarChart:'柱状图',ArrowVectorField:'向量场',StreamLines:'流线',ManimColor:'颜色对象',Create:'绘制图形',Write:'书写',FadeIn:'淡入',FadeOut:'淡出',Transform:'变形',ReplacementTransform:'替换变形',TransformMatchingTex:'公式匹配变形',Rotate:'旋转动画',MoveAlongPath:'沿路径运动',AnimationGroup:'同时播放',LaggedStart:'错开播放',Succession:'依次播放',Wait:'等待',Indicate:'突出强调',Circumscribe:'圈出强调',TracedPath:'运动轨迹',always_redraw:'持续重绘',tempconfig:'临时配置',
    'Mobject.shift':'相对移动','Mobject.move_to':'移动到','Mobject.rotate':'旋转','Mobject.scale':'缩放','Mobject.copy':'复制对象','Mobject.width':'宽度','Mobject.height':'高度','Mobject.set_color':'设置颜色','Mobject.add_updater':'添加更新回调','Mobject.clear_updaters':'停止更新','CoordinateSystem.plot':'绘制函数图像','CoordinateSystem.c2p':'坐标转位置','ValueTracker.set_value':'改变参数','ValueTracker.get_value':'读取参数','Scene.play':'场景播放','Scene.wait':'场景等待',
};
const byType = new Map(API_ENTRIES.map(e => [e.type, e]));
const byId = new Map(API_ENTRIES.map(e => [e.id, e]));
const byShort = new Map<string, ApiEntry[]>();
for (const entry of API_ENTRIES) {
    for (const key of new Set([entry.path, entry.path.split('.').at(-1)!])) {
        byShort.set(key, [...(byShort.get(key) || []), entry]);
    }
}
const directEntry = (key: string) => byType.get(key) || byId.get(key) || byId.get(API_REGISTRY.aliases[key]) || (byShort.get(key)?.length === 1 ? byShort.get(key)![0] : undefined);
export function getApiEntry(key: string): ApiEntry | undefined {
    const direct = directEntry(key);
    if (direct)
        return direct;
    const split = key.lastIndexOf('.');
    if (split > 0) {
        const cls = directEntry(key.slice(0, split));
        if (cls?.kind === 'class')
            for (const owner of [cls.id, ...(cls.bases || [])]) {
                const inherited = byId.get(`${owner}.${key.slice(split + 1)}`);
                if (inherited)
                    return inherited;
            }
    }
    return undefined;
}
export function apiDocumentation(entry: ApiEntry): string {
    const owner = entry.kind === 'method' || entry.kind === 'property' || entry.kind === 'classmethod' || entry.kind === 'staticmethod' ? entry.owner : entry.id;
    return `https://docs.manim.community/en/v${API_REGISTRY.engineVersion}/reference/${owner}.html${owner !== entry.id ? '#' + entry.id : ''}`;
}
export function searchApi(query: string, category = '', kind = ''): ApiEntry[] {
    const exact = getApiEntry(query.trim());
    const common = ['Circle', 'Square', 'Text', 'MathTex', 'Axes', 'NumberPlane', 'Create', 'Transform', 'FadeIn', 'FadeOut', 'ValueTracker', 'Surface', 'Mobject.shift', 'Mobject.rotate', 'CoordinateSystem.plot'];
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return API_ENTRIES.filter(e => (!category || e.category === category) && (!kind || e.kind === kind))
        .map(e => {
        const name = `${e.path} ${e.id}`.toLocaleLowerCase();
        const haystack = `${name} ${API_CHINESE_NAMES[e.path] || ''} ${e.category} ${e.description}`.toLocaleLowerCase();
        return { e, score: !words.length && common.includes(e.path) ? 200 - common.indexOf(e.path) : exact?.id === e.id ? 1000 : words.every(w => haystack.includes(w)) ? words.reduce((n, w) => n + (e.path.toLowerCase() === w ? 100 : name.includes(w) ? 10 : 1), 0) : -1 };
    })
        .filter(r => r.score >= 0).sort((a, b) => b.score - a.score || Number(b.e.kind === 'class') - Number(a.e.kind === 'class') || a.e.id.localeCompare(b.e.id)).map(r => r.e);
}
