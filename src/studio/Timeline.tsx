import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Timeline as TimelineEditor, type TimelineState } from '@xzdarcy/react-timeline-editor';
import { ArrowLeft, ArrowRight, Clock3, Layers3, Magnet, Maximize2, Minus, Music2, Pause, Play, Plus, Scissors, SkipBack, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import type { TimelineRow } from '@xzdarcy/timeline-engine';
import type { Project } from './core/types';
import { CURATED_BLOCK_CATALOG, getBlockDefinition } from './core/catalog';
import { actionLabel, actionTrack, appendAction, flattenActions, managedDefinition, managedObject, parallelWithNext, removeAction, removeActions, reorderAction, timelineClips, updateAction } from './authoring';
import { audioClips, checkedEdit, editAudioClip, frameTime, moveAnimationClip, moveAnimationClips, resizeAnimationClip, splitAudioClip } from './timeline-model';
import { AudioWaveform } from './AudioWaveform';
import { ActionInspector } from './ActionInspector';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import './timeline.css';

interface Props {
  project: Project; selectedId: string | null; time: number; playing?: boolean; canPlay?: boolean;
  onChange(project: Project): void; onSelect(id: string): void; onShowBlocks(id: string): void;
  onSeek(time: number): void; onError(message: string): void; onPlay?(): void;
  onMusicSettings?(): void;
  selectedIds?: string[];
  onSelectIds?(ids: string[]): void;
}
const palette = ['#6ca6ed', '#b295e8', '#72bfa5', '#e4ad63', '#e089aa'];
const effects = { animation: { id: 'animation', name: '动画' }, audio: { id: 'audio', name: '配音' }, event: { id: 'event', name: '事件' } };
export const timecode = (value: number, fps = 30) => {
  const frames = Math.max(0, Math.round(value * fps));
  return `${Math.floor(frames / fps / 60).toString().padStart(2, '0')}:${(Math.floor(frames / fps) % 60).toString().padStart(2, '0')}:${(frames % fps).toString().padStart(2, '0')}`;
};
export function Timeline({ project, selectedId, selectedIds: propsSelectedIds, time, playing = false, canPlay = false, onChange, onSelect, onSelectIds, onShowBlocks, onSeek, onError, onPlay, onMusicSettings }: Props) {
  const [scale, setScale] = useState(80), [snapping, setSnapping] = useState(true);
  const [adding, setAdding] = useState(false), [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0), [hint, setHint] = useState('');
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const [box, setBox] = useState<{ active: boolean; startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  const editor = useRef<TimelineState>(null), trackLabels = useRef<HTMLDivElement>(null), surface = useRef<HTMLDivElement>(null);
  const clips = useMemo(() => timelineClips(project.actions), [project.actions]);
  const audio = useMemo(() => audioClips(project), [project]);

  const selectedIds = propsSelectedIds ?? (internalSelectedIds.length > 0 ? internalSelectedIds : selectedId ? [selectedId] : []);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleSelectIds = useCallback((ids: string[]) => {
    if (onSelectIds) onSelectIds(ids);
    else setInternalSelectedIds(ids);
    if (ids.length === 1) onSelect(ids[0]);
    else if (ids.length === 0) onSelect('');
    else if (!ids.includes(selectedId ?? '')) onSelect(ids[0]);
  }, [onSelectIds, onSelect, selectedId]);

  const primarySelectedId = selectedIds[0] ?? selectedId;
  const selected = flattenActions(project.actions).find(a => a.id === primarySelectedId);
  const selectedClip = clips.find(c => c.action.id === primarySelectedId), selectedAudio = audio.find(c => c.action.id === primarySelectedId);
  const definition = selected && getBlockDefinition(selected.type);
  const visual = clips.filter(c => c.action.type !== 'audio_play');
  const unknown = [...visual.filter(c => c.start === null || c.duration === null).map(c => ({ ...c, id: c.action.id })), ...audio.filter(c => c.start === null).map(c => ({ ...c, track: String(c.action.fields.name) }))];
  const tracks = [...new Set(visual.filter(c => c.start !== null && c.duration !== null).map(c => c.track))];
  const knownEnd = Math.max(0, ...clips.map(c => (c.start || 0) + (c.duration || 0)), ...audio.map(c => (c.start || 0) + c.duration));
  const musicEnabled = project.scene.backgroundMusic === 'piano', musicId = 'anyvis:default-piano';
  const tick = scale < 24 ? 5 : scale < 48 ? 2 : 1;
  const labels = [...tracks.map((name, i) => ({ id: `visual:${i}`, name, colour: palette[i % palette.length], audio: false })), ...audio.map(c => ({ id: c.id, name: String(c.action.fields.name), colour: '#6ec5a6', audio: true })), ...(musicEnabled ? [{ id: musicId, name: '默认钢琴配乐', colour: '#d4b481', audio: true }] : [])];

  const rows: TimelineRow[] = useMemo(() => [
    ...tracks.map((track, i) => ({ id: `visual:${i}`, actions: visual.filter(c => c.track === track && c.start !== null && c.duration !== null).map(c => ({
      id: c.action.id, start: c.start!, end: c.start! + Math.max(1 / project.scene.fps, c.duration!),
      effectId: c.duration === 0 ? 'event' : 'animation', selected: selectedIdSet.has(c.action.id),
      movable: true, flexible: c.duration! > 0 && typeof c.action.fields.duration === 'number' && !getBlockDefinition(c.action.type)?.container, minStart: 0, maxEnd: 600,
    })) })),
    ...audio.map(c => ({ id: c.id, actions: c.start === null ? [] : [{ id: c.id, start: c.start, end: c.start + Math.max(1 / project.scene.fps, c.duration), effectId: 'audio', selected: selectedIdSet.has(c.action.id), movable: c.editable && c.duration > 0, flexible: c.editable && c.duration > 0, minStart: 0, maxEnd: c.stop ?? 600 }] })),
    ...(musicEnabled ? [{ id: musicId, actions: [{ id: musicId, start: 0, end: Math.max(.1, knownEnd), effectId: 'audio', movable: false, flexible: false }] }] : []),
  ], [project, selectedIdSet, revision]); // Fresh projection also rolls back rejected gestures; library mutates its own copy.

  useEffect(() => { editor.current?.setTime(time); }, [time, revision, scale]);

  const resolveId = (id: string) => audio.find(c => c.id === id)?.action.id || id;
  const mutate = (operation: () => Project) => {
    try { const next = operation(); onChange(next); setHint(''); }
    catch (error) { onError((error as Error).message); }
    finally { setRevision(v => v + 1); }
  };

  const commit = (id: string, start: number, end: number, mode: 'move' | 'left' | 'right') => {
    const resolved = resolveId(id);
    const isMulti = selectedIds.length > 1 && selectedIds.includes(resolved);
    if (!isMulti) handleSelectIds([resolved]);
    const clip = audio.find(c => c.id === id);
    if (clip) {
      mutate(() => editAudioClip(project, clip, start, end, mode));
    } else if (mode === 'move') {
      if (isMulti) {
        mutate(() => moveAnimationClips(project, selectedIds, start, resolved));
      } else {
        mutate(() => moveAnimationClip(project, resolved, start));
      }
    } else {
      mutate(() => resizeAnimationClip(project, resolved, end - start));
    }
  };

  const seek = (value: number) => onSeek(frameTime(Math.max(0, Math.min(600, value)), project.scene.fps));
  const add = (type: string) => {
    const fields = getBlockDefinition(type)?.fields || [];
    const track = selected ? actionTrack(selected) : tracks.find(t => !['场景与逻辑', '编排'].includes(t));
    const result = appendAction(project, type, fields.some(f => f.name === 'target') && track && !['场景与逻辑', '编排'].includes(track) ? { target: track } : {});
    onChange(result.project); handleSelectIds([result.action.id]); setAdding(false);
  };
  const options = CURATED_BLOCK_CATALOG.filter(d => !managedDefinition(d) && !['code', 'audio_play'].includes(d.type) && [d.label, d.category, d.type].join(' ').toLowerCase().includes(query.toLowerCase()));
  const fit = () => { setScale(Math.max(8, Math.min(240, ((surface.current?.clientWidth || 800) - 185) / Math.max(5, knownEnd + 1)))); editor.current?.setScrollLeft(0); };
  const shiftOrder = (direction: number) => {
    if (!selectedClip) return;
    const index = selectedClip.index, before = direction < 0 ? clips[index - 1]?.action.id : clips[index + 2]?.action.id || null;
    mutate(() => checkedEdit(project, reorderAction(project, selectedClip.action.id, before)));
  };

  useEffect(() => {
    if (!box) return;
    const handleWindowMouseMove = (e: MouseEvent) => {
      setBox(prev => {
        if (!prev) return null;
        const dx = e.clientX - prev.startX;
        const dy = e.clientY - prev.startY;
        const active = prev.active || Math.abs(dx) > 4 || Math.abs(dy) > 4;
        return { ...prev, active, currentX: e.clientX, currentY: e.clientY };
      });
    };
    const handleWindowMouseUp = (e: MouseEvent) => {
      setBox(prev => {
        if (!prev) return null;
        if (prev.active) {
          const boxLeft = Math.min(prev.startX, prev.currentX);
          const boxRight = Math.max(prev.startX, prev.currentX);
          const boxTop = Math.min(prev.startY, prev.currentY);
          const boxBottom = Math.max(prev.startY, prev.currentY);

          const actionEls = surface.current?.querySelectorAll<HTMLElement>('.timeline-editor-action');
          const hitIds: string[] = [];
          actionEls?.forEach(el => {
            const elRect = el.getBoundingClientRect();
            const intersects = !(elRect.right < boxLeft || elRect.left > boxRight || elRect.bottom < boxTop || elRect.top > boxBottom);
            if (intersects) {
              const id = el.querySelector('[data-action-id]')?.getAttribute('data-action-id') || el.getAttribute('data-action-id');
              if (id && id !== musicId) {
                hitIds.push(resolveId(id));
              }
            }
          });
          const uniqueHits = Array.from(new Set(hitIds));
          if (e.shiftKey || e.metaKey || e.ctrlKey) {
            handleSelectIds(Array.from(new Set([...selectedIds, ...uniqueHits])));
          } else {
            handleSelectIds(uniqueHits);
          }
        }
        return null;
      });
    };
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [box, selectedIds, handleSelectIds]);

  return <section className="tl-editor" aria-label="动画时间轴" onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')) return;
    // Leave application/browser shortcuts (save, undo, history navigation) alone.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Space') { event.preventDefault(); if (canPlay) onPlay?.(); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); seek(time + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1) / project.scene.fps); }
    else if (event.key === 'Home') { event.preventDefault(); seek(0); }
    else if (event.key === 'End') { event.preventDefault(); seek(knownEnd); }
    else if (event.key.toLowerCase() === 's' && !event.repeat) setSnapping(v => !v);
    else if (event.key === 'Escape') { event.preventDefault(); handleSelectIds([]); }
    else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
      event.preventDefault();
      const toRemove = [...selectedIds];
      mutate(() => removeActions(project, toRemove));
      handleSelectIds([]);
    }
  }}>
    <div className="tl-toolbar">
      <button aria-label="回到开头" onClick={() => seek(0)}><SkipBack size={15}/></button>
      <button aria-label={playing ? '暂停时间轴预览' : '播放时间轴预览'} disabled={!canPlay} title={canPlay ? '空格：播放 / 暂停' : '先生成预览'} onClick={onPlay}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button>
      <span className="tl-timecode">{timecode(time, project.scene.fps)}</span><small className="tl-fps">{project.scene.fps} FPS</small><div className="tl-spacer"/>
      <button aria-label="磁性吸附" aria-pressed={snapping} title="吸附片段边缘与帧网格（S）" onClick={() => setSnapping(v => !v)}><Magnet size={15}/></button>
      <button aria-label="设置默认配乐" title={musicEnabled ? '自动钢琴配乐' : '当前无默认配乐'} onClick={onMusicSettings}><Music2 size={14}/> 配乐</button>
      <button onClick={() => add('wait')}><Clock3 size={14}/> 等待</button><button className="tl-add" onClick={() => setAdding(!adding)}><Plus size={14}/> 动画</button>
      <span className="tl-divider"/><button aria-label="缩小时间轴" onClick={() => setScale(s => Math.max(8, s / 1.4))}><Minus size={14}/></button><input className="tl-scale" aria-label="时间轴缩放" type="range" min="8" max="240" value={scale} onChange={e => setScale(Number(e.target.value))}/><button aria-label="放大时间轴" onClick={() => setScale(s => Math.min(240, s * 1.4))}><Plus size={14}/></button><button aria-label="适合全部片段" onClick={fit}><Maximize2 size={14}/></button>
    </div>
    {adding && <div className="tl-library"><input aria-label="搜索动画动作" placeholder="搜索移动、变形、循环…" value={query} onChange={e => setQuery(e.target.value)}/><button onClick={() => setAdding(false)}>关闭</button><div>{options.map(d => <button key={d.type} onClick={() => add(d.type)}><i style={{ background: d.colour }}/>{d.label}</button>)}</div></div>}
    <div className="tl-body" ref={surface} tabIndex={0} aria-label="时间轴编辑区"
      onWheel={e => { if (e.ctrlKey || e.metaKey) setScale(s => Math.max(8, Math.min(240, s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))); }}
      onMouseDown={e => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('.timeline-editor-action, .timeline-editor-cursor, .timeline-editor-time-area, .tl-labels, .tl-library, .tl-empty, button, input')) return;
        setBox({
          active: false,
          startX: e.clientX,
          startY: e.clientY,
          currentX: e.clientX,
          currentY: e.clientY,
        });
      }}>
      <aside className="tl-labels"><div className="tl-track-heading">轨道<span>{labels.length}</span></div><div className="tl-label-scroll" ref={trackLabels} onWheel={e => { if (trackLabels.current) editor.current?.setScrollTop(trackLabels.current.scrollTop + e.deltaY); }}>{labels.map(label => <div className="tl-track-label" key={label.id}><i style={{ background: label.colour }}/><span title={label.name}>{label.audio && <Music2 size={12}/>} {label.name}</span><small>{label.id === musicId ? '配乐 · 自动铺满' : label.audio ? '配音 · 独立音轨' : '动画 · 顺序联动'}</small></div>)}</div></aside>
      <TimelineEditor ref={editor} editorData={rows} effects={effects} style={{ flex: 1, width: 0, height: '100%' }} scale={tick} scaleWidth={scale * tick} scaleSplitCount={tick * project.scene.fps} startLeft={16} rowHeight={58} minScaleCount={Math.ceil(Math.max(10, knownEnd + 3) / tick)} maxScaleCount={Math.ceil(600 / tick)} gridSnap={snapping} dragLine={snapping} autoScroll autoReRender={false}
        onChange={() => false}
        onScroll={({ scrollTop }) => { if (trackLabels.current) trackLabels.current.scrollTop = scrollTop; }}
        onCursorDrag={seek} onClickTimeArea={value => { seek(value); return true; }} onClickRow={(_, { time: value }) => seek(value)}
        onClickAction={(e, { action }) => {
          if (action.id === musicId) { onMusicSettings?.(); return; }
          const resolved = resolveId(action.id);
          if (e.shiftKey || e.metaKey || e.ctrlKey) {
            const next = selectedIds.includes(resolved) ? selectedIds.filter(id => id !== resolved) : [...selectedIds, resolved];
            handleSelectIds(next);
          } else {
            handleSelectIds([resolved]);
          }
        }}
        onDoubleClickAction={(_, { action }) => action.id === musicId ? onMusicSettings?.() : onShowBlocks(resolveId(action.id))}
        onActionMoveStart={() => setHint('拖动中…')}
        onActionMoving={({ action, start, end }) => { setHint(`${timecode(start, project.scene.fps)} → ${timecode(end, project.scene.fps)}`); return action.effectId === 'audio' || start <= 600; }}
        onActionMoveEnd={({ action, start, end }) => commit(action.id, start, end, 'move')}
        onActionResizeStart={() => setHint('裁剪中…')}
        onActionResizing={({ action, start, end, dir }) => {
          if (end - start < 1 / project.scene.fps - 1e-8) return false;
          if (action.effectId !== 'audio' && dir === 'left') return false;
          const clip = audio.find(c => c.id === action.id);
          if (clip && (clip.offset + (dir === 'left' ? start - clip.start! : 0) < -1e-8 || clip.offset + end - clip.start! > clip.sourceDuration + 1e-8)) return false;
          setHint(`${timecode(start, project.scene.fps)} → ${timecode(end, project.scene.fps)}`);
        }}
        onActionResizeEnd={({ action, start, end, dir }) => commit(action.id, start, end, dir)}
        getScaleRender={value => <span>{timecode(value, project.scene.fps).slice(0, -3)}</span>}
        getActionRender={(item, row) => {
          if (item.id === musicId) return <div className="tl-item music" role="button" tabIndex={0} aria-label="默认配乐 · 舒缓钢琴" title="自动生成并铺满实际作品时长；点击设置音量或选择无配乐" onClick={onMusicSettings} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onMusicSettings?.(); } }} style={{ '--clip-colour': '#d4b481' } as React.CSSProperties}><span><Music2 size={12}/> 舒缓钢琴 · 自动铺满</span><small>{project.scene.musicGainDb ?? -18} dB · 首尾淡入淡出</small></div>;
          const clip = audio.find(c => c.id === item.id), source = clip?.action || clips.find(c => c.action.id === item.id)?.action;
          if (!source) return null;
          const label = labels.find(l => l.id === row.id);
          const isItemPressed = selectedIdSet.has(source.id);
          return <div role="button" tabIndex={0} data-action-id={source.id} aria-label={`${clip ? '配音' : actionLabel(source)} · ${label?.name} · ${timecode(item.start, project.scene.fps)}`} aria-pressed={isItemPressed} onClick={e => {
            e.stopPropagation();
            if (e.shiftKey || e.metaKey || e.ctrlKey) {
              const next = selectedIds.includes(source.id) ? selectedIds.filter(id => id !== source.id) : [...selectedIds, source.id];
              handleSelectIds(next);
            } else {
              handleSelectIds([source.id]);
            }
          }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSelectIds([source.id]); } }} className={`tl-item ${clip ? 'audio' : ''} ${item.effectId === 'event' ? 'event' : ''} ${source.fields.muted === 'yes' ? 'muted' : ''}`} style={{ '--clip-colour': label?.colour } as React.CSSProperties} title={clip ? '拖动移动配音；左右边缘裁剪源文件' : '拖动调整顺序；右边缘调整时长；双击打开积木；按住 Shift/Cmd 多选'}>
            {clip && <AudioWaveform asset={project.assets?.find(a => a.id === source.fields.asset)} offset={clip.offset} duration={item.end - item.start}/>}<span>{clip ? <Music2 size={12}/> : getBlockDefinition(source.type)?.container ? <Layers3 size={12}/> : null}{clip ? String(source.fields.name) : actionLabel(source)}</span><small>{item.effectId === 'event' ? '事件' : `${(item.end - item.start).toFixed(2)}s`}{clip ? ` · ${Number(source.fields.gain)} dB` : ''}</small>
          </div>;
        }}/>
      {box && box.active && surface.current && (
        <div className="tl-selection-box" style={{
          left: Math.min(box.startX, box.currentX) - surface.current.getBoundingClientRect().left,
          top: Math.min(box.startY, box.currentY) - surface.current.getBoundingClientRect().top,
          width: Math.abs(box.currentX - box.startX),
          height: Math.abs(box.currentY - box.startY),
        }}/>
      )}
      {!labels.length && <div className="tl-empty"><Layers3 size={28}/><strong>给对象安排第一段动画</strong><p>从右侧添加对象或上传配音，再安排动画。</p></div>}
    </div>
    {unknown.length > 0 && <div className="tl-dynamic"><span>动态时长 · 在积木中编排</span>{unknown.map(c => <button key={c.id} onClick={() => { handleSelectIds([c.action.id]); onShowBlocks(c.action.id); }}>{actionLabel(c.action)} · {c.track}</button>)}</div>}
    <div className="tl-status"><span title="Home 回到开头；End 到已知结尾；Shift + 方向键移动 10 帧；Delete 删除所选片段；按住 Shift/Cmd 多选">{hint || '拖动片段 · 边缘调整 · S 吸附 · ← → 逐帧 · Shift/Cmd 多选 · 空格播放'}</span><span>{timecode(knownEnd, project.scene.fps)} {unknown.length ? '+ 动态片段' : ''}</span></div>
    <div className="tl-inspector">
      {selectedIds.length > 1 ? (
        <div className="tl-batch-bar">
          <strong className="tl-batch-count">已选择 {selectedIds.length} 个片段</strong>
          <span className="tl-batch-hint">拖动任意所选片段可整体调整顺序</span>
          <div className="tl-spacer"/>
          <button aria-label="批量删除所选片段" onClick={() => {
            const toRemove = [...selectedIds];
            mutate(() => removeActions(project, toRemove));
            handleSelectIds([]);
          }}><Trash2 size={14}/> 批量删除 ({selectedIds.length})</button>
          <button onClick={() => handleSelectIds([])}><X size={14}/> 取消选择</button>
        </div>
      ) : selected ? <><div className="tl-selection-heading"><strong>{selectedAudio ? '配音' : actionLabel(selected)} <span>{selectedAudio ? String(selected.fields.name) : actionTrack(selected)}</span></strong><span>{(selectedAudio?.start ?? selectedClip?.start) == null ? '开始时间待定' : `开始 ${timecode((selectedAudio?.start ?? selectedClip?.start)!, project.scene.fps)}`}</span><div className="tl-spacer"/>
        {selectedAudio ? <><button aria-label="在播放头处分割配音" disabled={!selectedAudio.editable || selectedAudio.start === null} onClick={() => mutate(() => { const result = splitAudioClip(project, selectedAudio, time); handleSelectIds([result.id]); return result.project; })}><Scissors size={14}/> 分割</button><button aria-label="配音静音" aria-pressed={selected.fields.muted === 'yes'} onClick={() => mutate(() => updateAction(project, selected.id, { muted: selected.fields.muted === 'yes' ? 'no' : 'yes' }))}>{selected.fields.muted === 'yes' ? <VolumeX size={14}/> : <Volume2 size={14}/>} 静音</button></> : <><button aria-label="片段前移" disabled={!selectedClip || selectedClip.index === 0} onClick={() => shiftOrder(-1)}><ArrowLeft size={14}/></button><button aria-label="片段后移" disabled={!selectedClip || selectedClip.index === clips.length - 1} onClick={() => shiftOrder(1)}><ArrowRight size={14}/></button><button title="与后一个片段同时执行" disabled={!selectedClip || selectedClip.index === clips.length - 1} onClick={() => mutate(() => checkedEdit(project, parallelWithNext(project, selected.id)))}><Layers3 size={14}/> 并行</button></>}
        <button onClick={() => onShowBlocks(selected.id)}>积木</button><button aria-label="删除所选片段" onClick={() => mutate(() => removeAction(project, selected.id))}><Trash2 size={14}/></button></div>
        <ActionInspector key={selected.id} action={selected} actions={project.actions} assets={project.assets} fields={managedObject(selected) ? ['appear', 'duration', 'mode'].filter(name => definition?.fields.some(f => f.name === name)) : undefined} onChange={fields => mutate(() => updateAction(project, selected.id, fields))} onError={onError}/>
        {definition?.container && <p className="tl-note">复合片段包含内部动作，双击打开积木。</p>}</> : <p className="tl-note">选择片段编辑参数。动画按顺序联动，可组合并行；配音独立放置和裁剪。按住 Shift / Cmd 多选或框选。</p>}
    </div>
  </section>;
}
