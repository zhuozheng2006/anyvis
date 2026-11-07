import { API_ENTRIES, API_CHINESE_NAMES, type ApiEntry, type ApiParameter } from './api-registry.ts';
import type { BlockDefinition, FieldDefinition } from './types.ts';
const labels: Record<string, string> = { radius: '半径', color: '颜色', fill_color: '填充颜色', fill_opacity: '填充不透明度', stroke_color: '轮廓颜色', stroke_width: '线宽', stroke_opacity: '轮廓不透明度', width: '宽度', height: '高度', side_length: '边长', point: '位置', points: '点集', start: '起点', end: '终点', angle: '角度（弧度）', direction: '方向', buff: '间距', mobject: '对象', mobjects: '对象列表', vmobjects: '矢量对象列表', target_mobject: '目标对象', run_time: '动画时长（秒）', rate_func: '变化节奏', lag_ratio: '间隔比例', font: '字体', font_size: '字号', text: '文字', tex_strings: '公式列表', table: '表格数据', matrix: '矩阵数据', vertices: '顶点', edges: '边', u_range: 'u 区间', v_range: 'v 区间', x_range: 'x 区间', y_range: 'y 区间', z_range: 'z 区间', function: '函数', func: '函数', opacity: '不透明度', value: '值', factor: '比例', scale_factor: '缩放比例', about_point: '中心点', axis: '旋转轴', args: '位置参数列表', kwargs: '其它命名参数' };
export const apiFieldName = (parameter: string) => `p_${parameter}`;
export function apiParameterField(p: ApiParameter): FieldDefinition {
    return { name: apiFieldName(p.name), label: labels[p.name] || p.name, type: 'api-value', default: '',
        apiParameter: p, description: `${p.name}${p.annotation ? ': ' + p.annotation : ''}。${p.required ? '必填。' : '留空采用 Manim 默认值。'}${p.inheritedFrom ? '继承自 ' + p.inheritedFrom + '；仅当构造器接受该参数时使用。' : ''}` };
}
function receiver(entry: ApiEntry): FieldDefinition {
    const builtin = entry.owner?.includes('.scene.') ? '@scene' : entry.owner?.includes('.camera.') ? '@camera' : '';
    return { name: 'receiver', label: '操作对象', type: 'object', default: builtin, reference: 'object', description: '选择此前创建的对象；@scene 是当前场景，@camera 是镜头，@frame 是二维镜头框。' };
}
function definition(entry: ApiEntry): BlockDefinition {
    const fields: FieldDefinition[] = [{ name: 'name', label: '结果名称', type: 'text', default: '结果' }];
    if (entry.kind === 'method' || entry.kind === 'property')
        fields.push(receiver(entry));
    fields.push(...entry.parameters.map(apiParameterField));
    fields.push(...entry.inheritedParameters.map(apiParameterField));
    const options: [
        string,
        string
    ][] = [['保存结果 / 执行', 'store']];
    if (entry.resultKind !== 'animation')
        options.push(['显示生成的图形', 'show']);
    options.push(['播放生成的动画', 'play']);
    if (entry.kind === 'method')
        options.push(['动画改变对象', 'animate']);
    if (entry.kind === 'property' && entry.writable)
        options.push(['修改属性值', 'set']);
    fields.push({ name: 'mode', label: '执行方式', type: 'select', default: entry.kind === 'class' && entry.resultKind === 'animation' ? 'play' : entry.kind === 'class' && ['mobject', 'axes', 'axes3d', 'text', 'formula', 'curve', 'matrix', 'graph', 'number', 'number_line'].includes(entry.resultKind) ? 'show' : 'store', options });
    fields.push({ name: 'duration', label: '播放用时', type: 'number', default: 1, min: 0.01, max: 120, suffix: '秒' });
    if (entry.kind === 'property' && entry.writable)
        fields.push({ name: 'setValue', label: '新的属性值', type: 'api-value', default: '' });
    // Python supports subclasses at classmethod call sites; this keeps that choice explicit.
    if (entry.kind === 'classmethod')
        fields.push({ name: 'classTarget', label: '调用类（可选）', type: 'api-value', default: '' });
    return { type: entry.type, label: API_CHINESE_NAMES[entry.path] ? `${API_CHINESE_NAMES[entry.path]} · ${entry.path}` : entry.path, category: `API · ${entry.category}`, colour: '#5266a7', tooltip: entry.description || entry.id,
        fields, createsObject: true, objectKind: entry.resultKind === 'value' ? 'api-value' : entry.resultKind,
        requiresTrust: entry.requiresTrust, apiId: entry.id, keywords: [entry.id, entry.category, entry.description], nativeApis: [],
        requires3d: entry.owner?.includes('ThreeDScene') || false };
}
export const API_BLOCK_CATALOG: BlockDefinition[] = [...API_ENTRIES.map(definition),
    { type: 'api_value', apiId: '@value', label: '保存 / 使用参数值', category: 'API · 参数与回调', colour: '#5266a7', tooltip: '保存向量、列表、回调函数或函数调用结果，供后续 API 使用。', createsObject: true, objectKind: 'api-value', fields: [
            { name: 'name', label: '结果名称', type: 'text', default: '参数值' },
            { name: 'value', label: '参数值', type: 'api-value', default: '0' },
            { name: 'mode', label: '执行方式', type: 'select', default: 'store', options: [['保存结果', 'store'], ['显示图形', 'show'], ['播放动画', 'play']] },
            { name: 'duration', label: '播放用时', type: 'number', default: 1, min: 0.01, max: 120, suffix: '秒' }
        ] },
    { type: 'api_context', apiId: '@context', label: '在临时设置中执行', category: 'API · 参数与回调', colour: '#5266a7', container: 'sequence', tooltip: '使用 Manim 上下文管理器（例如 tempconfig），结束后恢复设置。', fields: [{ name: 'context', label: '上下文', type: 'api-value', default: '', description: '选择已保存的上下文管理器，或使用结构化调用。' }] },
];
