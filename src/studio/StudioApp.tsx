import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, Clapperboard, Code2, Copy, Download, FilePlus2, FolderOpen, LayoutGrid, Loader2, Maximize2, Pause, Play, Plus, Redo2, RefreshCw, Save, Search, Settings2, Sparkles, Undo2, Upload, WandSparkles, X } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import type { Action, Project } from './core/types';
import { BLOCK_CATALOG } from './core/catalog';
import { compileProject } from './core/compiler';
import { exportStandalonePython } from './core/export';
import { createEmptyProject, validateProject } from './core/project';
import { StudioBlocks, type StudioBlocksHandle } from './blocks/StudioBlocks';
import { templateCatalog, getTemplate } from './templates';
import { api, startRender, type EngineHealth, type RenderJob } from './api';
import { downloadText, fileName, readCurrent, readProjects, saveLatestProject, saveProject } from './storage';
import { builtinPreview, type VideoPreview } from './previews';
import { outlineRows, stepTiming } from './outline';
import { COMMON_COLOURS } from './blocks/colour-field';
import './studio.css';

type Modal = 'templates' | 'projects' | 'settings' | 'help' | 'ai' | 'export' | null;
const definitions = new Map(BLOCK_CATALOG.map(block => [block.type, block]));
const fmt = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
function allActions(actions: Action[]): Action[] { return actions.flatMap(a => [a, ...allActions(a.children || []), ...(a.branches || []).flatMap(allActions)]); }
function revisionOf(project: Project) {
  const value = JSON.stringify([project.scene, project.actions]);
  let hash = 2166136261; for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `${project.id}:${(hash >>> 0).toString(16)}`;
}
function initialProject(): Project { return readCurrent() || getTemplate('first-animation') || createEmptyProject(); }

