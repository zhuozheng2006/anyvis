import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { Play, Pause, RotateCcw, ChevronRight, Box, Circle, CircleDot, Waves, ArrowUpRight, Plus, Eye, EyeOff, Download, Upload, Check, Undo2, Redo2, Maximize2, Minimize2, GitBranch, Blocks, Code2, SlidersHorizontal, Layers3, X, Save, Clock3, ChevronDown, MousePointer2, Trash2, Info, Flag, BookOpen } from 'lucide-react';
import type { Cue, Dimension, Project, SceneObject } from './core/types';
import { createDemo, createBlank } from './core/presets';
import { evaluateProject, nextCue, validateProject } from './core/engine';
import { useCodeExtension } from './core/extensions';
import Timeline from './components/Timeline';
import ParameterSettings from './components/ParameterSettings';
const SceneViewport = lazy(() => import('./viewport/SceneViewport'));
const NodeEditor = lazy(() => import('./editors/NodeEditor'));
const BlockEditor = lazy(() => import('./editors/BlockEditor'));
const CodeEditor = lazy(() => import('./editors/CodeEditor'));
const STORAGE = 'anyvis.project.v1';
const icons = { circle: Circle, point: CircleDot, vector: ArrowUpRight, curve: Waves, cube: Box, sphere: Circle };
function download(project: Project) {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[\\/:*?"<>|]/g, '_')}.anyvis.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function initial() {
    try {
        const data = localStorage.getItem(STORAGE);
        if (data) {
            const p = validateProject(JSON.parse(data));
            p.codeEnabled = false;
            return p;
        }
    }
    catch {
        // Keep startup usable if the local draft is malformed.
    }
    return createDemo('2d');
}
export default function App() {
    const [project, setProject] = useState<Project>(initial);
    const [time, setTime] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [tab, setTab] = useState('timeline');
    const [overrides, setOverrides] = useState<Record<string, number>>({});
    const [activeCue, setActiveCue] = useState<Cue | null>(null);
    const [presenting, setPresenting] = useState(false);
    const [newDialog, setNewDialog] = useState(false);
    const [newDimension, setNewDimension] = useState<Dimension>('2d');
    const [help, setHelp] = useState(false);
    const [parameterSettings, setParameterSettings] = useState(false);
    const [saved, setSaved] = useState(true);
    const [message, setMessage] = useState('');
    const [, historyRender] = useState(0);
    const history = useRef<Project[]>([]);
    const future = useRef<Project[]>([]);
    const lastEdit = useRef(0);
    const projectRef = useRef(project);
    projectRef.current = project;
    const timeRef = useRef(time);
    timeRef.current = time;
    const visited = useRef(new Set<string>());
    const inputRef = useRef<HTMLInputElement>(null);
    const notify = useCallback((text: string) => {
        setMessage(text);
    }, []);
    useEffect(() => {
        if (!message)
            return;
        const id = setTimeout(() => setMessage(''), 4000);
        return () => clearTimeout(id);
    }, [message]);
    const update = useCallback((next: Project) => {
        if (next === projectRef.current)
            return;
        const now = Date.now();
        if (now - lastEdit.current > 350) {
            history.current = [...history.current.slice(-79), projectRef.current];
        }
        future.current = [];
        lastEdit.current = now;
        projectRef.current = next;
        setProject(next);
        setSaved(false);
        historyRender(n => n + 1);
    }, []);
    const undo = useCallback(() => {
        const previous = history.current.pop();
        if (!previous)
            return;
        future.current.push(projectRef.current);
        lastEdit.current = 0;
        projectRef.current = previous;
        setProject(previous);
        setOverrides({});
        setPlaying(false);
        historyRender(n => n + 1);
    }, []);
    const redo = useCallback(() => {
        const next = future.current.pop();
        if (!next)
            return;
        history.current.push(projectRef.current);
        lastEdit.current = 0;
        projectRef.current = next;
        setProject(next);
        setOverrides({});
        setPlaying(false);
        historyRender(n => n + 1);
    }, []);
    useEffect(() => {
        setSaved(false);
        const id = setTimeout(() => {
            try {
                localStorage.setItem(STORAGE, JSON.stringify(project));
                setSaved(true);
            }
            catch {
                notify('自动保存不可用，请导出项目文件保存。');
            }
        }, 450);
        return () => clearTimeout(id);
    }, [project, notify]);
    const evaluation = useMemo(() => evaluateProject(project, time, overrides), [project, time, overrides]);
    const extension = useCodeExtension(project, time, evaluation);
    const visibleEvaluation = useMemo(() => ({ ...evaluation, objects: extension.objects }), [evaluation, extension.objects]);
    const seek = useCallback((t: number) => {
        setPlaying(false);
        setActiveCue(null);
        setTime(t);
        timeRef.current = t;
        visited.current = new Set(projectRef.current.cues.filter(c => c.time < t).map(c => c.id));
    }, []);
    const reset = useCallback(() => {
        setPlaying(false);
        setTime(0);
        timeRef.current = 0;
        setOverrides({});
        setActiveCue(null);
        visited.current.clear();
    }, []);
    const play = useCallback(() => {
        if (playing) {
            setPlaying(false);
            return;
        }
        if (timeRef.current >= projectRef.current.duration) {
            setTime(0);
            timeRef.current = 0;
            visited.current.clear();
        }
        setActiveCue(null);
        setPlaying(true);
    }, [playing]);
    useEffect(() => {
        if (!playing)
            return;
        let frame = 0;
        let last = performance.now();
        const tick = (now: number) => {
            const dt = Math.min((now - last) / 1000, .1);
            last = now;
            const p = projectRef.current;
            const before = timeRef.current;
            const next = Math.min(before + dt, p.duration);
            const cue = nextCue(p.cues, before, next, visited.current);
            if (cue) {
                visited.current.add(cue.id);
                timeRef.current = cue.time;
                setTime(cue.time);
                setActiveCue(cue);
                setPlaying(false);
                return;
            }
            timeRef.current = next;
            setTime(next);
            if (next >= p.duration) {
                setPlaying(false);
                return;
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [playing]);
    useEffect(() => {
        if (time > project.duration)
            seek(project.duration);
    }, [project.duration, time, seek]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('input,textarea,select,[contenteditable="true"],.blocklyWidgetDiv,.cm-editor'))
                return;
            if (e.code === 'Space') {
                e.preventDefault();
                play();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey)
                    redo();
                else
                    undo();
            }
            if (e.key === 'Escape') {
                setPresenting(false);
                setNewDialog(false);
                setHelp(false);
                setParameterSettings(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [play, undo, redo]);
    useEffect(() => {
        setPlaying(false);
        setActiveCue(null);
        visited.current = new Set(project.cues.filter(c => c.time < timeRef.current).map(c => c.id));
    }, [project.cues, project.clips]);
    const load = (p: Project) => {
        reset();
        history.current = [];
        future.current = [];
        lastEdit.current = 0;
        setSelected(null);
        projectRef.current = p;
        setProject(p);
        setNewDialog(false);
        setTab('timeline');
    };
    const object = project.objects.find(o => o.id === selected);
    const patchObject = (id: string, patch: Partial<SceneObject>) => {
        if (patch.scale !== undefined)
            patch = { ...patch, scale: Math.max(.001, Math.min(1000, patch.scale)) };
        for (const k of ['x', 'y', 'z', 'rotation'] as const)
            if (patch[k] !== undefined)
                patch[k] = Math.max(-10000, Math.min(10000, patch[k]!));
        update({ ...projectRef.current, objects: projectRef.current.objects.map(o => o.id === id ? { ...o, ...patch } : o) });
    };
    const removeObject = () => {
        if (!object)
            return;
        const nodeIds = new Set(project.nodes.filter(n => n.objectId === object.id).map(n => n.id));
        update({ ...project, objects: project.objects.filter(o => o.id !== object.id), nodes: project.nodes.filter(n => !nodeIds.has(n.id)), edges: project.edges.filter(e => !nodeIds.has(e.source) && !nodeIds.has(e.target)) });
        setSelected(null);
    };
    const addObject = (kind: SceneObject['kind']) => {
        if (project.objects.length >= 200) { notify('当前原型最多支持 200 个对象。'); return; }
        const id = crypto.randomUUID();
        const names = { circle: '圆', point: '点', vector: '向量', curve: '函数曲线', cube: '立方体', sphere: '球体' };
        update({ ...project, objects: [...project.objects, { id, name: `${names[kind]} ${project.objects.length + 1}`, kind, color: kind === 'curve' ? '#a895fa' : '#b5f36c', visible: true, x: 0, y: 0, z: 0, scale: kind === 'point' ? .12 : 1, rotation: 0, ...(kind === 'curve' ? { expression: 'sin(x)' } : {}) }] });
        setSelected(id);
    };
    const importFile = async (file: File) => {
        try {
            if (file.size > 2000000)
                throw Error('项目文件不能超过 2 MB');
            const p = validateProject(JSON.parse(await file.text()));
            p.codeEnabled = false;
            load(p);
            notify('已打开项目。代码扩展需要手动启用。');
        }
        catch (e) {
            notify(`无法打开：${e instanceof Error ? e.message : '文件格式错误'}`);
        }
    };
    const errors = [...evaluation.errors, ...(extension.error ? [extension.error] : [])];
    return <div className={`app ${presenting ? 'presenting' : ''}`}>
  <header className="app-header"><a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="AnyVis"><span className="brand-mark">A<i /></span>AnyVis<span className="version">alpha</span></a><div className="header-divider"/><div className="project-name"><input aria-label="项目名称" value={project.name} maxLength={80} onChange={e => update({ ...project, name: e.target.value })}/><ChevronDown size={13}/></div><span className="save-status">{saved ? <Check size={12}/> : <span className="status-dot"/>}{saved ? '已保存' : '保存中'}</span><div className="header-actions"><button title="使用指南" onClick={() => setHelp(true)}><BookOpen size={15}/><span>指南</span></button><button onClick={() => {
        setNewDimension(project.dimension);
        setNewDialog(true);
    }}><Plus size={15}/><span>新建</span></button><button title="打开项目文件" onClick={() => inputRef.current?.click()}><Upload size={15}/><span>打开</span></button><button title="导出可编辑的 AnyVis JSON 文件" onClick={() => {
        download(project);
        notify('项目文件已导出');
    }}><Download size={15}/><span>导出项目</span></button><button className="primary" onClick={() => setPresenting(!presenting)}>{presenting ? <Minimize2 size={15}/> : <Play size={14}/>}<span>{presenting ? '返回编辑' : '演示'}</span></button></div><input ref={inputRef} hidden type="file" accept=".json,.anyvis" onChange={e => {
        const f = e.target.files?.[0];
        if (f)
            void importFile(f);
        e.target.value = '';
    }}/></header>
  <main className="studio">
   {!presenting && <aside className="left-panel"><div className="panel-title"><span><Layers3 size={14}/> 场景</span><span className="tag">{project.dimension.toUpperCase()}</span></div><div className="scene-root"><ChevronDown size={12}/><Box size={13}/><span>Scene</span><span className="muted">{project.objects.length}</span></div><div className="object-list">{project.objects.map(o => {
        const Icon = icons[o.kind];
        return <div key={o.id} className={`object-row ${selected === o.id ? 'selected' : ''}`}><button className="object-select" onClick={() => setSelected(o.id)}><Icon size={14} style={{ color: o.color }}/><span>{o.name}</span></button><button className="visibility" title={o.visible ? '隐藏对象' : '显示对象'} onClick={() => patchObject(o.id, { visible: !o.visible })}>{o.visible ? <Eye size={12}/> : <EyeOff size={12}/>}</button></div>;
    })}</div><div className="library-head">对象库 <span>添加到场景</span></div><div className="object-library">{(project.dimension === '2d' ? ['circle', 'point', 'vector', 'curve'] : ['cube', 'sphere', 'point', 'vector', 'circle', 'curve']).map(k => {
        const kind = k as SceneObject['kind'];
        const Icon = icons[kind];
        return <button key={kind} onClick={() => addObject(kind)}><Icon size={20}/><span>{{ circle: '圆', point: '点', vector: '向量', curve: '函数', cube: '立方体', sphere: '球体' }[kind]}</span><Plus size={11}/></button>;
    })}</div><div className="sidebar-bottom"><div className="mini-orbit"><i /><i /><i /></div><strong>让想法动起来。</strong><p>对象定义内容，节点连接关系，<br />时间轴讲述过程。</p><button onClick={() => setHelp(true)}>开始探索 <ArrowUpRight size={13}/></button></div></aside>}
   <section className="center-panel"><div className="viewport-header"><div><span className="live-dot"/> 实时预览 <span className="subtle">/</span><span className="muted">{project.dimension === '2d' ? '二维画布' : '三维空间'}</span></div><div><button title="撤销" disabled={!history.current.length} onClick={undo}><Undo2 size={14}/></button><button title="重做" disabled={!future.current.length} onClick={redo}><Redo2 size={14}/></button><span className="toolbar-divider"/><span className="engine-label">{project.dimension === '2d' ? 'SVG' : 'WebGL'}</span><button title={presenting ? '返回编辑' : '放大预览'} onClick={() => setPresenting(!presenting)}><Maximize2 size={14}/></button></div></div><div className="stage"><Suspense fallback={<div className="loading-state">正在准备画布…</div>}><SceneViewport project={project} evaluation={visibleEvaluation} time={time} selectedId={selected} onSelect={setSelected} onObjectChange={patchObject} presentation={presenting}/></Suspense><div className="stage-caption"><span>EXPERIMENT {project.dimension === '2d' ? '01' : '02'}</span><h1>{project.name}</h1><p>{project.dimension === '2d' ? '从几何运动，看见函数的形状' : '拖动视角，从另一个维度观察变化'}</p></div>{activeCue && <div className="cue-card"><div className="cue-icon"><SlidersHorizontal size={19}/></div><div><span className="eyebrow">你的探索时间</span><strong>{activeCue.title}</strong><p>{activeCue.description}</p></div><button className="primary" onClick={play}>继续 <Play size={13}/></button></div>}{errors.length > 0 && <div className="error-banner"><Info size={14}/>{errors[0]}{errors.length > 1 && `（共 ${errors.length} 项）`}</div>}</div><div className="transport"><div className="transport-main"><button title="回到开始" onClick={reset}><RotateCcw size={16}/></button><button className="play-button" title={playing ? '暂停' : '播放'} aria-label={playing ? '暂停' : '播放'} onClick={play}>{playing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</button><span className="time-display">{time.toFixed(2)}<span> / {project.duration.toFixed(2)} s</span></span></div><input className="playback-slider" aria-label="播放进度" type="range" min="0" max={project.duration} step="0.01" value={time} onChange={e => seek(Number(e.target.value))}/><div className="transport-right"><span>{activeCue ? <><Flag size={12}/> 等待交互</> : playing ? '正在播放' : '空格键播放'}</span></div></div>
    {!presenting && <section className="editor-panel"><div className="editor-tabs">{[{ id: 'timeline', name: '时间轴', icon: Clock3 }, { id: 'nodes', name: '节点', icon: GitBranch }, { id: 'blocks', name: '积木', icon: Blocks }, { id: 'code', name: '代码', icon: Code2 }].map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}><t.icon size={14}/>{t.name}{tab === t.id && <span className="active-tab-dot"/>}</button>)}<span className="tab-hint">{tab === 'timeline' ? '编排每一次变化' : tab === 'nodes' ? '连接数据与视觉' : tab === 'blocks' ? '用积木组织你的讲解' : '为想象力保留一个出口'}</span></div><div className="editor-content"><Suspense fallback={<div className="loading-state">正在加载编辑器…</div>}>{tab === 'timeline' ? <Timeline project={project} time={time} onSeek={seek} onChange={update}/> : tab === 'nodes' ? <NodeEditor project={project} onChange={update} values={evaluation.nodeValues}/> : tab === 'blocks' ? <BlockEditor project={project} onChange={update}/> : <CodeEditor project={project} onChange={update}/>}</Suspense></div></section>}
   </section>
   <aside className="inspector"><div className="panel-title"><span><SlidersHorizontal size={14}/> {presenting ? '探索参数' : '检查器'}</span><span className="tiny-badge">LIVE</span></div><div className="inspector-section"><div className="section-heading"><h2>场景参数</h2>{!presenting && <button title="管理场景参数" onClick={() => setParameterSettings(true)}><Plus size={13}/></button>}<button title="恢复时间轴控制" onClick={() => setOverrides({})}><RotateCcw size={13}/></button></div><p className="section-description">试着拖动滑块，画面会随之改变。</p>{project.parameters.map(p => <div className="parameter" key={p.id}><div className="parameter-label"><label htmlFor={`param-${p.id}`}><i style={{ background: p.color }}/>{p.name}</label><input aria-label={`${p.name}数值`} type="number" min={p.min} max={p.max} step={p.step} value={+(evaluation.parameters[p.id] ?? p.value).toFixed(3)} onChange={e => {
        const value = Number(e.target.value);
        if (Number.isFinite(value))
            setOverrides(o => ({ ...o, [p.id]: Math.max(p.min, Math.min(p.max, value)) }));
    }}/></div><input id={`param-${p.id}`} aria-label={p.name} type="range" min={p.min} max={p.max} step={p.step} value={evaluation.parameters[p.id] ?? p.value} style={{ '--range-color': p.color } as React.CSSProperties} onChange={e => setOverrides(o => ({ ...o, [p.id]: Number(e.target.value) }))}/><div className="range-labels"><span>{p.min}</span><span>{p.id in overrides ? <button onClick={() => setOverrides(v => {
        const n = { ...v };
        delete n[p.id];
        return n;
    })}>手动控制 · 释放</button> : p.id}</span><span>{p.max}</span></div></div>)}{Object.keys(overrides).length > 0 && <button className="subtle-button full-width" onClick={() => {
        update({ ...project, parameters: project.parameters.map(p => ({ ...p, value: overrides[p.id] ?? p.value })) });
        notify('当前参数已保存为初始值；动画轨道仍可驱动这些参数。');
    }}><Save size={12}/> 保存为初始参数</button>}</div>
   {!presenting && <><div className="inspector-section"><div className="section-heading"><h2>{object ? '对象属性' : '选择一个对象'}</h2>{object && <button title="删除对象" onClick={removeObject}><Trash2 size={13}/></button>}</div>{object ? <><label className="field-row">名称<input aria-label="对象名称" maxLength={120} value={object.name} onChange={e => patchObject(object.id, { name: e.target.value })}/></label><label className="field-row">颜色<div className="color-field"><input aria-label="对象颜色" type="color" value={object.color} onChange={e => patchObject(object.id, { color: e.target.value })}/><span>{object.color}</span></div></label><div className="position-fields">{(['x', 'y', ...(project.dimension === '3d' ? ['z'] : [])] as ('x' | 'y' | 'z')[]).map(k => <label key={k}>{k.toUpperCase()}<input aria-label={`对象 ${k}`} type="number" step="0.1" value={object[k]} onChange={e => {
        const value = Number(e.target.value);
        if (Number.isFinite(value))
            patchObject(object.id, { [k]: value });
    }}/></label>)}</div><div className="position-fields">{(['scale', 'rotation'] as const).map(k => <label key={k}>{k === 'scale' ? '尺寸' : '旋转 (rad)'}<input aria-label={k === 'scale' ? '对象尺寸' : '对象旋转'} type="number" step="0.1" value={object[k]} onChange={e => {
        const value = Number(e.target.value);
        if (Number.isFinite(value))
            patchObject(object.id, { [k]: value });
    }}/></label>)}</div>{object.kind === 'curve' && <label className="formula-field">函数 f(x)<input aria-label="曲线表达式" maxLength={240} value={object.expression ?? 'sin(x)'} onChange={e => patchObject(object.id, { expression: e.target.value })}/><small>支持 x、t、参数名、sin、cos 等。</small></label>}{project.nodes.some(n => n.objectId === object.id) && <p className="linked-notice"><GitBranch size={12}/> 部分属性由节点驱动，在节点页调整关联。</p>}</> : <div className="empty-selection"><MousePointer2 size={23}/><p>点击画布或左侧场景中的对象，<br />查看和编辑它的属性。</p></div>}</div><div className="inspector-section flow-summary"><span className="eyebrow">互动课件</span><h3>播放 → 探索 → 继续</h3><p>时间轴上的旗标是交互停顿。<br />讲解与探索，可以在同一场景中发生。</p><div><span>{project.cues.length} 个交互节点</span><ChevronRight size={13}/></div></div></>}
   </aside>
  </main>
  <footer className="status-bar"><div><span className="live-dot"/> AnyVis Studio <span className="subtle">·</span> {project.objects.length} 个对象 <span className="subtle">·</span> {project.nodes.length} 个节点</div><div>{extension.pending ? '扩展计算中' : Object.keys(overrides).length ? '参数处于手动探索状态' : '就绪'}<span className="subtle">|</span><span>v0.1 · Local first</span></div></footer>
  {message && <div className="toast" role="status"><Info size={15}/>{message}</div>}
  {newDialog && <div className="modal-backdrop" onMouseDown={e => {
        if (e.target === e.currentTarget)
            setNewDialog(false);
    }}><div className="modal new-project"><button className="modal-close" aria-label="关闭" onClick={() => setNewDialog(false)}><X size={18}/></button><span className="eyebrow">A CANVAS FOR YOUR IDEAS</span><h2>从一个新的世界开始。</h2><p>选择维度，再选择从示例还是空白场景出发。</p><div className="dimension-options"><button className={newDimension === '2d' ? 'chosen' : ''} onClick={() => setNewDimension('2d')}><div className="dimension-art art-2d"><Circle size={60}/><span /></div><strong>二维画布 <span>2D</span></strong><p>函数、几何与算法的直观表达</p></button><button className={newDimension === '3d' ? 'chosen' : ''} onClick={() => setNewDimension('3d')}><div className="dimension-art art-3d"><Box size={60}/></div><strong>三维空间 <span>3D</span></strong><p>向量、空间运动与立体构造</p></button></div><div className="modal-footer"><span>当前项目已自动保存在本机；新建将覆盖当前草稿。</span><button onClick={() => load(createBlank(newDimension))}>空白项目</button><button className="primary" onClick={() => load(createDemo(newDimension))}>打开示例 <ArrowUpRight size={15}/></button></div></div></div>}
  {parameterSettings && <ParameterSettings project={project} onChange={update} onClose={() => setParameterSettings(false)}/>}
  {help && <div className="modal-backdrop"><div className="modal guide"><button className="modal-close" aria-label="关闭指南" onClick={() => setHelp(false)}><X size={18}/></button><span className="eyebrow">QUICK START</span><h2>你的第一段交互可视化</h2><ol><li><strong>播放与探索</strong><p>按空格开始。遇到旗标会自动暂停；拖动右侧参数，再点击继续。手动参数会保持，点击“释放”交还时间轴。</p></li><li><strong>组织场景</strong><p>从左侧加入对象，在检查器修改。二维未被绑定的位置可直接拖动；三维可拖动旋转视角。</p></li><li><strong>连接与编排</strong><p>节点页把时间、参数、公式连接到对象属性；积木页拖入动作、等待或交互积木，再应用到时间轴。两者分别管理关系与讲解顺序。</p></li><li><strong>保存与扩展</strong><p>草稿自动保存在浏览器，导出项目可在此编辑器重新打开。代码页可选用 JavaScript 修改对象。当前版本提供实时课件预览，尚未实现视频或独立课件导出。</p></li></ol><button className="primary" onClick={() => setHelp(false)}>开始创作 <ArrowUpRight size={14}/></button></div></div>}
 </div>;
}
