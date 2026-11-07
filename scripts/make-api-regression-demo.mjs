import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAction } from '../src/studio/core/catalog.ts';
import { getApiEntry } from '../src/studio/core/api-registry.ts';
import { compileProject } from '../src/studio/core/compiler.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const actions = [];
const add = (type, fields) => { const action = createAction(type, fields); action.id = `typed-api-${actions.length+1}`; actions.push(action); return action; };
const api = (id, name, params = {}, fields = {}) => add(getApiEntry(id).type, { name, mode: 'store', ...Object.fromEntries(Object.entries(params).map(([k,v]) => [`p_${k}`, JSON.stringify(v)])), ...fields });
const ref = name => ({ $ref: name });
const vector = (...values) => ({ $array: values });
const text = (name, content, y, color = '#DCE6F5') => add('text', { name, text: content, y, fontSize: 25, color, maxWidth: 12, duration: 0.5, appear: 'fade' });
text('标题', '让参数、方法与回调真正连接起来', 3, '#FFFFFF');
text('说明一', '颜色的浮点通道 [1.0, 0.0, 0.0]，生成明亮的红色。', 2.2);
api('ManimColor.from_rgb', '纯红色', { rgb: [{ $float: 1 }, { $float: 0 }, { $float: 0 }] });
api('Circle', '圆', { radius: 0.65, color: ref('纯红色'), fill_opacity: 0.7, stroke_width: 4 });
api('Mobject.shift', '初始位置', { vectors: [vector(-2, 0, 0)] }, { receiver: '圆' });
api('Create', '画圆', { mobject: ref('圆') }, { mode: 'play', duration: 1 });
text('说明二', '绑定对象的方法：把“向右移动”交给动画执行。', -2.4);
api('ApplyMethod', '移动', { method: { $method: { api: 'Mobject.shift', receiver: ref('圆') } }, args: [vector(4, 0, 0)] }, { mode: 'play', duration: 2 });
add('fade_out', { target: '说明二', duration: 0.3 });
text('说明三', '回调接收动画进度，连续计算圆的位置。', -2.4);
const callback = {
  $lambda: {
    params: ['m', 'a'],
    body: {
      $call: {
        api: 'Mobject.move_to', receiver: { $local: 'm' },
        args: [vector({ $expr: '2*cos(pi*a)' }, { $expr: 'sin(pi*a)' }, 0)],
      },
    },
  },
};
add('api_value', { name: '弧线回调', value: JSON.stringify(callback) });
api('UpdateFromAlphaFunc', '沿弧线返回', { mobject: ref('圆'), update_function: ref('弧线回调') }, { mode: 'play', duration: 3 });
add('fade_out', { target: '说明三', duration: 0.3 });
text('说明四', '缩放方法同时改变几何形状和描边宽度。', -2.4);
api('ApplyMethod', '一起放大', { method: { $method: { api: 'Mobject.scale', receiver: ref('圆') } }, args: [1.6, { scale_stroke: true }] }, { mode: 'play', duration: 2 });
text('结语', '所有步骤均可在积木中修改，无 Python 扩展。', -3.2, '#8494AF');
add('wait', { duration: 1.5 });
const project = { schemaVersion: 2, id: 'typed-api-regression', name: 'API 验证 · 颜色、绑定方法与回调', scene: { dimension: '2d', renderer: 'cairo', background: '#0B1020', width: 1280, height: 720, fps: 24 }, actions };
const compiled = compileProject(project);
if (compiled.requiresTrust || compiled.diagnostics.some(d => d.severity === 'error')) throw Error(JSON.stringify(compiled.diagnostics));
fs.writeFileSync(path.join(root, 'examples/api/typed-values.anyvis.json'), JSON.stringify(project, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'examples/api/typed-values-manifest.json'), '["typed-values.anyvis.json"]\n');
console.log(`${actions.length} native blocks, ${compiled.duration.toFixed(2)} seconds`);