export default function StudioApp() {
  const [project, setProject] = useState<Project>(initialProject);
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [healthError, setHealthError] = useState('');
  const [job, setJob] = useState<RenderJob | null>(null);
  const [video, setVideo] = useState<VideoPreview | null>(() => builtinPreview(project, revisionOf(project)));
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [editorTab, setEditorTab] = useState<'blocks' | 'code'>('blocks');
  const [autoPreview, setAutoPreview] = useState(true);
  const [trusted, setTrusted] = useState(false);
  const [time, setTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [quality, setQuality] = useState<'preview' | 'final'>('preview');
  const [renderError, setRenderError] = useState('');
  const [gallerySearch, setGallerySearch] = useState('');
  const [aiTab, setAiTab] = useState<'generate' | 'import'>('generate');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiEndpoint, setAiEndpoint] = useState('https://api.openai.com/v1');
  const [aiModel, setAiModel] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [aiJson, setAiJson] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiCandidate, setAiCandidate] = useState<Project | null>(null);
  const [aiSummary, setAiSummary] = useState('');
  const editor = useRef<StudioBlocksHandle>(null);
  const player = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const requestCounter = useRef(0);
  const pendingFinal = useRef(false);
  const pendingManualRender = useRef<'preview' | 'final' | null>(null);
  const aiAbort = useRef<AbortController | null>(null);
  const healthTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRevision = revisionOf(project);
  const revisionRef = useRef(currentRevision); revisionRef.current = currentRevision;
  const projectRef = useRef(project); projectRef.current = project;
  const jobRef = useRef(job); jobRef.current = job;
  const previousRevision = useRef(currentRevision);
  const compiled = useMemo(() => compileProject(project), [project]);
  const errors = compiled.diagnostics.filter(item => item.severity === 'error');
  const flattened = useMemo(() => allActions(project.actions), [project.actions]);
  const outline = useMemo(() => outlineRows(project.actions), [project.actions]);
  const selectedAction = flattened.find(item => item.id === selected);
  const selectedDefinition = selectedAction ? definitions.get(selectedAction.type) : undefined;
  const positionable = !!selectedDefinition?.createsObject && ['x', 'y'].every(name => selectedDefinition.fields.some(field => field.name === name));
  const morphTarget = selectedAction && ['transform', 'replacement_transform', 'matching_tex'].includes(selectedAction.type) ? flattened.find(action => action.fields.name === selectedAction.fields.destination && 'appear' in action.fields) : undefined;
  const running = job?.status === 'running' || job?.status === 'queued';
  const currentVideo = video?.revision === currentRevision;
  const [activeQuality, setActiveQuality] = useState<'preview' | 'final'>('preview');

  useEffect(() => {
    if (previousRevision.current === currentRevision) return;
    previousRevision.current = currentRevision;
    requestCounter.current++; pendingFinal.current = false;
    const previous = jobRef.current;
    if (previous?.id && ['running', 'queued'].includes(previous.status)) {
      void api(`/api/jobs/${previous.id}`, { method: 'DELETE' }).catch(() => {});
    }
    setJob(null); setRenderError('');
  }, [currentRevision]);
  useEffect(() => { setTrusted(false); }, [compiled.requiresTrust ? compiled.code : '']);

  const notify = useCallback((message: string) => { setNotice(message); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4200); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    setSaved(false);
    if (!project.name.trim()) return;
    const timer = setTimeout(() => {
      try { saveProject(project); setSaved(true); setSaveError(''); }
      catch { setSaveError('浏览器空间不足，请导出项目文件备份。'); }
    }, 450);
    return () => clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const dialog = document.querySelector<HTMLElement>('.studio-modal');
      dialog?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, button')?.focus();
    });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('.studio-modal');
      const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus(); };
  }, [modal]);

  const checkHealth = useCallback(async (): Promise<void> => {
    if (healthTimer.current) clearTimeout(healthTimer.current);
    try { const result = await api<EngineHealth>('/api/health'); setHealth(result); setHealthError('');
      if (result.checking) healthTimer.current = setTimeout(() => void checkHealth(), 800);
    }
    catch (error) { setHealth(null); setHealthError((error as Error).message); }
  }, []);
  useEffect(() => { void checkHealth(); return () => { if (healthTimer.current) clearTimeout(healthTimer.current); }; }, [checkHealth]);

  const acceptJob = useCallback((next: RenderJob, renderQuality: 'preview' | 'final') => {
    if (next.revision && next.revision !== revisionRef.current) return;
    setJob(next);
    if (next.status === 'done' && next.videoUrl) {
      setVideo({ url: next.videoUrl, poster: next.posterUrl, revision: next.revision || revisionRef.current, quality: renderQuality, format: next.videoUrl.endsWith('.webm') ? 'webm' : 'mp4' });
      setRenderError(''); setTime(0); setPlaying(false);
      if (renderQuality === 'final' && pendingFinal.current) { pendingFinal.current = false; setModal('export'); }
    } else if (next.status === 'error') {
      pendingFinal.current = false;
      setRenderError(next.error || next.message || '渲染未完成，请检查积木和环境。');
      if (next.blockId) { setSelected(next.blockId); editor.current?.highlight(next.blockId); }
    }
  }, []);

  const render = useCallback(async (renderQuality: 'preview' | 'final' = 'preview') => {
    if (pendingFinal.current && ['queued', 'running'].includes(jobRef.current?.status || '')) return;
    try {
      const latest = editor.current?.snapshot() || project;
      if (revisionOf(latest) !== currentRevision) { pendingManualRender.current = renderQuality; setProject(latest); return; }
    } catch (error) { setRenderError((error as Error).message); return; }
    if (errors.length) { setRenderError('先修正下方标出的积木，再生成预览。'); return; }
    if (compiled.requiresTrust && !trusted) { setRenderError('作品包含 Python 扩展。请在“Python”页检查内容，并允许本次作品运行代码后再预览。'); setEditorTab('code'); return; }
    if (!health?.available) { setRenderError('渲染引擎尚未就绪。请使用 AnyVis 启动器，或在下方重新检查环境。'); return; }
    pendingFinal.current = renderQuality === 'final';
    const request = ++requestCounter.current;
    const revision = currentRevision;
    setRenderError(''); setActiveQuality(renderQuality);
    setJob({ id: '', status: 'queued', progress: 0, message: '正在提交渲染任务…', revision });
    try {
      const next = await startRender(project, renderQuality, revision, trusted);
      if (request !== requestCounter.current || revision !== revisionRef.current) {
        if (next.id) void api(`/api/jobs/${next.id}`, { method: 'DELETE' }).catch(() => {});
        return;
      }
      acceptJob({ ...next, revision: next.revision || revision }, renderQuality);
    } catch (error) {
      if (request !== requestCounter.current) return;
      pendingFinal.current = false; setRenderError((error as Error).message); setJob(null);
    }
  }, [project, currentRevision, health?.available, errors.length, compiled.requiresTrust, trusted, acceptJob]);
  const renderRef = useRef(render); renderRef.current = render;
  useEffect(() => {
    const requested = pendingManualRender.current;
    if (!requested) return;
    pendingManualRender.current = null;
    const timer = setTimeout(() => void renderRef.current(requested), 0);
    return () => clearTimeout(timer);
  }, [currentRevision]);

  useEffect(() => {
    if (!autoPreview || !health?.available || errors.length || compiled.requiresTrust || !project.actions.length) return;
    if (pendingFinal.current) return;
    const timer = setTimeout(() => { if (!pendingFinal.current) void renderRef.current('preview'); }, 1400);
    return () => clearTimeout(timer);
  }, [currentRevision, autoPreview, health?.available, errors.length, compiled.requiresTrust, project.actions.length]);

  useEffect(() => {
    if (!job?.id || !running) return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const generation = requestCounter.current;
    const poll = async () => {
      try {
        const next = await api<RenderJob>(`/api/jobs/${job.id}`);
        if (!active || generation !== requestCounter.current) return;
        acceptJob({ ...next, revision: next.revision || job.revision }, activeQuality);
        if (next.status === 'running' || next.status === 'queued') timer = setTimeout(poll, 650);
      } catch (error) { if (active && generation === requestCounter.current) { pendingFinal.current = false; setRenderError((error as Error).message); setJob(null); } }
    };
    timer = setTimeout(poll, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [job?.id, running, acceptJob, activeQuality]);

  const cancel = useCallback(async () => {
    const target = jobRef.current;
    requestCounter.current++; pendingFinal.current = false;
    setJob(previous => previous?.id === target?.id ? { ...previous!, status: 'cancelled', message: '已停止渲染' } : previous);
    if (target?.id) { try { await api(`/api/jobs/${target.id}`, { method: 'DELETE' }); } catch (error) { notify(`停止请求未送达：${(error as Error).message}`); } }
  }, [notify]);
  const replaceProject = useCallback((next: Project) => {
    try { saveProject(editor.current?.snapshot() || projectRef.current); }
    catch { setSaveError('当前作品保存失败，请先导出项目文件，再切换作品。'); notify('暂未切换：请先导出当前作品，避免丢失修改。'); return false; }
    const previous = jobRef.current;
    requestCounter.current++; pendingFinal.current = false;
    if (previous?.id && ['running', 'queued'].includes(previous.status)) void api(`/api/jobs/${previous.id}`, { method: 'DELETE' }).catch(() => {});
    aiAbort.current?.abort(); aiAbort.current = null; setAiLoading(false); setAiCandidate(null);
    setProject(next); setSelected(null); setTrusted(false); setVideo(builtinPreview(next, revisionOf(next))); setJob(null); setRenderError('');
    setTime(0); setPlaying(false); setModal(null); setEditorTab('blocks');
    return true;
  }, [notify]);
  const exportProject = useCallback(() => {
    try {
      const latest = editor.current?.snapshot() || projectRef.current;
      downloadText(`${fileName(latest.name)}.anyvis.json`, JSON.stringify(latest, null, 2));
      notify('项目已导出，可在任何 AnyVis 中继续编辑。');
    } catch (error) { notify(`保存失败：${(error as Error).message}`); }
  }, [notify]);
  useEffect(() => {
    const flush = () => {
      try { saveLatestProject(() => editor.current?.snapshot(), projectRef.current); }
      catch { setSaveError('浏览器保存未完成，请导出项目文件备份。'); }
    };
    const visibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => { flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); exportProject(); }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void renderRef.current('preview'); }
      if (event.key === 'Escape') setModal(null);
    };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  }, [exportProject]);
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('项目文件过大，请选择 8 MB 以内的 .anyvis.json。');
      const value = JSON.parse(await file.text());
      if (value.schemaVersion !== 2) throw new Error('这是旧版课件或其他格式。旧课件可用 ?legacy=1 打开；新版请导入 v2 积木项目。原文件没有被修改。');
      if (replaceProject(validateProject(value))) notify('已打开项目。');
    } catch (error) { notify(`打开失败：${(error as Error).message}`); }
    if (input.current) input.current.value = '';
  };
  const chooseStep = (id: string) => { setSelected(id); setEditorTab('blocks'); setTimeout(() => editor.current?.highlight(id), 40); };
  const play = () => { if (!player.current || !video) return; if (player.current.paused) void player.current.play().catch(() => notify('请点击播放重试。')); else player.current.pause(); };
  const seek = (value: number) => { if (player.current) { player.current.currentTime = value; setTime(value); } };

  const importAI = async () => {
    setAiError('');
    try {
      const { parseAIProject } = await import('./ai/project-assistant');
      const next = parseAIProject(aiJson, project);
      setAiCandidate(next); setAiSummary('已验证项目结构，可以继续在积木中修改。');
    } catch (error) { setAiError((error as Error).message); }
  };
  const copyPrompt = async () => {
    setAiError('');
    let text: string;
    try {
      const { buildPrompt } = await import('./ai/project-assistant');
      text = buildPrompt(project, aiPrompt || '改进这个动画，保留可编辑的原生积木。');
    } catch (error) { setAiError((error as Error).message); return; }
    try { await navigator.clipboard.writeText(text); notify('已复制项目与积木说明，可交给你使用的 AI。'); }
    catch { setAiError('无法访问剪贴板，请使用“导出提示词”。'); }
  };
  const downloadPrompt = async () => {
    setAiError('');
    try {
      const { buildPrompt } = await import('./ai/project-assistant');
      downloadText('AnyVis-AI-prompt.txt', buildPrompt(project, aiPrompt || '改进这个动画。'), 'text/plain');
    } catch (error) { setAiError((error as Error).message); }
  };
  const generateAI = async () => {
    if (!aiPrompt.trim() || !aiModel.trim()) { setAiError('填写制作要求与模型名称后即可生成。'); return; }
    aiAbort.current?.abort(); const controller = new AbortController(); aiAbort.current = controller;
    const baseRevision = currentRevision;
    setAiLoading(true); setAiError(''); setAiCandidate(null);
    try {
      const result = await api<{ project: Project; summary?: string }>('/api/ai', { method: 'POST', body: JSON.stringify({ endpoint: aiEndpoint, model: aiModel, key: aiKey, prompt: aiPrompt, project }), signal: controller.signal });
      if (controller !== aiAbort.current) return;
      if (baseRevision !== revisionRef.current) throw new Error('作品已在生成期间发生变化，请基于当前版本重新生成。');
      setAiCandidate(validateProject(result.project)); setAiSummary(result.summary || '已生成一份可编辑的积木作品。');
    } catch (error) { if (controller === aiAbort.current && (error as Error).name !== 'AbortError') setAiError((error as Error).message); }
    finally { if (controller === aiAbort.current) setAiLoading(false); }
  };

  return <div className="studio-app">
    <header className="studio-header">
      <button type="button" className="studio-brand" onClick={() => setModal('templates')} aria-label="浏览作品示例"><span className="studio-logo"><span/><span/><span/></span><span>AnyVis<small>STUDIO</small></span></button>
      <span className="header-divider"/>
      <div className="project-title"><input aria-label="作品名称" value={project.name} maxLength={80} onBlur={() => { if (!project.name.trim()) setProject(p => ({ ...p, name: '未命名动画' })); }} onChange={e => setProject(p => ({ ...p, name: e.target.value }))}/><span className={saveError ? 'save-status error' : 'save-status'}>{saveError ? '需要备份' : saved ? <><Check size={12}/> 已自动保存</> : '保存中…'}</span></div>
      <div className="header-spacer"/>
      <button className="header-button" title="我的作品" aria-label="我的作品" onClick={() => setModal('projects')}><FolderOpen size={16}/><span>我的作品</span></button>
      <button className="header-button" title="示例库" aria-label="示例库" onClick={() => setModal('templates')}><LayoutGrid size={16}/><span>示例库</span></button>
      <button className="header-button" onClick={exportProject} title="保存项目文件 · ⌘/Ctrl S"><Save size={16}/><span>保存</span></button>
      <button className="ai-button" onClick={() => { setModal('ai'); setAiError(''); }}><Sparkles size={16}/> AI 助手</button>
      <button className="export-button" onClick={() => { setModal('export'); }}><ArrowDownToLine size={16}/> 导出</button>
      <button className="icon-button help-button" onClick={() => setModal('help')} aria-label="使用指南"><CircleHelp size={19}/></button>
    </header>

    <main className="studio-main">
      <section className="blocks-panel" aria-label="动画编排">
        <div className="panel-heading">
          <div className="editor-tabs"><button className={editorTab === 'blocks' ? 'active' : ''} onClick={() => setEditorTab('blocks')}><Clapperboard size={16}/> 积木编排</button><button className={editorTab === 'code' ? 'active' : ''} onClick={() => setEditorTab('code')}><Code2 size={16}/> Python</button></div>
          <div className="workspace-tools"><button className="icon-button" onClick={() => editor.current?.undo()} title="撤销" aria-label="撤销"><Undo2 size={16}/></button><button className="icon-button" onClick={() => editor.current?.redo()} title="重做" aria-label="重做"><Redo2 size={16}/></button><span/><button className="icon-button" onClick={() => setModal('settings')} title="画面设置" aria-label="画面设置"><Settings2 size={16}/></button></div>
        </div>
        <div className="workspace-intro"><span className="tiny-dot"/><span>从左侧选一块积木，接到动画中。</span><button onClick={() => setModal('templates')}>从示例开始 <ArrowRight size={12}/></button></div>
        <div className="workspace-content" style={{ display: editorTab === 'blocks' ? 'flex' : 'none' }}>
          <StudioBlocks ref={editor} project={project} onChange={setProject} onSelect={setSelected} selectedBlockId={selected || undefined} highlightedBlockId={job?.blockId} onWorkspaceError={message => setRenderError(message || '')}/>
        </div>
        {editorTab === 'code' && <div className="python-view"><div className="code-intro"><div><strong>由积木生成的 Manim 源码</strong><p>可以导出独立运行；在积木中修改会同步更新这里。</p></div><button className="small-button" disabled={!!errors.length} onClick={() => { try { downloadText(`${fileName(project.name)}.py`, exportStandalonePython(editor.current?.snapshot() || project), 'text/x-python'); } catch (error) { notify((error as Error).message); } }}><Download size={14}/> 导出 .py</button></div><CodeMirror value={compiled.code} editable={false} height="100%" basicSetup={{ lineNumbers: true, foldGutter: true }} theme="light"/>{compiled.requiresTrust && <label className="trust-code"><input type="checkbox" checked={trusted} onChange={e => setTrusted(e.target.checked)}/> 我已检查此作品的 Python 扩展，允许它在本机运行。</label>}</div>}
        <div className="workspace-footer"><span>{flattened.length} 个积木<span className="footer-separator">·</span>{project.scene.dimension === '3d' ? '三维场景' : '二维场景'}</span><span>{compiled.duration === null ? '动态时长' : `约 ${compiled.duration.toFixed(1)} 秒`}<span className="footer-separator">·</span>Manim 原生动画</span></div>
      </section>

      <aside className="stage-column">
        <section className="preview-panel" aria-label="动画预览">
          <div className="panel-heading"><div className="panel-title"><span className="live-dot"/>舞台预览</div><div className="preview-heading-tools"><span className="dimension-badge">{project.scene.dimension.toUpperCase()}</span><button className="icon-button" aria-label="全屏预览" onClick={() => void stage.current?.requestFullscreen()}><Maximize2 size={15}/></button></div></div>
          <div className="stage-shell" ref={stage} style={{ background: project.scene.background }}>
            {video ? <video key={video.url} ref={player} src={video.url} poster={video.poster} playsInline preload="auto" onLoadedMetadata={() => { setVideoDuration(player.current?.duration || 0); setTime(0); }} onTimeUpdate={() => setTime(player.current?.currentTime || 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onClick={play} onError={() => setRenderError('视频加载失败，请重新生成预览。')}/> : <div className="stage-placeholder"><span className="stage-placeholder-icon"><Clapperboard size={28}/></span><strong>{running ? '让想法动起来' : '你的动画，从这里开始'}</strong><p>{running ? 'Manim 正在生成真实画面' : project.actions.length ? '点击生成预览，观看积木的效果' : '添加一个图形，再为它安排动画'}</p>{!running && <button onClick={() => void render('preview')}><Play size={14}/> 生成预览</button>}</div>}
            {running && job?.posterUrl && <img className="live-render-frame" src={job.posterUrl} alt="Manim 正在生成的实际画面"/>}
            {running && <div className="render-overlay"><Loader2 className="spin" size={14}/><span>{job?.message || '正在渲染…'}</span><button onClick={() => void cancel()} aria-label="停止渲染"><X size={14}/></button></div>}
            {video && !currentVideo && !running && <button className="stale-preview" onClick={() => void render('preview')}>积木已修改 · 点击更新画面</button>}
            {video && currentVideo && <div className="stage-watermark">{video.builtin ? '示例预览 · Manim 预渲染' : video.quality === 'final' ? '高清成片' : '真实 Manim 预览'}</div>}
          </div>
          <div className="player-controls"><button className="play-control" onClick={play} disabled={!video} title={playing ? '暂停播放' : currentVideo ? '播放已生成的动画' : '播放上一次生成的动画；修改后请更新预览'} aria-label={playing ? '暂停播放' : '播放动画'}>{playing ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}</button><span className="player-time">{fmt(time)}</span><input aria-label="播放进度" type="range" min={0} max={videoDuration || 1} step={0.01} value={time} disabled={!video} onChange={e => seek(Number(e.target.value))}/><span className="player-time">{fmt(videoDuration)}</span><button className="icon-button" aria-label="从头播放" disabled={!video} onClick={() => { seek(0); void player.current?.play(); }}><RefreshCw size={14}/></button></div>
          <div className="preview-actions"><label className="auto-preview"><input type="checkbox" checked={autoPreview} onChange={e => setAutoPreview(e.target.checked)}/><span>自动预览</span></label><span className="render-quality">{project.scene.fps} fps</span><button className="preview-button" disabled={running || !project.actions.length} onClick={() => void render('preview')}>{running ? <Loader2 size={14} className="spin"/> : <RefreshCw size={14}/>} {running ? '生成中' : '更新预览'}</button></div>
          {running && <div className="render-progress"><i style={{ width: `${Math.min(98, Math.max(3, (job?.progress || 0) * ((job?.progress || 0) <= 1 ? 100 : 1)))}%` }}/></div>}
        </section>

        <section className="story-panel" aria-label="场景步骤">
          <div className="panel-heading"><div className="panel-title"><BookOpen size={16}/> 动画步骤</div><span className="muted-small">点击定位积木</span></div>
          {errors.length > 0 || renderError ? <div className="diagnostic-list" role="alert">{renderError && <div className="diagnostic"><strong>需要检查</strong><p>{renderError}</p></div>}{errors.map((error, i) => <button key={i} className="diagnostic" onClick={() => error.blockId && chooseStep(error.blockId)}><strong>积木连接或参数需要调整</strong><p>{error.message}</p>{error.blockId && <span>定位积木 <ArrowRight size={12}/></span>}</button>)}</div> : null}
          <div className="step-list">{project.actions.length ? outline.map(({ action, depth, number, context }) => { const def = definitions.get(action.type); return <button key={action.id} className={`step-item ${selected === action.id ? 'selected' : ''}`} style={{ paddingLeft: 8 + Math.min(depth, 6) * 12 }} onClick={() => chooseStep(action.id)}><span className="step-number" style={{ background: `${def?.colour || '#64748b'}18`, color: def?.colour || '#64748b' }}>{number}</span><span className="step-copy"><strong>{context && <em className="step-context">{context} · </em>}{def?.label || action.type}</strong><small>{String(action.fields.name || action.fields.target || action.fields.text || action.fields.expression || (action.children ? `${action.children.length} 个动作` : '')).slice(0, 52)}</small></span><span className="step-meta">{stepTiming(action)}<ChevronDown size={12}/></span></button>; }) : <div className="empty-steps"><Plus size={22}/><strong>先添加一个图形</strong><p>也可以从示例库里挑一个喜欢的作品，改一改。</p><div className="empty-step-actions"><button onClick={() => editor.current?.addBlock('circle')}>添加一个圆 <Plus size={13}/></button><button onClick={() => setModal('templates')}>浏览示例 <ArrowRight size={13}/></button></div></div>}</div>
          {selectedDefinition && selectedAction && <div className="block-tip"><span style={{ background: selectedDefinition.colour }}/><div className="block-tip-body"><div className="block-tip-title"><strong>{selectedDefinition.label}</strong>{selectedDefinition.fields.length > 4 && <button onClick={() => editor.current?.showDetails(selectedAction.id)}>全部参数 <Settings2 size={12}/></button>}</div><p>{selectedDefinition.tooltip}</p>{positionable && <details key={selectedAction.id} className="position-details"><summary>快速摆放 · x {String(selectedAction.fields.x)} · y {String(selectedAction.fields.y)}</summary><div className="quick-position"><div className="position-grid" role="group" aria-label="快速摆放">{['左上', '上方', '右上', '左侧', '居中', '右侧', '左下', '下方', '右下'].map((label, i) => <button key={label} aria-label={`放到${label}`} title={`放到${label}`} onClick={() => editor.current?.updateFields(selectedAction.id, { x: (i % 3 - 1) * Math.min(3, 2 * project.scene.width / project.scene.height), y: (1 - Math.floor(i / 3)) * 1.8 })}>{['↖', '↑', '↗', '←', '•', '→', '↙', '↓', '↘'][i]}</button>)}</div><div><strong>快速摆放</strong><p>x：{String(selectedAction.fields.x)}　y：{String(selectedAction.fields.y)}<br/>中心为 (0, 0)，向右、向上为正</p></div></div></details>}{morphTarget && morphTarget.fields.appear !== 'hidden' && <button className="block-tip-action" onClick={() => editor.current?.updateFields(morphTarget.id, { appear: 'hidden' })}>将「{String(morphTarget.fields.name)}」仅作为变形目标</button>}{project.actions.length === 1 && selectedDefinition.createsObject && selectedDefinition.objectKind !== 'tracker' && <button className="block-tip-action" onClick={() => editor.current?.addBlock('shift', { target: String(selectedAction.fields.name), dx: 2, dy: 0, duration: 1 })}>让它向右移动 <ArrowRight size={12}/></button>}</div></div>}
        </section>
        <div className="engine-status"><span className={health?.available ? 'engine-indicator ready' : 'engine-indicator'}/><span>{health?.available ? `Manim ${health.version || ''} 已连接` : healthError ? '渲染服务未连接' : health?.checking ? '正在检测 Manim 环境…' : health ? 'Manim 环境需要配置' : '连接渲染引擎…'}</span><button onClick={() => void checkHealth()} title={healthError || String(health?.error || health?.message || '')}>重新检查</button></div>
      </aside>
    </main>
    {saveError && <div className="save-warning">{saveError}<button onClick={exportProject}>导出项目</button></div>}
    {notice && <div className="studio-toast" role="status"><Check size={16}/>{notice}</div>}
    <input ref={input} type="file" accept=".json,.anyvis" hidden onChange={e => void importFile(e.target.files?.[0])}/>

    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className={`studio-modal modal-${modal}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="modal-eyebrow">ANYVIS STUDIO</span><h2 id="modal-title">{({ templates: '从一个好想法开始', projects: '我的作品', settings: '画面设置', help: '让你的第一段动画动起来', ai: '和 AI 一起创作', export: '把作品带出去' })[modal]}</h2></div><button className="icon-button" aria-label="关闭对话框" onClick={() => setModal(null)}><X size={20}/></button></div>
      {modal === 'templates' && <><p className="modal-description">每个示例都由可编辑的积木组成。改一个参数，就能看到新的结果。</p><div className="gallery-toolbar"><div className="gallery-search"><Search size={16}/><input aria-label="搜索示例" placeholder="搜索几何、函数、三维…" value={gallerySearch} onChange={e => setGallerySearch(e.target.value)}/></div><button className="small-button" onClick={() => replaceProject(createEmptyProject())}><FilePlus2 size={15}/> 空白作品</button></div><div className="template-grid">{templateCatalog.filter(t => `${t.title} ${t.description} ${t.category}`.includes(gallerySearch)).map(t => <button className="template-card" key={t.id} onClick={() => { const next = getTemplate(t.id); if (next) replaceProject(next); }}><div className="template-image"><img src={t.thumbnail} alt=""/><span>{t.category}</span></div><div className="template-info"><h3>{t.title}<ArrowRight size={16}/></h3><p>{t.description}</p><small>打开并编辑积木 <span>→</span></small></div></button>)}</div><p className="modal-footnote">封面是内容示意图，舞台预览使用真实 Manim 渲染。当前作品已自动保留在“我的作品”。</p></>}
      {modal === 'projects' && <><p className="modal-description">作品自动保存在当前浏览器。导出项目文件，可以备份或换一台电脑继续创作。</p><div className="project-library-actions"><button className="small-button" onClick={() => input.current?.click()}><Upload size={15}/> 打开项目文件</button><button className="small-button primary" onClick={() => replaceProject(createEmptyProject())}><Plus size={15}/> 新建作品</button></div><div className="saved-project-list">{readProjects().map(({ project: item, savedAt }) => <button key={item.id} onClick={() => replaceProject(item)}><span className="project-file-icon"><Clapperboard size={21}/></span><span><strong>{item.name}</strong><small>{allActions(item.actions).length} 个积木 · {new Date(savedAt).toLocaleString('zh-CN')}</small></span><ArrowRight size={16}/></button>)}</div></>}
      {modal === 'settings' && <div className="settings-grid"><label>场景类型<select value={project.scene.dimension} onChange={e => setProject(p => ({ ...p, scene: { ...p.scene, dimension: e.target.value as '2d' | '3d' } }))}><option value="2d">二维 · 几何、函数与公式</option><option value="3d">三维 · 空间与相机</option></select></label><label>画面比例<select value={`${project.scene.width}x${project.scene.height}`} onChange={e => { const [width, height] = e.target.value.split('x').map(Number); setProject(p => ({ ...p, scene: { ...p.scene, width, height } })); }}>{!['1920x1080','1080x1080','1080x1920','1280x720'].includes(`${project.scene.width}x${project.scene.height}`) && <option value={`${project.scene.width}x${project.scene.height}`}>自定义 · {project.scene.width} × {project.scene.height}</option>}<option value="1920x1080">16:9 · 1920 × 1080</option><option value="1080x1080">1:1 · 1080 × 1080</option><option value="1080x1920">9:16 · 1080 × 1920</option><option value="1280x720">16:9 · 1280 × 720</option></select></label><label>动画帧率<select value={project.scene.fps} onChange={e => setProject(p => ({ ...p, scene: { ...p.scene, fps: Number(e.target.value) } }))}>{![24, 30, 60].includes(project.scene.fps) && <option value={project.scene.fps}>{project.scene.fps} fps · 自定义</option>}<option value={24}>24 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label><div className="settings-color-field"><label htmlFor="scene-background">背景颜色</label><div className="color-input"><input id="scene-background" aria-label="背景颜色" type="color" value={project.scene.background} onChange={e => setProject(p => ({ ...p, scene: { ...p.scene, background: e.target.value } }))}/><code>{project.scene.background}</code></div><div className="background-swatches" role="group" aria-label="常用背景颜色">{COMMON_COLOURS.slice(0, 6).map(colour => <button key={colour.value} aria-label={`背景：${colour.name}`} title={colour.name} style={{ backgroundColor: colour.value }} onClick={() => setProject(p => ({ ...p, scene: { ...p.scene, background: colour.value } }))}/>)}</div></div><p className="settings-note">预览会降低分辨率以更快得到结果；预览与成片使用相同的 Manim 动画和求值帧率。</p><button className="primary-button settings-done" onClick={() => setModal(null)}>完成</button></div>}
      {modal === 'help' && <><p className="modal-description">不用写 Python，也可以制作真正的数学动画。</p><div className="guide-steps"><div><span>01</span><h3>添加图形</h3><p>从左侧积木库选择圆、文字或坐标系，接到起始块下方。点击字段即可改数值、名字和颜色。</p></div><div><span>02</span><h3>安排变化</h3><p>接上移动、旋转、变形等动作，选择要改变的对象。用“同时”和“重复”把多个动作组合起来。</p></div><div><span>03</span><h3>观看与导出</h3><p>自动预览会在修改后重新渲染。播放确认效果，再导出视频；保存项目后仍可继续修改。</p></div></div><div className="guide-shortcuts"><span><kbd>⌘ / Ctrl</kbd> + <kbd>S</kbd> 保存项目</span><span><kbd>⌘ / Ctrl</kbd> + <kbd>Enter</kbd> 更新预览</span></div><button className="primary-button" onClick={() => setModal('templates')}>选一个示例开始 <ArrowRight size={15}/></button></>}
      {modal === 'export' && <><p className="modal-description">视频用于分享，项目保留可编辑的积木，Python 源码可以直接交给 Manim。</p><div className="export-options"><button onClick={exportProject}><Save size={22}/><span><strong>保存积木项目</strong><small>.anyvis.json · 可继续编辑与备份</small></span><Download size={16}/></button><button disabled={!!errors.length} onClick={() => { try { downloadText(`${fileName(project.name)}.py`, exportStandalonePython(editor.current?.snapshot() || project), 'text/x-python'); } catch (error) { notify((error as Error).message); } }}><Code2 size={22}/><span><strong>导出 Manim 源码</strong><small>.py · 真实 Python，不依赖 AnyVis 播放器</small></span><Download size={16}/></button></div><div className="video-export"><h3><Clapperboard size={19}/> 导出视频</h3><label>画质<select value={quality} onChange={e => setQuality(e.target.value as 'preview' | 'final')}><option value="preview">快速预览 · 较小分辨率</option><option value="final">成片 · {project.scene.width} × {project.scene.height} / {project.scene.fps} fps</option></select></label>{video && currentVideo && video.quality === quality ? <a className="primary-button" href={video.url} download={`${fileName(project.name)}.${video.format}`} ><Download size={16}/> 下载视频</a> : <button className="primary-button" disabled={running || !!errors.length} onClick={() => { void render(quality); }}>{running ? <Loader2 className="spin" size={16}/> : <Clapperboard size={16}/>} {running ? '正在生成视频…' : '生成视频'}</button>}{running && <p className="muted-small">{job?.message || '正在渲染'} · 完成后可在这里下载。</p>}{renderError && <p className="inline-error">{renderError}</p>}</div></>}
      {modal === 'ai' && <><p className="modal-description">描述你想表达的内容，得到可以继续搭建、修改的积木作品。</p><div className="ai-tabs"><button className={aiTab === 'generate' ? 'active' : ''} onClick={() => setAiTab('generate')}>连接模型生成</button><button className={aiTab === 'import' ? 'active' : ''} onClick={() => setAiTab('import')}>使用已有 AI</button></div><label className="ai-request">想制作或修改什么？<textarea placeholder="例如：画出正弦曲线，用一个运动点展示角度增加时高度的变化，最后写出公式。" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={3}/></label>{aiTab === 'generate' ? <><div className="ai-connection"><label>API 地址<input value={aiEndpoint} onChange={e => setAiEndpoint(e.target.value)} placeholder="https://…/v1"/></label><label>模型名称<input value={aiModel} onChange={e => setAiModel(e.target.value)} placeholder="填写服务商提供的模型 ID"/></label><label className="ai-key">API 密钥<input type="password" autoComplete="off" value={aiKey} onChange={e => setAiKey(e.target.value)} placeholder="仅在当前会话内使用；本地服务可留空"/></label></div><p className="modal-footnote">使用你自己的兼容 API 服务，调用可能产生费用。密钥不会写入作品或浏览器存储。只有点击生成时才发送当前作品。</p><div className="ai-action-row"><button className="primary-button" disabled={aiLoading} onClick={() => void generateAI()}>{aiLoading ? <Loader2 size={16} className="spin"/> : <WandSparkles size={16}/>} {aiLoading ? '正在生成积木…' : '生成可编辑作品'}</button>{aiLoading && <button className="small-button" onClick={() => { aiAbort.current?.abort(); setAiLoading(false); }}>取消</button>}</div></> : <><p className="ai-import-description">把带有项目格式与积木说明的提示词交给你使用的 AI，再将它返回的 JSON 粘贴到这里。</p><div className="ai-action-row"><button className="small-button" onClick={() => void copyPrompt()}><Copy size={14}/> 复制提示词</button><button className="small-button" onClick={() => void downloadPrompt()}><Download size={14}/> 导出提示词</button></div><textarea className="ai-json" value={aiJson} onChange={e => setAiJson(e.target.value)} placeholder="粘贴 AI 返回的项目 JSON…" rows={5}/><button className="primary-button" disabled={!aiJson.trim()} onClick={() => void importAI()}>检查并载入 <ArrowRight size={15}/></button></>}{aiError && <div className="inline-error" role="alert">{aiError}</div>}{aiCandidate && <div className="ai-result"><Check size={20}/><div><strong>{aiCandidate.name}</strong><p>{aiSummary}</p><small>{allActions(aiCandidate.actions).length} 个可编辑积木 · {aiCandidate.scene.dimension.toUpperCase()}</small></div><button className="primary-button" onClick={() => { const next = { ...aiCandidate, id: crypto.randomUUID(), workspace: undefined }; if (replaceProject(next)) { setAiCandidate(null); notify('AI 作品已打开，原作品仍保留在“我的作品”。'); } }}>打开作品</button></div>}</>}
    </section></div>}
  </div>;
}
