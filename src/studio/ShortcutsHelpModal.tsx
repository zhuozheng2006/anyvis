import React, { useEffect } from 'react';
import './shortcuts-help.css';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsHelpModal: React.FC<ShortcutsHelpModalProps> = ({
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="shortcuts-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="shortcuts-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <h3>⌨ 全局快捷键速查中心 (Keyboard Shortcuts)</h3>
          <button className="shortcuts-close-btn" onClick={onClose} title="关闭 (Esc)">
            ✕
          </button>
        </div>

        <div className="shortcuts-modal-body">
          {/* Group 1: 播放与时间控制 */}
          <div className="shortcuts-group">
            <div className="shortcuts-group-title">
              <span>🎬 播放与视口控制</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">播放 / 暂停视频预览</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">Space</kbd>
              </div>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">逐帧步退 / 步进</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">←</kbd>
                <kbd className="shortcut-kbd">→</kbd>
              </div>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">跳转至片头 / 片尾</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">Home</kbd>
                <kbd className="shortcut-kbd">End</kbd>
              </div>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">触发预览渲染</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">{cmdKey}</kbd>
                <span>+</span>
                <kbd className="shortcut-kbd">Enter</kbd>
              </div>
            </div>
          </div>

          {/* Group 2: 工作区视图切换 */}
          <div className="shortcuts-group">
            <div className="shortcuts-group-title">
              <span>🎛 视图与界面切换</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">切换到 积木编排 视图</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">1</kbd>
              </div>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">切换到 视频时间轴 视图</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">2</kbd>
              </div>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">切换到 Python 代码 视图</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">3</kbd>
              </div>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">唤起快捷键速查表</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">?</kbd>
                <span>或</span>
                <kbd className="shortcut-kbd">Shift + /</kbd>
              </div>
            </div>
          </div>

          {/* Group 3: 动作与片段编辑 */}
          <div className="shortcuts-group">
            <div className="shortcuts-group-title">
              <span>✂️ 剪辑与编排操作</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">添加时间轴标记 (Marker)</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">M</kbd>
              </div>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">一键克隆复制选中对象/动作</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">D</kbd>
              </div>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">删除选中的动作片段</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">Delete</kbd>
                <span>/</span>
                <kbd className="shortcut-kbd">Backspace</kbd>
              </div>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">临时开启时间轴吸附</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">Shift + 拖动</kbd>
              </div>
            </div>
          </div>

          {/* Group 4: 全局常用命令 */}
          <div className="shortcuts-group">
            <div className="shortcuts-group-title">
              <span>⚡️ 全局工程管理</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">全局模糊搜索命令面板</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">{cmdKey}</kbd>
                <span>+</span>
                <kbd className="shortcut-kbd">K</kbd>
              </div>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">导出保存项目文件</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">{cmdKey}</kbd>
                <span>+</span>
                <kbd className="shortcut-kbd">S</kbd>
              </div>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">撤销上一步操作 (Undo)</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">{cmdKey}</kbd>
                <span>+</span>
                <kbd className="shortcut-kbd">Z</kbd>
              </div>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-label">重做已撤销操作 (Redo)</span>
              <div className="shortcut-keys">
                <kbd className="shortcut-kbd">{cmdKey}</kbd>
                <span>+</span>
                <kbd className="shortcut-kbd">Shift</kbd>
                <span>+</span>
                <kbd className="shortcut-kbd">Z</kbd>
              </div>
            </div>
          </div>
        </div>

        <div className="shortcuts-modal-footer">
          <div className="shortcuts-footer-hint">
            💡 在输入文本或公式时，按键将作为文本输入，不会误触全局快捷键
          </div>
          <div>按 <kbd className="shortcut-kbd">Esc</kbd> 退出</div>
        </div>
      </div>
    </div>
  );
};
