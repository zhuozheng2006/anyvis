import { Plus, X, Trash2 } from 'lucide-react';
import type { Parameter, Project } from '../core/types';
export default function ParameterSettings({ project, onChange, onClose }: {
    project: Project;
    onChange: (p: Project) => void;
    onClose: () => void;
}) {
    const patch = (id: string, fields: Partial<Parameter>) => onChange({ ...project, parameters: project.parameters.map(p => p.id === id ? { ...p, ...fields } : p) });
    const add = () => {
        let index = 1;
        while (project.parameters.some(p => p.id === `p${index}`))
            index++;
        onChange({ ...project, parameters: [...project.parameters, { id: `p${index}`, name: `参数 ${index}`, value: 1, min: 0, max: 5, step: .01, color: '#b5f36c' }] });
    };
    const remove = (id: string) => {
        const nodes = new Set(project.nodes.filter(n => n.parameterId === id).map(n => n.id));
        onChange({ ...project, parameters: project.parameters.filter(p => p.id !== id), nodes: project.nodes.filter(n => !nodes.has(n.id)), edges: project.edges.filter(e => !nodes.has(e.source) && !nodes.has(e.target)), clips: project.clips.filter(c => c.parameterId !== id) });
    };
    return <div className="modal-backdrop"><div className="modal parameter-modal"><button className="modal-close" aria-label="关闭参数设置" onClick={onClose}><X size={18}/></button><span className="eyebrow">SCENE PARAMETERS</span><h2>定义可以探索的变量。</h2><p>节点、公式和积木共享这些参数。代码和公式中使用左侧的 ID。</p><div className="parameter-table"><div className="parameter-table-head"><span>ID / 名称</span><span>最小</span><span>最大</span><span>步长</span><span>初值</span><span /></div>{project.parameters.map(p => <div className="parameter-table-row" key={p.id}><label><code>{p.id}</code><input aria-label={`${p.id}显示名称`} maxLength={120} value={p.name} onChange={e => patch(p.id, { name: e.target.value })}/></label>{(['min', 'max', 'step', 'value'] as const).map(field => <input key={field} aria-label={`${p.id} ${field}`} type="number" step="any" value={p[field]} onChange={e => {
        const v = Number(e.target.value);
        if (!Number.isFinite(v) || Math.abs(v) > 10000)
            return;
        if (field === 'min' && v < p.max)
            patch(p.id, { min: v, value: Math.max(v, p.value), step: Math.min(p.step, p.max - v) });
        if (field === 'max' && v > p.min)
            patch(p.id, { max: v, value: Math.min(v, p.value), step: Math.min(p.step, v - p.min) });
        if (field === 'step' && v > 0 && v <= p.max - p.min)
            patch(p.id, { step: v });
        if (field === 'value')
            patch(p.id, { value: Math.max(p.min, Math.min(p.max, v)) });
    }}/>)}<button title={`删除参数 ${p.name}`} onClick={() => remove(p.id)}><Trash2 size={14}/></button></div>)}</div><div className="modal-footer"><span>删除参数会同时移除它的输入节点与动画轨道；手写公式需要自行更新。</span><button disabled={project.parameters.length >= 64} onClick={add}><Plus size={14}/> 添加参数</button><button className="primary" onClick={onClose}>完成</button></div></div></div>;
}
