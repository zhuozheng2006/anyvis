import { useEffect, useMemo, useRef, useState } from 'react';
import { API_ENTRIES, API_REGISTRY, API_CHINESE_NAMES, apiDocumentation, searchApi } from '../core/api-registry';
import './api-editor.css';
import { getBlockDefinition } from '../core/catalog';
import { managedDefinition } from '../authoring';
export function ApiBrowser({ onAdd, onClose, mode = 'all' }: {
    onAdd: (type: string) => void;
    onClose: () => void;
    mode?: 'all' | 'objects' | 'actions';
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('');
    const [kind, setKind] = useState('');
    const [page, setPage] = useState(0);
    useEffect(() => { const d = dialog.current; d?.showModal(); d?.querySelector('input')?.focus(); return () => d?.close(); }, []);
    const results = useMemo(() => searchApi(query, category, kind).filter(e => mode === 'all' || managedDefinition(getBlockDefinition(e.type)) === (mode === 'objects')), [query, category, kind, mode]);
    const categories = useMemo(() => [...new Set(API_ENTRIES.map(e => e.category))].sort(), []);
    const label: Record<string, string> = { class: '创建对象', function: '函数', method: '对象方法', property: '属性', classmethod: '类方法', staticmethod: '静态方法' };
    return <dialog className="av-api-browser" ref={dialog} onCancel={onClose} aria-labelledby="av-api-title">
    <header><h2 id="av-api-title">Manim API 浏览器</h2><button onClick={onClose} aria-label="关闭 API 浏览器">关闭</button></header>
    <p>按名称查找功能，加入积木后填写参数。留空的可选参数使用 Manim 默认值；返回值可在后续积木中选择。</p>
    <small>签名来源：Manim {API_REGISTRY.engineVersion} · {API_ENTRIES.length.toLocaleString()} 个入口 · 入口可编排不代表所有参数组合均已实测</small>
    <div className="av-api-actions"><button onClick={() => { onAdd('api_value'); onClose(); }}>参数值 / 回调函数</button><button onClick={() => { onAdd('api_context'); onClose(); }}>临时设置容器</button></div>
    <div className="av-api-browser-tools"><input autoFocus placeholder="搜索，如 Circle、rotate、plot…" aria-label="搜索 Manim API" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/><select aria-label="API 分类" value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="">全部分类</option>{categories.map(c => <option key={c}>{c}</option>)}</select><select aria-label="API 类型" value={kind} onChange={e => { setKind(e.target.value); setPage(0); }}><option value="">全部类型</option>{Object.entries(label).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    <div className="av-api-browser-list">{results.slice(page * 20, page * 20 + 20).map(e => <article key={e.id}><div><code>{e.path}{API_CHINESE_NAMES[e.path] ? ` · ${API_CHINESE_NAMES[e.path]}` : ''}</code><p>{e.description || e.id}</p><small>{label[e.kind]} · {e.parameters.filter(p => p.required).length} 个必填参数{e.renderer === 'opengl' ? ' · 需要 OpenGL 渲染器' : ''}{e.requiresTrust ? ' · 本机权限调用' : ''}</small></div><aside><button className="primary" onClick={() => { onAdd(e.type); onClose(); }}>加入积木</button><a href={apiDocumentation(e)} target="_blank" rel="noreferrer">官方说明 ↗</a></aside></article>)}{!results.length && <p>没有匹配项。可尝试英文方法名或减少筛选条件。</p>}</div>
    <footer><span>{results.length} 项 · 第 {page + 1} / {Math.max(1, Math.ceil(results.length / 20))} 页</span><div><button disabled={!page} onClick={() => setPage(p => p - 1)}>上一页</button> <button disabled={(page + 1) * 20 >= results.length} onClick={() => setPage(p => p + 1)}>下一页</button></div></footer>
  </dialog>;
}
