import React, { useState, useRef, useEffect } from 'react';
import {
  Wand2,
  Grid,
  Activity,
  TrendingUp,
  BarChart3,
  Compass,
  Globe,
  Orbit,
  Triangle,
  Box,
  Axis3d,
  Network,
  AreaChart,
  AlignJustify,
  Video,
  Captions,
  Film,
  Sliders,
  Radio,
  Palette,
} from 'lucide-react';
import './tools-hub.css';

interface ToolsHubDropdownProps {
  onOpenMatrix: () => void;
  onOpenFourier: () => void;
  onOpenCalculus: () => void;
  onOpenRiemann: () => void;
  onOpenVectorField: () => void;
  onOpenComplexMapping: () => void;
  onOpenPolarParametric: () => void;
  onOpenGeometry: () => void;
  onOpenVector3D?: () => void;
  onOpenSurface: () => void;
  onOpenGraph: () => void;
  onOpenProbability: () => void;
  onOpenAutoLayout: () => void;
  onOpenCameraDirector: () => void;
  onOpenSubtitleSync: () => void;
  onOpenStoryboard: () => void;
  onOpenEasingCurve: () => void;
  onOpenAudioVisualizer: () => void;
  onOpenTexColorStyler: () => void;
}

export const ToolsHubDropdown: React.FC<ToolsHubDropdownProps> = ({
  onOpenMatrix,
  onOpenFourier,
  onOpenCalculus,
  onOpenRiemann,
  onOpenVectorField,
  onOpenComplexMapping,
  onOpenPolarParametric,
  onOpenGeometry,
  onOpenVector3D,
  onOpenSurface,
  onOpenGraph,
  onOpenProbability,
  onOpenAutoLayout,
  onOpenCameraDirector,
  onOpenSubtitleSync,
  onOpenStoryboard,
  onOpenEasingCurve,
  onOpenAudioVisualizer,
  onOpenTexColorStyler,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (callback: () => void) => () => {
    callback();
    setIsOpen(false);
  };

  return (
    <div className="tools-hub-container" ref={containerRef}>
      <button
        type="button"
        className={`tools-hub-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title="打开 19 款 3B1B 数理动效工作台中心"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Wand2 size={15} />
        <span>数理动效工作台</span>
        <span className="tools-hub-badge">19</span>
      </button>

      {isOpen && (
        <div className="tools-mega-menu" role="menu">
          {/* Column 1: 高等数学与分析 */}
          <div className="tools-menu-col">
            <div className="tools-menu-col-header">
              <span>🧮 3B1B 高等数理</span>
              <span className="col-badge">7 款</span>
            </div>
            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenMatrix)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15' }}
              >
                <Grid size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">矩阵线性变换台</span>
                <span className="tools-item-subtitle">基向量拖拽 · 特征值与投影</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenFourier)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(20, 184, 166, 0.15)', color: '#2dd4bf' }}
              >
                <Activity size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">傅里叶环绕圆台</span>
                <span className="tools-item-subtitle">DFT 复傅里叶级数 · 谐波能谱</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenCalculus)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80' }}
              >
                <TrendingUp size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">微积分导数与切线</span>
                <span className="tools-item-subtitle">割线斜率 · Δx→0 极限逼近</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenRiemann)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}
              >
                <BarChart3 size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">黎曼和与定积分</span>
                <span className="tools-item-subtitle">左/右/梯形求和 · 面积积分</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenVectorField)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}
              >
                <Compass size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">2D 向量场与流线</span>
                <span className="tools-item-subtitle">旋度散度 · RK4 粒子流模拟</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenComplexMapping)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}
              >
                <Globe size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">复变共形映射台</span>
                <span className="tools-item-subtitle">网格保角形变 · 导数缩放旋转</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenPolarParametric)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185' }}
              >
                <Orbit size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">极坐标参数曲线</span>
                <span className="tools-item-subtitle">心脏线/玫瑰线 · 切线循迹描迹</span>
              </div>
            </button>
          </div>

          {/* Column 2: 几何拓扑与空间三维 */}
          <div className="tools-menu-col">
            <div className="tools-menu-col-header">
              <span>📐 几何拓扑与空间</span>
              <span className="col-badge">6 款</span>
            </div>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenGeometry)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8' }}
              >
                <Triangle size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">欧几里得几何与四心</span>
                <span className="tools-item-subtitle">欧拉线 (HG=2·GO) · 勾股弦图</span>
              </div>
            </button>

            {onOpenVector3D && (
              <button
                className="tools-menu-item"
                onClick={handleSelect(onOpenVector3D)}
                role="menuitem"
              >
                <div
                  className="tools-item-icon"
                  style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc' }}
                >
                  <Axis3d size={17} />
                </div>
                <div className="tools-item-content">
                  <span className="tools-item-title">三维向量与空间叉乘</span>
                  <span className="tools-item-subtitle">加法 · 点乘投影 · 叉乘张成面积</span>
                </div>
              </button>
            )}

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenSurface)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}
              >
                <Box size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">3D 参数曲面视角</span>
                <span className="tools-item-subtitle">马鞍面/环面 · 任意透视环绕</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenGraph)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(45, 212, 191, 0.15)', color: '#2dd4bf' }}
              >
                <Network size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">图论网络与拓扑</span>
                <span className="tools-item-subtitle">力导向弹簧 · Petersen 图 · BFS</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenProbability)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}
              >
                <AreaChart size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">概率分布与中心极限</span>
                <span className="tools-item-subtitle">高斯正态/二项逼近 · 经验法则</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenAutoLayout)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}
              >
                <AlignJustify size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">智能对齐与自动布局</span>
                <span className="tools-item-subtitle">水平/垂直/网格/环形 6大阵列</span>
              </div>
            </button>
          </div>

          {/* Column 3: 导演运镜与视听剪辑 */}
          <div className="tools-menu-col">
            <div className="tools-menu-col-header">
              <span>🎬 导演运镜与剪辑</span>
              <span className="col-badge">6 款</span>
            </div>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenCameraDirector)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#fb923c' }}
              >
                <Video size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">运镜导演与取景器</span>
                <span className="tools-item-subtitle">镜头平移缩放 · 三分法则构图</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenSubtitleSync)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80' }}
              >
                <Captions size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">字幕配音时序同步</span>
                <span className="tools-item-subtitle">SRT 导入导出 · 淡入淡出动画</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenStoryboard)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e' }}
              >
                <Film size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">分镜剧本与章节管理</span>
                <span className="tools-item-subtitle">长视频分段 · YouTube 时间戳</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenEasingCurve)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}
              >
                <Sliders size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">缓动曲线与关键帧</span>
                <span className="tools-item-subtitle">贝塞尔控制手柄 · 速度导数曲线</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenAudioVisualizer)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}
              >
                <Radio size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">音频响应式频谱</span>
                <span className="tools-item-subtitle">3B1B 声波柱 · 环形星云声场</span>
              </div>
            </button>

            <button
              className="tools-menu-item"
              onClick={handleSelect(onOpenTexColorStyler)}
              role="menuitem"
            >
              <div
                className="tools-item-icon"
                style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6' }}
              >
                <Palette size={17} />
              </div>
              <div className="tools-item-content">
                <span className="tools-item-title">公式专属配色器</span>
                <span className="tools-item-subtitle">LaTeX 符号分词 · 3B1B 专属设色</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
