import type { BackgroundMusic, Project } from './core/types';
import { saveDefaultMusic } from './storage';

export function MusicSettings({ project, onChange, onError }: { project: Project; onChange(project: Project): void; onError(message: string): void }) {
  const music = project.scene.backgroundMusic || 'none', gain = project.scene.musicGainDb ?? -18;
  return <div className="settings-music">
    <label>默认配乐<select aria-label="默认配乐" value={music} onChange={event => {
      const backgroundMusic = event.target.value as BackgroundMusic;
      onChange({ ...project, scene: { ...project.scene, backgroundMusic } });
      try { saveDefaultMusic(backgroundMusic); } catch { onError('当前作品的配乐已修改，但未能保存新作品的默认偏好。'); }
    }}><option value="piano">自动钢琴 · 平静优雅</option><option value="none">无配乐 · 安静播放</option></select></label>
    {music === 'piano' && <label>配乐音量 <span>{gain} dB</span><input aria-label="配乐音量" type="range" min="-60" max="0" step="1" value={gain} onChange={event => onChange({ ...project, scene: { ...project.scene, musicGainDb: Number(event.target.value) } })}/></label>}
    <p>钢琴配乐自动铺满作品，首尾轻柔淡入淡出。选择也用于新作品；上传的讲解配音单独保留。</p>
  </div>;
}
