import { downloadProjectBundle, importProjectBundle } from './media-bundle';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Camera, Check, ChevronLeft, ChevronRight, CircleHelp, Clapperboard, Code2, Copy, Download, FilePlus2, FolderOpen, Grid, Activity, TrendingUp, BarChart3, Sliders, Radio, Palette, Compass, Globe, Film, Box, Video, Captions, LayoutGrid, Loader2, Maximize2, Pause, Play, Plus, Presentation, Redo2, RefreshCw, RotateCcw, Save, Search, Settings2, Sparkles, Undo2, Upload, WandSparkles, X } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import type { Action, Project } from './core/types';
import { compileProject } from './core/compiler';
import { engineCompatibilityError } from './core/protocol';
import { exportStandalonePython } from './core/export';
import { createEmptyProject, validateProject } from './core/project';
import { StudioBlocks, type StudioBlocksHandle } from './blocks/StudioBlocks';
import { templateCatalog, getTemplate } from './templates';
import { api, startRender, type EngineHealth, type RenderJob } from './api';
import { downloadText, fileName, readCurrent, readProjects, saveLatestProject, saveProject, withDefaultMusic } from './storage';
import { builtinPreview, type VideoPreview } from './previews';
import { Timeline } from './Timeline';
import { ObjectManager } from './ObjectManager';
import { MusicSettings } from './MusicSettings';
import { appendAction, flattenActions, managedObject } from './authoring';
import { projectHistory } from './project-history';
import { COMMON_COLOURS } from './blocks/colour-field';
import { computePresentationSteps } from './presentation';
import { CommandPalette } from './CommandPalette';
import { MatrixPlaygroundModal } from './MatrixPlaygroundModal';
import { FourierPlaygroundModal } from './FourierPlaygroundModal';
import { createFourierActions } from './fourier';
import { CalculusPlaygroundModal } from './CalculusPlaygroundModal';
import { createCalculusActions } from './calculus';
import { RiemannPlaygroundModal } from './RiemannPlaygroundModal';
import { createRiemannActions } from './riemann';
import { KeyframeCurveModal } from './KeyframeCurveModal';
import { applyRateFuncToAction } from './easing-curve';
import { AudioVisualizerModal } from './AudioVisualizerModal';
import { createAudioVisualizerActions } from './audio-visualizer';
import { TexColorStylerModal } from './TexColorStylerModal';
import { createColoredMathTexActions } from './tex-color';
import { VectorFieldPlaygroundModal } from './VectorFieldPlaygroundModal';
import { ComplexMappingModal } from './ComplexMappingModal';
import { StoryboardModal } from './StoryboardModal';
import { SurfacePlaygroundModal } from './SurfacePlaygroundModal';
import { CameraDirectorModal } from './CameraDirectorModal';
import { SubtitleSyncModal } from './SubtitleSyncModal';
import './studio.css';
import './studio-polish.css';

type Modal = 'templates' | 'projects' | 'settings' | 'help' | 'ai' | 'export' | null;
const fmt = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
function allActions(actions: Action[]): Action[] { return actions.flatMap(a => [a, ...allActions(a.children || []), ...(a.branches || []).flatMap(allActions)]); }
function revisionOf(project: Project) {
  const value = JSON.stringify([project.scene, project.actions, project.assets]);
  let hash = 2166136261; for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `${project.id}:${(hash >>> 0).toString(16)}`;
}
function initialProject(): Project { return readCurrent() || withDefaultMusic(getTemplate('first-animation') || createEmptyProject()); }

const MATH_THEMES = [
  { name: '3B1B 经典黑', bg: '#0B1020' },
  { name: '教室黑板', bg: '#1E293B' },
  { name: '极简纸白', bg: '#F8FAFC' },
  { name: '深邃纯黑', bg: '#000000' },
  { name: '星云深紫', bg: '#0F0C20' },
];

