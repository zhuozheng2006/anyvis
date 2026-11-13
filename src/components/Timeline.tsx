import { useRef, useState } from 'react';
import { Plus, Flag, Trash2, Clock3 } from 'lucide-react';
import type { AnimationClip, Project } from '../core/types';
interface Props {
    project: Project;
    time: number;
    onSeek: (t: number) => void;
    onChange: (p: Project) => void;
}
export default function Timeline({ project, time, onSeek, onChange }: Props) {
    const [selected, setSelected] = useState<string | null>(null);
    const laneRef = useRef<HTMLDivElement>(null);
    const clip = project.clips.find(c => c.id === selected);
    const cue = project.cues.find(c => c.id === selected);
    const patch = (p: Partial<AnimationClip>) => onChange({ ...project, clips: project.clips.map(c => c.id === selected ? { ...c, ...p } : c) });
    const seek = (e: React.PointerEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (!r.width || !Number.isFinite(project.duration)) return;
        onSeek(Math.max(0, Math.min(project.duration, (e.clientX - r.left) / r.width * project.duration)));
    };
    const move = (e: React.PointerEvent<HTMLElement>, c: AnimationClip, resize = false) => {
        e.stopPropagation();
        setSelected(c.id);
        const rectWidth = laneRef.current?.getBoundingClientRect().width;
        const width = rectWidth && rectWidth > 0 ? rectWidth : 500;
        const origin = e.clientX;
        const base = c.start;
        const duration = c.duration;
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        const handler = (event: PointerEvent) => {
            const delta = (event.clientX - origin) / width * project.duration;
            const change = resize ? { duration: Math.max(.1, Math.min(project.duration - c.start, Math.round((duration + delta) * 10) / 10)) } : { start: Math.max(0, Math.min(project.duration - c.duration, Math.round((base + delta) * 10) / 10)) };
            onChange({ ...project, clips: project.clips.map(x => x.id === c.id ? { ...x, ...change } : x) });
        };
        const stop = () => {
            target.removeEventListener('pointermove', handler);
            target.removeEventListener('pointerup', stop);
            target.removeEventListener('pointercancel', stop);
        };
        target.addEventListener('pointermove', handler);
        target.addEventListener('pointerup', stop);
        target.addEventListener('pointercancel', stop);
    };
    return <div className="timeline-editor">
  <div className="panel-toolbar"><span><Clock3 size={14}/> 轨道编排 <small>拖动片段 · 拖动右侧改变时长</small></span><div><button onClick={() => {
        const id = crypto.randomUUID();
        onChange({ ...project, cues: [...project.cues, { id, time: Math.min(time, project.duration - .01), title: '停下来，探索一下', description: '调整右侧参数，观察变化，然后继续播放。' }] });
        setSelected(id);
    }}><Flag size={13}/> 交互节点</button><label>总时长 <input aria-label="总时长" type="number" min="1" max="300" step="1" value={project.duration} onChange={e => {
        const duration = Number(e.target.value);
        if (Number.isFinite(duration) && duration >= 1 && duration <= 300)
            onChange({ ...project, duration, clips: project.clips.map(c => ({ ...c, start: Math.min(c.start, duration - .1), duration: Math.max(.1, Math.min(c.duration, duration - Math.min(c.start, duration - .1))) })), cues: project.cues.filter(c => c.time <= duration) });
    }}/> s</label></div></div>
  <div className="timeline-scroll">
   <div className="time-row"><div className="track-name">场景时间</div><div className="ruler" onPointerDown={seek} ref={laneRef}>{Array.from({ length: 7 }, (_, i) => <span key={i} style={{ left: `${i / 6 * 100}%` }}>{+(i / 6 * project.duration).toFixed(1)}s</span>)}<div className="playhead" style={{ left: `${time / project.duration * 100}%` }}/></div></div>
   <div className="time-row"><div className="track-name"><Flag size={12}/> 交互节点</div><div className="cue-lane" onPointerDown={seek}>{project.cues.map(c => <button className={`cue-dot ${selected === c.id ? 'selected' : ''}`} key={c.id} title={`${c.title} · ${c.time.toFixed(1)}s`} aria-label={c.title} style={{ left: `${c.time / project.duration * 100}%` }} onPointerDown={e => e.stopPropagation()} onClick={() => {
        setSelected(c.id);
        onSeek(c.time);
    }}><Flag size={13}/></button>)}<div className="playhead" style={{ left: `${time / project.duration * 100}%` }}/></div></div>
   {project.parameters.map(p => <div className="time-row" key={p.id}><div className="track-name"><i style={{ background: p.color }}/>{p.name}<button title={`添加 ${p.name} 动画`} onClick={() => {
        const id = crypto.randomUUID();
        const start = Math.max(0, Math.min(time, project.duration - .1));
        const duration = Math.max(.1, Math.min(2, project.duration - start));
        onChange({ ...project, clips: [...project.clips, { id, parameterId: p.id, start, duration, from: p.value, to: Math.min(p.max, p.value + 1), easing: 'smooth' }] });
        setSelected(id);
    }}><Plus size={13}/></button></div><div className="track-lane" onPointerDown={seek}>{project.clips.filter(c => c.parameterId === p.id).map(c => <button key={c.id} className={`timeline-clip ${selected === c.id ? 'selected' : ''}`} style={{ left: `${c.start / project.duration * 100}%`, width: `${c.duration / project.duration * 100}%`, '--clip-color': p.color } as React.CSSProperties} onPointerDown={e => move(e, c)} title={`${p.name}: ${c.from} → ${c.to}`}><span>{c.from} → {c.to}</span><span className="clip-grip" onPointerDown={e => move(e, c, true)}>⠿</span></button>)}<div className="playhead" style={{ left: `${time / project.duration * 100}%` }}/></div></div>)}
  </div>
  <div className="timeline-details">{clip ? <><span className="detail-title">片段属性</span>{(['start', 'duration', 'from', 'to'] as const).map((field, i) => <label key={field}>{['开始', '时长', '起值', '终值'][i]}<input aria-label={['片段开始', '片段时长', '片段起值', '片段终值'][i]} type="number" step="0.1" value={clip[field]} onChange={e => {
        const v = Number(e.target.value);
        if (!Number.isFinite(v))
            return;
        if (field === 'start')
            patch({ start: Math.max(0, Math.min(project.duration - clip.duration, v)) });
        else if (field === 'duration')
            patch({ duration: Math.max(.1, Math.min(project.duration - clip.start, v)) });
        else
            patch({ [field]: v });
    }}/></label>)}<select aria-label="缓动方式" value={clip.easing} onChange={e => patch({ easing: e.target.value as AnimationClip['easing'] })}><option value="linear">线性</option><option value="smooth">平滑</option></select><button className="icon-button" title="删除片段" onClick={() => {
        onChange({ ...project, clips: project.clips.filter(c => c.id !== selected) });
        setSelected(null);
    }}><Trash2 size={14}/></button></> : cue ? <><span className="detail-title">交互节点</span><input aria-label="节点标题" maxLength={120} value={cue.title} onChange={e => onChange({ ...project, cues: project.cues.map(c => c.id === cue.id ? { ...c, title: e.target.value } : c) })}/><label>时间<input aria-label="节点时间" type="number" step="0.1" min="0" max={project.duration} value={cue.time} onChange={e => { if (e.target.value.trim() === '') return; const nextTime = Number(e.target.value); if (!Number.isFinite(nextTime)) return; onChange({ ...project, cues: project.cues.map(c => c.id === cue.id ? { ...c, time: Math.min(project.duration, Math.max(0, nextTime)) } : c) }); }}/></label><button className="icon-button" title="删除节点" onClick={() => {
        onChange({ ...project, cues: project.cues.filter(c => c.id !== selected) });
        setSelected(null);
    }}><Trash2 size={14}/></button></> : <span className="muted">点击片段编辑属性，点击标尺跳转。紫色旗标会让播放暂停，留出自由探索的时间。</span>}</div>
 </div>;
}
