import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronDown, Check } from 'lucide-react';
import './rate-func-picker.css';

export interface RateFuncOption {
  id: string;
  label: string;
  description: string;
  fn(t: number): number;
}

export const RATE_FUNCS: RateFuncOption[] = [
  {
    id: 'smooth',
    label: '平滑 (smooth)',
    description: 'Manim 默认 S 型平滑加减速',
    fn: t => (t <= 0 ? 0 : t >= 1 ? 1 : 3 * t * t - 2 * t * t * t),
  },
  {
    id: 'linear',
    label: '匀速 (linear)',
    description: '匀速恒定速度无缓动',
    fn: t => Math.max(0, Math.min(1, t)),
  },
  {
    id: 'rush_into',
    label: '慢入 (rush_into)',
    description: '起步缓慢，逐渐加速至终点',
    fn: t => Math.max(0, Math.min(1, t * t)),
  },
  {
    id: 'rush_from',
    label: '慢出 (rush_from)',
    description: '起步快速，接近终点时柔和减速',
    fn: t => {
      const p = 1 - t;
      return Math.max(0, Math.min(1, 1 - p * p));
    },
  },
  {
    id: 'slow_into',
    label: '缓入缓出 (slow_into)',
    description: '起步与结束温和过渡',
    fn: t => {
      const p = 1 - t;
      return Math.max(0, Math.min(1, 1 - p * p * p));
    },
  },
  {
    id: 'double_smooth',
    label: '陡峭平滑 (double_smooth)',
    description: '更激进的 S 曲线，中间速度更快',
    fn: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  },
  {
    id: 'there_and_back',
    label: '往返 (there_and_back)',
    description: '前进至目标后原路返回起点',
    fn: t => {
      const p = t <= 0.5 ? 2 * t : 2 * (1 - t);
      return 3 * p * p - 2 * p * p * p;
    },
  },
  {
    id: 'wiggle',
    label: '震荡 (wiggle)',
    description: '终点前后微幅弹性摆动',
    fn: t => (t >= 1 ? 1 : t + Math.sin(t * Math.PI * 4) * Math.exp(-4 * t) * 0.25),
  },
  {
    id: 'lingering',
    label: '驻留 (lingering)',
    description: '快速完成位移并在尾部保持静止',
    fn: t => (t < 0.75 ? (4 / 3) * t : 1),
  },
  {
    id: 'exponential_decay',
    label: '指数衰减 (exponential_decay)',
    description: '瞬间起步并以指数曲线渐近停稳',
    fn: t => 1 - Math.exp(-5 * Math.max(0, Math.min(1, t))),
  },
];

interface Props {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}

export function generateSvgPath(fn: (t: number) => number, width = 64, height = 36, padding = 4): string {
  const steps = 30;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const yVal = fn(t);
    const x = padding + t * innerW;
    const y = padding + (1 - yVal) * innerH;
    points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return points.join(' ');
}

export const RateFuncPicker: React.FC<Props> = ({ value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const [hoveredProgress, setHoveredProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);

  const normalized = value || 'smooth';
  const current = useMemo(
    () => RATE_FUNCS.find(f => f.id === normalized || (f.id === 'rush_into' && normalized === 'ease_in_sine') || (f.id === 'rush_from' && normalized === 'ease_out_sine')) || RATE_FUNCS[0],
    [normalized]
  );

  useEffect(() => {
    let start = performance.now();
    const loop = (now: number) => {
      const elapsed = (now - start) % 1800;
      setHoveredProgress(elapsed / 1800);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const currentPath = useMemo(() => generateSvgPath(current.fn, 56, 32, 4), [current]);
  const progressVal = current.fn(hoveredProgress);
  const dotX = 4 + hoveredProgress * 48;
  const dotY = 4 + (1 - Math.max(0, Math.min(1.2, progressVal))) * 24;

  return (
    <div className="rfp-root" ref={containerRef}>
      <button
        type="button"
        className="rfp-trigger"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        aria-label={`节奏曲线：${current.label}`}
        title={`${current.label} · ${current.description}`}
      >
        <svg className="rfp-mini-graph" width="56" height="32" viewBox="0 0 56 32">
          <line x1="4" y1="28" x2="52" y2="28" stroke="#374558" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="4" y1="4" x2="52" y2="4" stroke="#374558" strokeWidth="1" strokeDasharray="2 2" />
          <path d={currentPath} fill="none" stroke="#58C4DD" strokeWidth="2" strokeLinecap="round" />
          <circle cx={dotX} cy={dotY} r="3" fill="#F2CB80" />
        </svg>
        <span className="rfp-trigger-label">{current.label.split(' ')[0]}</span>
        <ChevronDown size={13} className={`rfp-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="rfp-dropdown" role="listbox" aria-label="选择缓动曲线">
          <div className="rfp-dropdown-header">
            <Activity size={14} />
            <span>Manim 缓动曲线与动画节奏</span>
          </div>
          <div className="rfp-grid">
            {RATE_FUNCS.map(item => {
              const isSelected = item.id === current.id;
              const path = generateSvgPath(item.fn, 68, 38, 4);
              const pVal = item.fn(hoveredProgress);
              const pX = 4 + hoveredProgress * 60;
              const pY = 4 + (1 - Math.max(0, Math.min(1.2, pVal))) * 30;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`rfp-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  title={item.description}
                >
                  <svg className="rfp-card-graph" width="68" height="38" viewBox="0 0 68 38">
                    <line x1="4" y1="34" x2="64" y2="34" stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />
                    <line x1="4" y1="4" x2="64" y2="4" stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />
                    <path
                      d={path}
                      fill="none"
                      stroke={isSelected ? '#64D9C1' : '#94A3B8'}
                      strokeWidth={isSelected ? '2.5' : '1.8'}
                      strokeLinecap="round"
                    />
                    <circle cx={pX} cy={pY} r="2.8" fill={isSelected ? '#F2CB80' : '#E2E8F0'} />
                  </svg>
                  <div className="rfp-card-info">
                    <span className="rfp-card-title">
                      {item.label}
                      {isSelected && <Check size={12} className="rfp-check" />}
                    </span>
                    <small className="rfp-card-desc">{item.description}</small>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