export default function StudioApp() {
  const [history, dispatchProject] = useReducer(projectHistory, undefined, () => ({ past: [], present: initialProject(), future: [] }));
  const project = history.present;
  const setProject = useCallback((value: Project | ((p: Project) => Project)) => dispatchProject({ type: 'edit', value }), []);
  const undoProject = useCallback(() => dispatchProject({ type: 'undo' }), []);
  const redoProject = useCallback(() => dispatchProject({ type: 'redo' }), []);
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [healthError, setHealthError] = useState('');
  const [job, setJob] = useState<RenderJob | null>(null);
  const [video, setVideo] = useState<VideoPreview | null>(() => builtinPreview(project, revisionOf(project)));
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [editorTab, setEditorTab] = useState<'blocks' | 'timeline' | 'code'>('blocks');
  const [autoPreview, setAutoPreview] = useState(true);
  const [trusted, setTrusted] = useState(false);
  const [time, setTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [presentationStepIdx, setPresentationStepIdx] = useState(0);
  const [presentationPlaying, setPresentationPlaying] = useState(false);
  const presentationVideoRef = useRef<HTMLVideoElement>(null);
  const presentationSteps = useMemo(() => computePresentationSteps(project), [project]);
  const [matrixPlaygroundOpen, setMatrixPlaygroundOpen] = useState(false);
  const [fourierPlaygroundOpen, setFourierPlaygroundOpen] = useState(false);
  const [calculusPlaygroundOpen, setCalculusPlaygroundOpen] = useState(false);
  const [riemannPlaygroundOpen, setRiemannPlaygroundOpen] = useState(false);
  const [keyframeCurveOpen, setKeyframeCurveOpen] = useState(false);
  const [audioVisualizerOpen, setAudioVisualizerOpen] = useState(false);
  const [texColorStylerOpen, setTexColorStylerOpen] = useState(false);
  const [vectorFieldOpen, setVectorFieldOpen] = useState(false);
  const [complexMappingOpen, setComplexMappingOpen] = useState(false);
  const [storyboardOpen, setStoryboardOpen] = useState(false);
  const [surfacePlaygroundOpen, setSurfacePlaygroundOpen] = useState(false);
  const [cameraDirectorOpen, setCameraDirectorOpen] = useState(false);
  const [subtitleSyncOpen, setSubtitleSyncOpen] = useState(false);
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
  const selectedAction = flattened.find(item => item.id === selected);
  const selectedObjectId = selectedAction && managedObject(selectedAction) ? selectedAction.id : flattened.find(a => managedObject(a) && a.fields.name === (selectedAction?.fields.target || selectedAction?.fields.receiver))?.id || null;
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
      if (next.blockId) { setSelected(next.blockId); setSelectedIds([next.blockId]); editor.current?.highlight(next.blockId); }
    }
  }, []);

  const render = useCallback(async (renderQuality: 'preview' | 'final' = 'preview') => {
    if (pendingFinal.current && ['queued', 'running'].includes(jobRef.current?.status || '')) return;
    try {
      const latest = editor.current?.snapshot() || project;
      if (revisionOf(latest) !== currentRevision) { pendingManualRender.current = renderQuality; setProject(latest); return; }
    } catch (error) { setRenderError((error as Error).message); return; }
    if (errors.length) { setRenderError('先修正下方标出的积木，再生成预览。'); return; }
    if (compiled.requiresTrust && !trusted) { setRenderError('作品包含 Python 扩展或需要本机权限的 API 调用。请在“代码”页检查内容，并允许本次作品运行代码后再预览。'); setEditorTab('code'); return; }
    if (!health?.available) { setRenderError('渲染引擎尚未就绪。请使用 AnyVis 启动器，或在下方重新检查环境。'); return; }
    const compatibilityError = engineCompatibilityError(health);
    if (compatibilityError) { setRenderError(compatibilityError); return; }
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
  }, [project, currentRevision, health?.available, health?.authoringProtocol, errors.length, compiled.requiresTrust, trusted, acceptJob]);
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
    setProject(next); setSelected(null); setSelectedIds([]); setTrusted(false); setVideo(builtinPreview(next, revisionOf(next))); setJob(null); setRenderError('');
    setTime(0); setVideoDuration(0); setPlaying(false); setModal(null); setEditorTab('blocks');
    return true;
  }, [notify]);
  const exportProject = useCallback(async () => {
    try {
      const latest = editor.current?.snapshot() || projectRef.current;
      if (latest.assets?.length) await downloadProjectBundle(latest);
      else downloadText(`${fileName(latest.name)}.anyvis.json`, JSON.stringify(latest, null, 2));
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCmdPaletteOpen(v => !v); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); exportProject(); }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void renderRef.current('preview'); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !(event.target instanceof HTMLElement && event.target.closest('input,textarea,[contenteditable="true"]'))) { event.preventDefault(); event.stopPropagation(); if (event.shiftKey) redoProject(); else undoProject(); }
      if (event.key === 'Escape') { setModal(null); setCmdPaletteOpen(false); }
    };
    window.addEventListener('keydown', listener, true); return () => window.removeEventListener('keydown', listener, true);
  }, [exportProject, undoProject, redoProject]);
  const captureVideoFrame = useCallback(() => {
    const vid = player.current;
    if (!vid || !vid.videoWidth || !vid.videoHeight) {
      notify('请先生成并加载视频预览，再截取画面帧。');
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = vid.videoWidth;
      canvas.height = vid.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建画布上下文');
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${fileName(projectRef.current.name)}-${vid.currentTime.toFixed(2)}s.png`;
      link.click();
      notify(`已保存当前画面帧截图 (${canvas.width}×${canvas.height} PNG)`);
    } catch (error) {
      notify(`截图失败：${(error as Error).message}`);
    }
  }, [notify]);
  const exportSource = async () => {
    try {
      const latest = editor.current?.snapshot() || projectRef.current;
      if (latest.assets?.length) await downloadProjectBundle(latest);
      else downloadText(`${fileName(latest.name)}.py`, exportStandalonePython(latest), 'text/x-python');
    } catch (error) { notify((error as Error).message); }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const imported = await importProjectBundle(file);
        if (replaceProject(imported)) notify('已打开项目和全部素材。');
        return;
      }
      if (file.size > 8 * 1024 * 1024) throw new Error('项目文件过大，请选择 8 MB 以内的 .anyvis.json。');
      const value = JSON.parse(await file.text());
      if (value.schemaVersion !== 2) throw new Error('这是旧版课件或其他格式。旧课件可用 ?legacy=1 打开；新版请导入 v2 积木项目。原文件没有被修改。');
      if (replaceProject(validateProject(value))) notify('已打开项目。');
    } catch (error) { notify(`打开失败：${(error as Error).message}`); }
    finally { if (input.current) input.current.value = ''; }
  };
  const chooseStep = (id: string) => { setSelected(id); setSelectedIds(id ? [id] : []); setEditorTab('blocks'); setTimeout(() => editor.current?.highlight(id), 40); };
  const switchView = (tab: 'blocks' | 'timeline' | 'code') => {
    try { const latest = editor.current?.snapshot(); if (latest) setProject(latest); } catch (error) { notify((error as Error).message); }
    setEditorTab(tab);
  };
  const addObject = (type: string) => {
    try { const result = appendAction(editor.current?.snapshot() || projectRef.current, type); setProject(result.project); setSelected(result.action.id); setSelectedIds([result.action.id]); }
    catch (error) { notify((error as Error).message); }
  };
  const play = () => { if (!player.current || !video) return; if (player.current.paused) void player.current.play().catch(() => notify('请点击播放重试。')); else player.current.pause(); };
  const seek = (value: number) => { if (player.current) { player.current.currentTime = value; setTime(value); } };

  const advancePresentation = useCallback(() => {
    const vid = presentationVideoRef.current;
    if (!vid) return;
    if (presentationStepIdx < presentationSteps.length - 1) {
      const nextIdx = presentationStepIdx + 1;
      const nextStep = presentationSteps[nextIdx];
      setPresentationStepIdx(nextIdx);
      vid.currentTime = nextStep.startTime;
      void vid.play().catch(() => {});
      setPresentationPlaying(true);
    } else {
      setPresentationStepIdx(0);
      vid.currentTime = 0;
      void vid.play().catch(() => {});
      setPresentationPlaying(true);
    }
  }, [presentationStepIdx, presentationSteps]);

  const jumpPresentationStep = useCallback((idx: number) => {
    const vid = presentationVideoRef.current;
    if (!vid || !presentationSteps[idx]) return;
    setPresentationStepIdx(idx);
    vid.currentTime = presentationSteps[idx].startTime;
    vid.pause();
    setPresentationPlaying(false);
  }, [presentationSteps]);

  const exitPresentation = useCallback(() => {
    const vid = presentationVideoRef.current;
    if (vid) {
      vid.pause();
      setTime(vid.currentTime);
    }
    setPresenting(false);
    setPresentationPlaying(false);
  }, []);

  const onPresentationTimeUpdate = useCallback(() => {
    const vid = presentationVideoRef.current;
    if (!vid) return;
    const curTime = vid.currentTime;
    const curStep = presentationSteps[presentationStepIdx];
    if (!curStep) return;

    if (curTime >= curStep.pauseTime - 0.05 && curTime < curStep.pauseTime + 0.4) {
      if (!vid.paused) {
        vid.pause();
        vid.currentTime = curStep.pauseTime;
        setPresentationPlaying(false);
      }
    }
  }, [presentationStepIdx, presentationSteps]);

  useEffect(() => {
    if (!presenting) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        exitPresentation();
      } else if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        advancePresentation();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (presentationStepIdx > 0) jumpPresentationStep(presentationStepIdx - 1);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [presenting, advancePresentation, jumpPresentationStep, exitPresentation, presentationStepIdx]);

  const importAI = async () => {
    setAiError('');
    try {
      const { parseAIProject } = await import('./ai/project-assistant');
      const next = parseAIProject(aiJson, project);
      setAiCandidate(next); setAiSummary(compileProject(next).requiresTrust ? '结构已验证。包含需要本机权限的 API；打开后请先检查 Python 源码，再决定是否运行。' : '已验证项目结构，可以继续在积木中修改。');
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
      setAiCandidate(validateProject(result.project)); setAiSummary(compileProject(result.project).requiresTrust ? '结构已验证。包含需要本机权限的 API；打开后请先检查 Python 源码，再决定是否运行。' : result.summary || '已生成一份可编辑的积木作品。');
    } catch (error) { if (controller === aiAbort.current && (error as Error).name !== 'AbortError') setAiError((error as Error).message); }
    finally { if (controller === aiAbort.current) setAiLoading(false); }
  };

  return <div className="studio-app">
    <header className="studio-header">
      <button type="button" className="studio-brand" onClick={() => setModal('templates')} aria-label="浏览作品示例"><span className="studio-logo"><span/><span/><span/></span><span>AnyVis<small>STUDIO</small></span></button>
      <span className="header-divider"/>
      <div className="project-title"><input aria-label="作品名称" value={project.name} maxLength={80} onBlur={() => { if (!project.name.trim()) setProject(p => ({ ...p, name: '未命名动画' })); }} onChange={e => setProject(p => ({ ...p, name: e.target.value }))}/><span className={saveError ? 'save-status error' : 'save-status'}>{saveError ? '需要备份' : saved ? <><Check size={12}/> 已自动保存</> : '保存中…'}</span></div>
      <div className="header-spacer"/>
      <button className="header-button" title="全局命令面板 · ⌘/Ctrl K" aria-label="全局命令面板" onClick={() => setCmdPaletteOpen(true)}><Search size={15}/><span>命令 ⌘K</span></button>
      <button className="header-button" title="3B1B 矩阵线性变换交互台" aria-label="3B1B 矩阵线性变换交互台" onClick={() => setMatrixPlaygroundOpen(true)}><Grid size={15}/><span>矩阵台</span></button>
      <button className="header-button" title="3B1B 傅里叶环绕圆交互台" aria-label="3B1B 傅里叶环绕圆交互台" onClick={() => setFourierPlaygroundOpen(true)}><Activity size={15}/><span>傅里叶台</span></button>
      <button className="header-button" title="3B1B 微积分导数与切线交互台" aria-label="3B1B 微积分导数与切线交互台" onClick={() => setCalculusPlaygroundOpen(true)}><TrendingUp size={15}/><span>微积分台</span></button>
      <button className="header-button" title="3B1B 黎曼和与定积分交互台" aria-label="3B1B 黎曼和与定积分交互台" onClick={() => setRiemannPlaygroundOpen(true)}><BarChart3 size={15}/><span>黎曼积分台</span></button>
      <button className="header-button" title="缓动曲线与关键帧检查器" aria-label="缓动曲线与关键帧检查器" onClick={() => setKeyframeCurveOpen(true)}><Sliders size={15}/><span>缓动曲线</span></button>
      <button className="header-button" title="音频响应式频谱与波形助手" aria-label="音频响应式频谱与波形助手" onClick={() => setAudioVisualizerOpen(true)}><Radio size={15}/><span>音频频谱</span></button>
      <button className="header-button" title="3B1B 公式专属配色器" aria-label="3B1B 公式专属配色器" onClick={() => setTexColorStylerOpen(true)}><Palette size={15}/><span>公式配色</span></button>
      <button className="header-button" title="2D 向量场与流线工作台" aria-label="2D 向量场与流线工作台" onClick={() => setVectorFieldOpen(true)}><Compass size={15}/><span>向量场</span></button>
      <button className="header-button" title="3B1B 复变函数与共形映射工作台" aria-label="3B1B 复变函数与共形映射工作台" onClick={() => setComplexMappingOpen(true)}><Globe size={15}/><span>复变共形</span></button>
      <button className="header-button" title="分镜剧本与多章节大纲" aria-label="分镜剧本与多章节大纲" onClick={() => setStoryboardOpen(true)}><Film size={15}/><span>分镜剧本</span></button>
      <button className="header-button" title="3B1B 3D 参数曲面与视角工作台" aria-label="3B1B 3D 参数曲面与视角工作台" onClick={() => setSurfacePlaygroundOpen(true)}><Box size={15}/><span>3D 曲面</span></button>
      <button className="header-button" title="运镜导演与动态取景器" aria-label="运镜导演与动态取景器" onClick={() => setCameraDirectorOpen(true)}><Video size={15}/><span>运镜导演</span></button>
      <button className="header-button" title="字幕配音同步工作台" aria-label="字幕配音同步工作台" onClick={() => setSubtitleSyncOpen(true)}><Captions size={15}/><span>字幕配音</span></button>
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
          <div className="editor-tabs" role="tablist" aria-label="编辑方式"><button role="tab" aria-selected={editorTab === 'blocks'} className={editorTab === 'blocks' ? 'active' : ''} onClick={() => switchView('blocks')}><Clapperboard size={16}/> 积木</button><button role="tab" aria-selected={editorTab === 'timeline'} className={editorTab === 'timeline' ? 'active' : ''} onClick={() => switchView('timeline')}><LayoutGrid size={16}/> 时间轴</button><button role="tab" aria-selected={editorTab === 'code'} className={editorTab === 'code' ? 'active' : ''} onClick={() => switchView('code')}><Code2 size={16}/> 代码</button></div>
          <div className="workspace-tools"><button className="icon-button" disabled={!history.past.length} onClick={undoProject} title="撤销" aria-label="撤销"><Undo2 size={16}/></button><button className="icon-button" disabled={!history.future.length} onClick={redoProject} title="重做" aria-label="重做"><Redo2 size={16}/></button><span/><button className="icon-button" onClick={() => setModal('settings')} title="画面设置" aria-label="画面设置"><Settings2 size={16}/></button></div>
        </div>
        <div className="workspace-intro"><span className="tiny-dot"/><span>在右侧管理对象，在这里编排动作。</span><button onClick={() => setModal('templates')}>从示例开始 <ArrowRight size={12}/></button></div>
        <div className="workspace-content" style={{ display: editorTab === 'blocks' ? 'flex' : 'none' }}>
          <StudioBlocks animationOnly onUndo={undoProject} onRedo={redoProject} ref={editor} project={project} onChange={setProject} onSelect={id => { setSelected(id); setSelectedIds(id ? [id] : []); }} selectedBlockId={selected || undefined} highlightedBlockId={job?.blockId} onWorkspaceError={message => setRenderError(message || '')}/>
        </div>
        {editorTab === 'timeline' && <Timeline onMusicSettings={() => setModal('settings')} project={project} selectedId={selected} selectedIds={selectedIds} onSelectIds={setSelectedIds} time={time} playing={playing} canPlay={!!video} onPlay={play} onChange={setProject} onSelect={id => { setSelected(id); setSelectedIds(id ? [id] : []); }} onShowBlocks={chooseStep} onSeek={seek} onError={notify}/>}
        {editorTab === 'code' && <div className="python-view"><div className="code-intro"><div><strong>生成的 Manim 源码 · 只读</strong><p>在对象管理器、积木或时间轴中修改，代码会同步更新。</p></div><button className="small-button" disabled={!!errors.length} onClick={() => void exportSource()}><Download size={14}/> {project.assets?.length ? '导出源码与素材' : '导出 .py'}</button></div><CodeMirror className="generated-code" value={compiled.code} editable={false} readOnly height="100%" basicSetup={{ lineNumbers: true, foldGutter: true }} theme="light"/>{compiled.requiresTrust && <label className="trust-code"><input type="checkbox" checked={trusted} onChange={e => setTrusted(e.target.checked)}/> 我已检查此作品的 Python 扩展及 API 调用，允许它在本机运行。</label>}</div>}
        <div className="workspace-footer"><span>{flattened.length} 个积木<span className="footer-separator">·</span>{project.scene.dimension === '3d' ? '三维场景' : '二维场景'}</span><span>{compiled.duration === null ? '动态时长' : `约 ${compiled.duration.toFixed(1)} 秒`}<span className="footer-separator">·</span>Manim 原生动画</span></div>
      </section>

      <aside className="stage-column">
        <section className="preview-panel" aria-label="动画预览">
          <div className="panel-heading"><div className="panel-title"><span className="live-dot"/>舞台预览</div><div className="preview-heading-tools"><span className="dimension-badge">{project.scene.dimension.toUpperCase()}</span><button className="icon-button" aria-label="截取当前画面帧" title="截取当前画面帧 PNG 快照" disabled={!video} onClick={captureVideoFrame}><Camera size={15}/></button><button className="icon-button" aria-label="演播模式" title="演播模式 · 幻灯片放映与交互讲解 (按空格或右方向键逐步推进)" disabled={!video} onClick={() => { setPresenting(true); setPresentationStepIdx(0); seek(0); }}><Presentation size={15}/></button><button className="icon-button" aria-label="全屏预览" onClick={() => void stage.current?.requestFullscreen()}><Maximize2 size={15}/></button></div></div>
          <div className="stage-shell" ref={stage} style={{ background: project.scene.background }}>
            {video ? <video key={video.url} ref={player} src={video.url} poster={video.poster} playsInline preload="auto" onLoadedMetadata={() => { setVideoDuration(player.current?.duration || 0); setTime(0); }} onTimeUpdate={() => setTime(player.current?.currentTime || 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onClick={play} onError={() => setRenderError('视频加载失败，请重新生成预览。')}/> : <div className="stage-placeholder"><span className="stage-placeholder-icon"><Clapperboard size={28}/></span><strong>{running ? '让想法动起来' : '你的动画，从这里开始'}</strong><p>{running ? 'Manim 正在生成真实画面' : project.actions.length ? '点击生成预览，观看积木的效果' : '添加一个图形，再为它安排动画'}</p>{!running && <button onClick={() => void render('preview')}><Play size={14}/> 生成预览</button>}</div>}
            {running && job?.posterUrl && <img className="live-render-frame" src={job.posterUrl} alt="Manim 正在生成的实际画面"/>}
            {running && <div className="render-overlay"><Loader2 className="spin" size={14}/><span>{job?.message || '正在渲染…'}</span><button onClick={() => void cancel()} aria-label="停止渲染"><X size={14}/></button></div>}
            {video && !currentVideo && !running && <button className="stale-preview" onClick={() => void render('preview')}>积木已修改 · 点击更新画面</button>}
            {video && currentVideo && <div className="stage-watermark">{video.builtin ? '示例预览 · Manim 预渲染' : video.quality === 'final' ? '高清成片' : '真实 Manim 预览'}</div>}
          </div>
          <div className="player-controls"><button className="play-control" onClick={play} disabled={!video} title={playing ? '暂停播放' : currentVideo ? '播放已生成的动画' : '播放上一次生成的动画；修改后请更新预览'} aria-label={playing ? '暂停播放' : '播放动画'}>{playing ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}</button><span className="player-time">{fmt(time)}</span><input aria-label="播放进度" type="range" min={0} max={videoDuration || 1} step={0.01} value={time} disabled={!video} onChange={e => seek(Number(e.target.value))}/><span className="player-time">{fmt(videoDuration)}</span><button className="icon-button" aria-label="从头播放" disabled={!video} onClick={() => { seek(0); void player.current?.play(); }}><RefreshCw size={14}/></button></div>
          <div className="preview-actions"><label className="auto-preview"><input type="checkbox" checked={autoPreview} onChange={e => setAutoPreview(e.target.checked)}/><span>自动预览</span></label><span className="render-quality">{project.scene.fps} fps</span><button className={`preview-button ${!currentVideo ? 'needs-update' : ''}`} disabled={running || !project.actions.length} onClick={() => void render('preview')}>{running ? <Loader2 size={14} className="spin"/> : <RefreshCw size={14}/>} {running ? '生成中' : '更新预览'}</button></div>
          {running && <div className="render-progress"><i style={{ width: `${Math.min(98, Math.max(3, (job?.progress || 0) * ((job?.progress || 0) <= 1 ? 100 : 1)))}%` }}/></div>}
        </section>

        <section className="object-manager-panel" aria-label="对象管理器" onPointerDownCapture={() => {
          const latest = editor.current?.snapshot();
          if (latest && JSON.stringify(latest.actions) !== JSON.stringify(projectRef.current.actions)) setProject(latest);
        }}>
          {errors.length > 0 || renderError ? <div className="diagnostic-list" role="alert">{renderError && <div className="diagnostic"><strong>需要检查</strong><p>{renderError}</p></div>}{errors.map((error, i) => <button key={i} className="diagnostic" onClick={() => error.blockId && chooseStep(error.blockId)}><strong>动作或参数需要调整</strong><p>{error.message}</p>{error.blockId && <span>定位动作 <ArrowRight size={12}/></span>}</button>)}</div> : null}
          <ObjectManager onMusicSettings={() => setModal('settings')} project={project} selectedId={selectedObjectId} onSelect={id => { setSelected(id); setSelectedIds(id ? [id] : []); }} onChange={setProject} onAdd={addObject} onError={notify}/>
        </section>
        <div className="engine-status"><span className={health?.available ? 'engine-indicator ready' : 'engine-indicator'}/><span>{health?.available ? `Manim ${health.version || ''} 已连接` : healthError ? '渲染服务未连接' : health?.checking ? '正在检测 Manim 环境…' : health ? 'Manim 环境需要配置' : '连接渲染引擎…'}</span><button onClick={() => void checkHealth()} title={healthError || String(health?.error || health?.message || '')}>重新检查</button></div>
      </aside>
    </main>
    {saveError && <div className="save-warning">{saveError}<button onClick={exportProject}>导出项目</button></div>}
    {notice && <div className="studio-toast" role="status"><Check size={16}/>{notice}</div>}
    <input ref={input} type="file" accept=".json,.anyvis,.zip" hidden onChange={e => void importFile(e.target.files?.[0])}/>

    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className={`studio-modal modal-${modal}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="modal-eyebrow">ANYVIS STUDIO</span><h2 id="modal-title">{({ templates: '从一个好想法开始', projects: '我的作品', settings: '画面设置', help: '让你的第一段动画动起来', ai: '和 AI 一起创作', export: '把作品带出去' })[modal]}</h2></div><button className="icon-button" aria-label="关闭对话框" onClick={() => setModal(null)}><X size={20}/></button></div>
      {modal === 'templates' && <><p className="modal-description">每个示例都由可编辑的积木组成。改一个参数，就能看到新的结果。</p><div className="gallery-toolbar"><div className="gallery-search"><Search size={16}/><input aria-label="搜索示例" placeholder="搜索几何、函数、三维…" value={gallerySearch} onChange={e => setGallerySearch(e.target.value)}/></div><button className="small-button" onClick={() => replaceProject(withDefaultMusic(createEmptyProject()))}><FilePlus2 size={15}/> 空白作品</button></div><div className="template-grid">{templateCatalog.filter(t => `${t.title} ${t.description} ${t.category}`.includes(gallerySearch)).map(t => <button className="template-card" key={t.id} onClick={() => { const next = getTemplate(t.id); if (next) replaceProject(withDefaultMusic(next)); }}><div className="template-image"><img src={t.thumbnail} alt=""/><span>{t.category}</span></div><div className="template-info"><h3>{t.title}<ArrowRight size={16}/></h3><p>{t.description}</p><small>打开并编辑积木 <span>→</span></small></div></button>)}</div><p className="modal-footnote">封面是内容示意图，舞台预览使用真实 Manim 渲染。当前作品已自动保留在“我的作品”。</p></>}
      {modal === 'projects' && <><p className="modal-description">作品自动保存在当前浏览器。导出项目文件，可以备份或换一台电脑继续创作。</p><div className="project-library-actions"><button className="small-button" onClick={() => input.current?.click()}><Upload size={15}/> 打开项目文件</button><button className="small-button primary" onClick={() => replaceProject(withDefaultMusic(createEmptyProject()))}><Plus size={15}/> 新建作品</button></div><div className="saved-project-list">{readProjects().map(({ project: item, savedAt }) => <button key={item.id} onClick={() => replaceProject(item)}><span className="project-file-icon"><Clapperboard size={21}/></span><span><strong>{item.name}</strong><small>{allActions(item.actions).length} 个积木 · {new Date(savedAt).toLocaleString('zh-CN')}</small></span><ArrowRight size={16}/></button>)}</div></>}
      {modal === 'settings' && <div className="settings-grid"><label>场景类型<select value={project.scene.dimension} onChange={e => setProject(p => ({ ...p, scene: { ...p.scene, dimension: e.target.value as '2d' | '3d' } }))}><option value="2d">二维 · 几何、函数与公式</option><option value="3d">三维 · 空间与相机</option></select></label><label>渲染器<select value={project.scene.renderer || 'cairo'} onChange={e => setProject(p => ({ ...p, scene: { ...p.scene, renderer: e.target.value as 'cairo' | 'opengl' } }))}><option value="cairo">Cairo · 稳定的默认渲染</option><option value="opengl">OpenGL · 扩展 API，需要显卡环境支持</option></select></label><label>画面比例<select value={`${project.scene.width}x${project.scene.height}`} onChange={e => { const [width, height] = e.target.value.split('x').map(Number); setProject(p => ({ ...p, scene: { ...p.scene, width, height } })); }}>{!['1920x1080','1080x1080','1080x1920','1280x720'].includes(`${project.scene.width}x${project.scene.height}`) && <option value={`${project.scene.width}x${project.scene.height}`}>自定义 · {project.scene.width} × {project.scene.height}</option>}<option value="1920x1080">16:9 · 1920 × 1080</option><option value="1080x1080">1:1 · 1080 × 1080</option><option value="1080x1920">9:16 · 1080 × 1920</option><option value="1280x720">16:9 · 1280 × 720</option></select></label><label>动画帧率<select value={project.scene.fps} onChange={e => setProject(p => ({ ...p, scene: { ...p.scene, fps: Number(e.target.value) } }))}>{![24, 30, 60].includes(project.scene.fps) && <option value={project.scene.fps}>{project.scene.fps} fps · 自定义</option>}<option value={24}>24 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label><MusicSettings project={project} onChange={setProject} onError={notify}/><div className="math-theme-presets" role="group" aria-label="推荐画面主题预设"><span className="math-theme-label">主题预设：</span>{MATH_THEMES.map(theme => <button key={theme.bg} type="button" className={`math-theme-pill ${project.scene.background.toLowerCase() === theme.bg.toLowerCase() ? 'active' : ''}`} onClick={() => setProject(p => ({ ...p, scene: { ...p.scene, background: theme.bg } }))}><span className="math-theme-swatch" style={{ background: theme.bg }}/>{theme.name}</button>)}</div><div className="settings-color-field"><label htmlFor="scene-background">背景颜色</label><div className="color-input"><input id="scene-background" aria-label="背景颜色" type="color" value={project.scene.background} onChange={e => setProject(p => ({ ...p, scene: { ...p.scene, background: e.target.value } }))}/><code>{project.scene.background}</code></div><div className="background-swatches" role="group" aria-label="常用背景颜色">{COMMON_COLOURS.slice(0, 6).map(colour => <button key={colour.value} aria-label={`背景：${colour.name}`} title={colour.name} style={{ backgroundColor: colour.value }} onClick={() => setProject(p => ({ ...p, scene: { ...p.scene, background: colour.value } }))}/>)}</div></div><p className="settings-note">预览会降低分辨率以更快得到结果；预览与成片使用相同的 Manim 动画和求值帧率。</p><button className="primary-button settings-done" onClick={() => setModal(null)}>完成</button></div>}
      {modal === 'help' && <><p className="modal-description">不用写 Python，也可以制作真正的数学动画。</p><div className="guide-steps"><div><span>01</span><h3>添加图形</h3><p>从左侧积木库选择圆、文字或坐标系，接到起始块下方。点击字段即可改数值、名字和颜色。</p></div><div><span>02</span><h3>安排变化</h3><p>接上移动、旋转、变形等动作，选择要改变的对象。用“同时”和“重复”把多个动作组合起来。</p></div><div><span>03</span><h3>观看与导出</h3><p>自动预览会在修改后重新渲染。播放确认效果，再导出视频；保存项目后仍可继续修改。</p></div></div><div className="guide-shortcuts"><span><kbd>⌘ / Ctrl</kbd> + <kbd>S</kbd> 保存项目</span><span><kbd>⌘ / Ctrl</kbd> + <kbd>Enter</kbd> 更新预览</span></div><button className="primary-button" onClick={() => setModal('templates')}>选一个示例开始 <ArrowRight size={15}/></button></>}
      {modal === 'export' && <><p className="modal-description">视频用于分享，项目保留可编辑的积木，Python 源码可以直接交给 Manim。</p><div className="export-options"><button onClick={exportProject}><Save size={22}/><span><strong>保存积木项目</strong><small>.anyvis.json / .zip · 含图片与配音素材</small></span><Download size={16}/></button><button disabled={!!errors.length} onClick={() => void exportSource()}><Code2 size={22}/><span><strong>导出 Manim 源码</strong><small>.py / .zip · Python 与所需素材</small></span><Download size={16}/></button></div><div className="video-export"><h3><Clapperboard size={19}/> 导出视频</h3><label>画质<select value={quality} onChange={e => setQuality(e.target.value as 'preview' | 'final')}><option value="preview">快速预览 · 较小分辨率</option><option value="final">成片 · {project.scene.width} × {project.scene.height} / {project.scene.fps} fps</option></select></label>{video && currentVideo && video.quality === quality ? <a className="primary-button" href={video.url} download={`${fileName(project.name)}.${video.format}`} ><Download size={16}/> 下载视频</a> : <button className="primary-button" disabled={running || !!errors.length} onClick={() => { void render(quality); }}>{running ? <Loader2 className="spin" size={16}/> : <Clapperboard size={16}/>} {running ? '正在生成视频…' : '生成视频'}</button>}{running && <p className="muted-small">{job?.message || '正在渲染'} · 完成后可在这里下载。</p>}{renderError && <p className="inline-error">{renderError}</p>}</div></>}
      {modal === 'ai' && <><p className="modal-description">描述你想表达的内容，得到可以继续搭建、修改的积木作品。</p><div className="ai-tabs"><button className={aiTab === 'generate' ? 'active' : ''} onClick={() => setAiTab('generate')}>连接模型生成</button><button className={aiTab === 'import' ? 'active' : ''} onClick={() => setAiTab('import')}>使用已有 AI</button></div><label className="ai-request">想制作或修改什么？<textarea placeholder="例如：画出正弦曲线，用一个运动点展示角度增加时高度的变化，最后写出公式。" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={3}/></label>{aiTab === 'generate' ? <><div className="ai-connection"><label>API 地址<input value={aiEndpoint} onChange={e => setAiEndpoint(e.target.value)} placeholder="https://…/v1"/></label><label>模型名称<input value={aiModel} onChange={e => setAiModel(e.target.value)} placeholder="填写服务商提供的模型 ID"/></label><label className="ai-key">API 密钥<input type="password" autoComplete="off" value={aiKey} onChange={e => setAiKey(e.target.value)} placeholder="仅在当前会话内使用；本地服务可留空"/></label></div><p className="modal-footnote">使用你自己的兼容 API 服务，调用可能产生费用。密钥不会写入作品或浏览器存储。只有点击生成时才发送当前作品。</p><div className="ai-action-row"><button className="primary-button" disabled={aiLoading} onClick={() => void generateAI()}>{aiLoading ? <Loader2 size={16} className="spin"/> : <WandSparkles size={16}/>} {aiLoading ? '正在生成积木…' : '生成可编辑作品'}</button>{aiLoading && <button className="small-button" onClick={() => { aiAbort.current?.abort(); setAiLoading(false); }}>取消</button>}</div></> : <><p className="ai-import-description">把带有项目格式与积木说明的提示词交给你使用的 AI，再将它返回的 JSON 粘贴到这里。</p><div className="ai-action-row"><button className="small-button" onClick={() => void copyPrompt()}><Copy size={14}/> 复制提示词</button><button className="small-button" onClick={() => void downloadPrompt()}><Download size={14}/> 导出提示词</button></div><textarea className="ai-json" value={aiJson} onChange={e => setAiJson(e.target.value)} placeholder="粘贴 AI 返回的项目 JSON…" rows={5}/><button className="primary-button" disabled={!aiJson.trim()} onClick={() => void importAI()}>检查并载入 <ArrowRight size={15}/></button></>}{aiError && <div className="inline-error" role="alert">{aiError}</div>}{aiCandidate && <div className="ai-result"><Check size={20}/><div><strong>{aiCandidate.name}</strong><p>{aiSummary}</p><small>{allActions(aiCandidate.actions).length} 个可编辑积木 · {aiCandidate.scene.dimension.toUpperCase()}</small></div><button className="primary-button" onClick={() => { const next = { ...aiCandidate, id: crypto.randomUUID(), workspace: undefined }; if (replaceProject(next)) { setAiCandidate(null); notify('AI 作品已打开，原作品仍保留在“我的作品”。'); } }}>打开作品</button></div>}</>}
    </section></div>}

    {presenting && (
      <div className="presentation-overlay" style={{ background: project.scene.background }}>
        <div className="presentation-stage">
          <video
            ref={presentationVideoRef}
            key={video?.url}
            src={video?.url}
            playsInline
            preload="auto"
            onClick={advancePresentation}
            onTimeUpdate={onPresentationTimeUpdate}
          />
        </div>
        <div className="presentation-hud">
          <div className="presentation-hud-left">
            <button className="presentation-btn" onClick={() => jumpPresentationStep(0)} title="从头开始" aria-label="从头开始"><RotateCcw size={15} /></button>
            <button className="presentation-btn" disabled={presentationStepIdx === 0} onClick={() => jumpPresentationStep(presentationStepIdx - 1)} title="上一步 (←)" aria-label="上一步"><ChevronLeft size={16} /> 上一步</button>
          </div>
          <div className="presentation-hud-center">
            <span className="presentation-step-badge">{presentationStepIdx + 1} / {presentationSteps.length}</span>
            <span className="presentation-step-title">{presentationSteps[presentationStepIdx]?.label}</span>
            <div className="presentation-dots">
              {presentationSteps.map((step, idx) => (
                <button
                  key={idx}
                  className={`presentation-dot ${idx === presentationStepIdx ? 'active' : idx < presentationStepIdx ? 'passed' : ''}`}
                  onClick={() => jumpPresentationStep(idx)}
                  title={`步骤 ${idx + 1}: ${step.label}`}
                  aria-label={`步骤 ${idx + 1}`}
                />
              ))}
            </div>
          </div>
          <div className="presentation-hud-right">
            <button className="presentation-btn primary" onClick={advancePresentation} title={presentationStepIdx < presentationSteps.length - 1 ? '下一步 (空格 / →)' : '从头播放'} aria-label="下一步">
              {presentationPlaying ? <Pause size={15} /> : <Play size={15} />}
              <span>{presentationStepIdx < presentationSteps.length - 1 ? '下一步' : '从头播放'}</span>
              <ChevronRight size={16} />
            </button>
            <button className="presentation-btn close" onClick={exitPresentation} title="退出演播 (Esc)" aria-label="退出演播"><X size={16} /></button>
          </div>
        </div>
      </div>
    )}

    {cmdPaletteOpen && (
      <CommandPalette
        project={project}
        onClose={() => setCmdPaletteOpen(false)}
        onSelectAction={id => {
          setSelected(id);
          setSelectedIds([id]);
          if (editorTab === 'blocks') {
            setTimeout(() => editor.current?.highlight(id), 40);
          }
        }}
        onAddBlock={type => addObject(type)}
        studioActions={[
          {
            id: 'render-preview',
            title: '更新预览画面',
            subtitle: '立即编译并渲染 Manim 预览 (⌘/Ctrl + Enter)',
            keywords: 'render preview 渲染 预览',
            run: () => void render('preview'),
          },
          {
            id: 'presentation',
            title: '开启交互式演播模式',
            subtitle: '按步骤自动驻留，空格/方向键控制讲解幻灯片',
            keywords: 'presentation slide 演播 幻灯片 放映',
            run: () => {
              if (!video) {
                notify('请先生成预览视频，再开启演播模式。');
                return;
              }
              setPresenting(true);
              setPresentationStepIdx(0);
              seek(0);
            },
          },
          {
            id: 'snapshot-frame',
            title: '截取当前画面帧 PNG',
            subtitle: '保存当前播放头位置的无损 PNG 截图',
            keywords: 'snapshot screenshot png 截图 快照 帧',
            run: captureVideoFrame,
          },
          {
            id: 'view-blocks',
            title: '切换到积木视图',
            subtitle: 'Scratch 风格可视化积木编排',
            keywords: 'blocks 积木 视图',
            run: () => switchView('blocks'),
          },
          {
            id: 'view-timeline',
            title: '切换到时间轴视图',
            subtitle: '多轨道时间轴与配音裁剪',
            keywords: 'timeline 时间轴 视图',
            run: () => switchView('timeline'),
          },
          {
            id: 'view-code',
            title: '切换到 Manim Python 源码视图',
            subtitle: '查看实时生成的只读 Manim 脚本',
            keywords: 'code python 代码 源码',
            run: () => switchView('code'),
          },
          {
            id: 'matrix-playground',
            title: '3B1B 矩阵线性变换交互台',
            subtitle: '直观探索二维线性变换、网格形变、特征值与行列式',
            colour: '#38bdf8',
            keywords: 'matrix linear transformation 矩阵 变换 行列式 3b1b 几何',
            run: () => setMatrixPlaygroundOpen(true),
          },
          {
            id: 'open-fourier-playground',
            title: '3B1B 傅里叶环绕圆交互台 (Fourier Epicycles)',
            subtitle: 'DFT 离散复傅里叶级数分解、多环绕圆仿真与参数曲线生成',
            colour: '#a855f7',
            keywords: 'fourier epicycles 傅里叶 环绕圆 级数 dft 3b1b 曲线',
            run: () => setFourierPlaygroundOpen(true),
          },
          {
            id: 'open-calculus-playground',
            title: '3B1B 微积分导数与切线交互台 (Essence of Calculus)',
            subtitle: '割线极限逼近切线、导函数动态几何与 ValueTracker 动画生成',
            colour: '#38bdf8',
            keywords: 'calculus derivative tangent secant 微积分 导数 切线 割线 极限定理 3b1b',
            run: () => setCalculusPlaygroundOpen(true),
          },
          {
            id: 'open-riemann-playground',
            title: '3B1B 黎曼和与定积分交互台 (Riemann Sums)',
            subtitle: '矩形求和极限逼近、定积分面积与 Manim 代码生成',
            colour: '#58c4dd',
            keywords: 'riemann integral 黎曼和 定积分 面积 极限 3b1b 微积分',
            run: () => setRiemannPlaygroundOpen(true),
          },
          {
            id: 'open-keyframe-curve',
            title: '缓动曲线与关键帧检查器 (Keyframe Easing Inspector)',
            subtitle: '交互式三阶贝塞尔曲线调节、实时运动预览与 rate_func 代码生成',
            colour: '#bb86fc',
            keywords: 'keyframe easing bezier rate_func 缓动 贝塞尔 关键帧 曲线 速度 动画质感',
            run: () => setKeyframeCurveOpen(true),
          },
          {
            id: 'open-audio-visualizer',
            title: '音频响应式频谱与波形助手 (Audio Visualizer)',
            subtitle: '直方频谱柱、对称波形、环形声场与示波器动画生成',
            colour: '#e2b340',
            keywords: 'audio visualizer spectrum waveform 频谱 波形 声波 音频 律动 示波器',
            run: () => setAudioVisualizerOpen(true),
          },
          {
            id: 'open-tex-color-styler',
            title: '3B1B 公式专属配色器 (LaTeX Equation Styler)',
            subtitle: '为公式变量与符号赋予专属色彩，生成 MathTex 动画代码',
            colour: '#e2b340',
            keywords: 'latex mathtex tex color formula 3b1b 公式 配色 着色 变量',
            run: () => setTexColorStylerOpen(true),
          },
          {
            id: 'open-vector-field',
            title: '2D 向量场与流线工作台 (Vector Field & Streamlines)',
            subtitle: '散度旋度探针、Runge-Kutta 粒子流动模拟与 ArrowVectorField 生成',
            colour: '#58c4dd',
            keywords: 'vector field streamlines 向量场 流线 散度 旋度 粒子 3b1b 微积分',
            run: () => setVectorFieldOpen(true),
          },
          {
            id: 'open-complex-mapping',
            title: '3B1B 复变函数与共形映射工作台 (Complex Mapping)',
            subtitle: '复平面网格保角形变、局部导数放大率与 apply_complex_function',
            colour: '#e2b340',
            keywords: 'complex conformal mapping 复变函数 保角变换 共形映射 莫比乌斯 儒可夫斯基 3b1b',
            run: () => setComplexMappingOpen(true),
          },
          {
            id: 'open-storyboard',
            title: '分镜剧本与多章节大纲 (Storyboard & Chapter Management)',
            subtitle: '分段编排、视频章节时间戳导出与 Manim next_section()',
            colour: '#38bdf8',
            keywords: 'storyboard chapters section 分镜 剧本 章节 时间戳 next_section 视频制作',
            run: () => setStoryboardOpen(true),
          },
          {
            id: 'open-surface-playground',
            title: '3B1B 3D 参数曲面与视角工作台 (3D Parametric Surfaces)',
            subtitle: '马鞍面、环面、莫比乌斯带等三维几何交互与 ThreeDScene 生成',
            colour: '#38bdf8',
            keywords: 'surface 3d threedscene parametric 曲面 三维 3b1b 视角 环面 莫比乌斯',
            run: () => setSurfacePlaygroundOpen(true),
          },
          {
            id: 'open-camera-director',
            title: '运镜导演与动态取景器 (Camera Director & Viewfinder)',
            subtitle: '平移聚焦缩放运镜序列、三分法则构图与 MovingCameraScene 生成',
            colour: '#f59e0b',
            keywords: 'camera moving director 运镜 摄像机 取景 构图 变焦 平移',
            run: () => setCameraDirectorOpen(true),
          },
          {
            id: 'open-subtitle-sync',
            title: '字幕配音同步工作台 (Subtitles & Voiceover Sync)',
            subtitle: '解说字幕时序编排、SRT 导入导出与自动淡入淡出动画',
            colour: '#83c167',
            keywords: 'subtitles captions srt 字幕 配音 口播 解说 旁白',
            run: () => setSubtitleSyncOpen(true),
          },
          {
            id: 'export-py',
            title: '导出独立 Manim Python 脚本 (.py)',
            subtitle: '下载可直接由 manim 命令运行的源码',
            keywords: 'export python 导出 源码',
            run: () => void exportSource(),
          },
          ...MATH_THEMES.map(t => ({
            id: `theme-${t.bg}`,
            title: `切换画面主题：${t.name}`,
            subtitle: `背景颜色 ${t.bg}`,
            colour: t.bg === '#000000' ? '#64748b' : t.bg,
            keywords: `theme background 主题 背景 ${t.name}`,
            run: () => setProject(p => ({ ...p, scene: { ...p.scene, background: t.bg } })),
          })),
        ]}
      />
    )}

    <MatrixPlaygroundModal
      isOpen={matrixPlaygroundOpen}
      onClose={() => setMatrixPlaygroundOpen(false)}
      onInsertMatrix={matStr => {
        try {
          const current = editor.current?.snapshot() || projectRef.current;
          const lastVisual = flattenActions(current.actions).filter(managedObject).pop();
          const targetName = lastVisual ? String(lastVisual.fields.name) : '平面';
          const result = appendAction(current, 'apply_matrix', { matrix: matStr, target: targetName });
          setProject(result.project);
          setSelected(result.action.id);
          setSelectedIds([result.action.id]);
          notify(`已插入线性变换动画：ApplyMatrix(${matStr}, ${targetName})`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />

    <FourierPlaygroundModal
      isOpen={fourierPlaygroundOpen}
      onClose={() => setFourierPlaygroundOpen(false)}
      onInsertFourier={(coeffs, shapeName) => {
        try {
          const current = editor.current?.snapshot() || projectRef.current;
          const { project: nextProject, actionIds } = createFourierActions(current, coeffs, shapeName);
          setProject(nextProject);
          if (actionIds[0]) {
            setSelected(actionIds[0]);
            setSelectedIds(actionIds);
          }
          notify(`已向动画编排插入“${shapeName}”参数曲线`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />

    <CalculusPlaygroundModal
      isOpen={calculusPlaygroundOpen}
      onClose={() => setCalculusPlaygroundOpen(false)}
      onInsertCalculus={(preset, x0) => {
        try {
          const current = editor.current?.snapshot() || projectRef.current;
          const { project: nextProject, actionIds } = createCalculusActions(current, preset, preset.name.split(' ')[0]);
          setProject(nextProject);
          if (actionIds[0]) {
            setSelected(actionIds[0]);
            setSelectedIds(actionIds);
          }
          notify(`已向动画编排插入“${preset.name}”及导函数曲线 (x₀=${x0.toFixed(2)})`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />

    <RiemannPlaygroundModal
      isOpen={riemannPlaygroundOpen}
      onClose={() => setRiemannPlaygroundOpen(false)}
      onInsertRiemann={(preset, a, b, n, mode) => {
        try {
          const current = editor.current?.snapshot() || projectRef.current;
          const { project: nextProject, actionIds } = createRiemannActions(current, preset, a, b, n, mode);
          setProject(nextProject);
          if (actionIds[0]) {
            setSelected(actionIds[0]);
            setSelectedIds(actionIds);
          }
          notify(`已向动画编排插入“${preset.name}”黎曼和与定积分`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />

    <KeyframeCurveModal
      isOpen={keyframeCurveOpen}
      onClose={() => setKeyframeCurveOpen(false)}
      onApplyRateFunc={(rateFuncName, coords) => {
        try {
          const current = editor.current?.snapshot() || projectRef.current;
          if (selected) {
            const all = flattenActions(current.actions);
            const target = all.find(a => a.id === selected);
            if (target && !managedObject(target)) {
              const updated = applyRateFuncToAction(target, rateFuncName, coords);
              const mapActions = (acts: Action[]): Action[] =>
                acts.map(a => (a.id === selected ? updated : { ...a, children: mapActions(a.children || []) }));
              setProject({ ...current, actions: mapActions(current.actions) });
            }
          }
          notify(`已应用缓动曲线 cubic-bezier(${coords.map(v => v.toFixed(2)).join(', ')})`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />

    <AudioVisualizerModal
      isOpen={audioVisualizerOpen}
      onClose={() => setAudioVisualizerOpen(false)}
      onInsertAudioVisualizer={preset => {
        try {
          const current = editor.current?.snapshot() || projectRef.current;
          const { project: nextProject, actionIds } = createAudioVisualizerActions(current, preset);
          setProject(nextProject);
          if (actionIds[0]) {
            setSelected(actionIds[0]);
            setSelectedIds(actionIds);
          }
          notify(`已向动画编排插入“${preset.name}”音频频谱组件`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />

    <TexColorStylerModal
      isOpen={texColorStylerOpen}
      onClose={() => setTexColorStylerOpen(false)}
      onInsertColoredTex={(rawTex, colorMap, name) => {
        try {
          const current = editor.current?.snapshot() || projectRef.current;
          const { project: nextProject, actionIds } = createColoredMathTexActions(current, rawTex, colorMap, name);
          setProject(nextProject);
          if (actionIds[0]) {
            setSelected(actionIds[0]);
            setSelectedIds(actionIds);
          }
          notify(`已向动画编排插入“${name}”专属配色公式`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />

    <VectorFieldPlaygroundModal
      isOpen={vectorFieldOpen}
      onClose={() => setVectorFieldOpen(false)}
      project={project}
      onApply={(nextProject, actionIds) => {
        try {
          setProject(nextProject);
          if (actionIds[0]) {
            setSelected(actionIds[0]);
            setSelectedIds(actionIds);
          }
          notify(`已向动画编排插入 2D 向量场组件`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />

    <ComplexMappingModal
      isOpen={complexMappingOpen}
      onClose={() => setComplexMappingOpen(false)}
      project={project}
      onApply={(nextProject, actionIds) => {
        try {
          setProject(nextProject);
          if (actionIds[0]) {
            setSelected(actionIds[0]);
            setSelectedIds(actionIds);
          }
          notify(`已向动画编排插入复变共形映射组件`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />

    <StoryboardModal
      isOpen={storyboardOpen}
      onClose={() => setStoryboardOpen(false)}
      project={project}
      onApply={(nextProject) => {
        try {
          setProject(nextProject);
          notify(`已同步分镜章节到时间轴智能标记`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />

    <SurfacePlaygroundModal
      isOpen={surfacePlaygroundOpen}
      onClose={() => setSurfacePlaygroundOpen(false)}
      project={project}
      onApply={(nextProject, actionIds) => {
        try {
          setProject(nextProject);
          if (actionIds[0]) {
            setSelected(actionIds[0]);
            setSelectedIds(actionIds);
          }
          notify(`已切换至 3D 模式并插入参数曲面组件`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />

    <CameraDirectorModal
      isOpen={cameraDirectorOpen}
      onClose={() => setCameraDirectorOpen(false)}
      project={project}
      onApply={(nextProject, actionIds) => {
        try {
          setProject(nextProject);
          if (actionIds[0]) {
            setSelected(actionIds[0]);
            setSelectedIds(actionIds);
          }
          notify(`已向动画编排插入运镜序列动作`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />

    <SubtitleSyncModal
      isOpen={subtitleSyncOpen}
      onClose={() => setSubtitleSyncOpen(false)}
      project={project}
      onApply={(nextProject, actionIds) => {
        try {
          setProject(nextProject);
          if (actionIds[0]) {
            setSelected(actionIds[0]);
            setSelectedIds(actionIds);
          }
          notify(`已向动画编排插入解说字幕序列`);
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    />
  </div>;
}
