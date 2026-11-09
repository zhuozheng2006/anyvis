import React, { useEffect, useRef, useState } from 'react';
import type { MediaAsset, Project } from './core/types';
import { uploadAsset } from './api';
import { createAction, getBlockDefinition } from './core/catalog';
import { appendAction, flattenActions } from './authoring';
import { validateProject } from './core/project';
import { checkedEdit } from './timeline-model';
import './media-assets.css';

export interface AssetShelfProps {
  project: Project;
  onProjectChange(project: Project): void;
  onSelectObject?(id: string): void;
  onError(message: string): void;
  onClose?(): void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AssetShelf: React.FC<AssetShelfProps> = ({
  project,
  onProjectChange,
  onSelectObject,
  onError,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'image' | 'audio'>('all');
  const [isUploading, setIsUploading] = useState(false);
  const uploadPending = useRef(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Track component mount status to avoid state updates on unmounted component
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Maintain fresh refs for asynchronous operations to avoid race conditions or overwriting concurrent edits
  const projectRef = useRef(project);
  projectRef.current = project;
  const onProjectChangeRef = useRef(onProjectChange);
  onProjectChangeRef.current = onProjectChange;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportError = (error: unknown) => {
    const message = error instanceof Error ? error.message : '素材操作失败';
    setUploadError(message);
    onErrorRef.current(message);
  };
  const commitProject = (next: Project) => {
    const validated = checkedEdit(projectRef.current, validateProject(next));
    onProjectChangeRef.current(validated);
    setUploadError(null);
  };
  const openFileChooser = () => { if (!uploadPending.current) fileInputRef.current?.click(); };

  const assets = project.assets || [];
  const imageAssets = assets.filter(a => a.kind === 'image');
  const audioAssets = assets.filter(a => a.kind === 'audio');

  const handleFileUpload = async (file: File) => {
    if (uploadPending.current) return;
    uploadPending.current = true;
    const targetProjectId = projectRef.current.id;
    setIsUploading(true);
    setUploadError(null);
    try {
      const uploadedAsset = await uploadAsset(file);

      // Guard: do not update if unmounted or if user switched projects during upload
      if (!isMountedRef.current) return;
      if (projectRef.current.id !== targetProjectId) return;

      // Merge into the latest project snapshot via ref
      const latestProject = projectRef.current;
      const currentAssets = latestProject.assets || [];
      const exists = currentAssets.some(a => a.id === uploadedAsset.id);
      const nextAssets = exists
        ? currentAssets.map(a => (a.id === uploadedAsset.id ? uploadedAsset : a))
        : [...currentAssets, uploadedAsset];

      let nextProject: Project = {
        ...latestProject,
        assets: nextAssets
      };

      if (uploadedAsset.kind === 'image') {
        // Automatically create image_asset action with unique name, asset ID, appear none
        const baseName = uploadedAsset.name.replace(/\.[^.]+$/, '').replace(/[\r\n\0,，]/g, ' ').replace(/^@+/, '').trim().slice(0, 80) || '图片';
        const { project: pWithImg, action } = appendAction(nextProject, 'image_asset', {
          name: baseName,
          asset: uploadedAsset.id,
          appear: 'none'
        });
        nextProject = { ...pWithImg, actions: [action, ...pWithImg.actions.filter(a => a.id !== action.id)] };
        commitProject(nextProject);
        if (onSelectObject) onSelectObject(action.id);
        if (onClose) onClose();
      } else {
        // Audio asset saved to project.assets; user can add to track via button
        commitProject(nextProject);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current || projectRef.current.id !== targetProjectId) return;
      reportError(err);
    } finally {
      uploadPending.current = false;
      if (isMountedRef.current) {
        setIsUploading(false);
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // reset input so the same file can be uploaded again if needed
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleUseImage = (asset: MediaAsset) => {
    try {
      const latestProject = projectRef.current;
      const baseName = asset.name.replace(/\.[^.]+$/, '').replace(/[\r\n\0,，]/g, ' ').replace(/^@+/, '').trim().slice(0, 80) || '图片';
      const { project: nextProject, action } = appendAction(latestProject, 'image_asset', {
        name: baseName,
        asset: asset.id,
        appear: 'none'
      });
      commitProject({ ...nextProject, actions: [action, ...nextProject.actions.filter(a => a.id !== action.id)] });
      if (onSelectObject) onSelectObject(action.id);
      if (onClose) onClose();
    } catch (error) { reportError(error); }
  };

  const handleAddAudioTrack = (asset: MediaAsset) => {
    try {
      const latestProject = projectRef.current;
      const baseName = asset.name.replace(/\.[^.]+$/, '').replace(/[\r\n\0,，]/g, ' ').replace(/^@+/, '').trim().slice(0, 80) || '配音';
      const existingNames = new Set(
        flattenActions(latestProject.actions)
          .filter(a => getBlockDefinition(a.type)?.createsObject)
          .map(a => String(a.fields.name))
      );
      let uniqueName = baseName;
      let suffix = 2;
      while (existingNames.has(uniqueName)) {
        uniqueName = `${baseName} ${suffix++}`;
      }

      const audioAction = createAction('audio_play', {
        name: uniqueName,
        asset: asset.id,
        delay: 0,
        offset: 0,
        length: 0,
        gain: 0
      });

      // Place at the beginning of actions with delay=0 for non-blocking playback
      const nextProject: Project = {
        ...latestProject,
        workspace: undefined,
        actions: [audioAction, ...latestProject.actions]
      };
      commitProject(nextProject);
    } catch (error) { reportError(error); }
  };

  return (
    <div className="om-asset-shelf" role="region" aria-label="项目素材库">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".svg,.png,.jpg,.jpeg,.webp,.mp3,.wav,.ogg,.m4a,.flac"
        onChange={handleFileInputChange}
        data-testid="om-asset-file-input"
      />

      {/* Toolbar */}
      <div className="om-asset-toolbar">
        <div className="om-asset-tabs">
          <button
            type="button"
            className={`om-asset-tab-btn ${activeTab === 'all' ? 'om-asset-tab-btn-active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            全部 ({assets.length})
          </button>
          <button
            type="button"
            className={`om-asset-tab-btn ${activeTab === 'image' ? 'om-asset-tab-btn-active' : ''}`}
            onClick={() => setActiveTab('image')}
          >
            图片 ({imageAssets.length})
          </button>
          <button
            type="button"
            className={`om-asset-tab-btn ${activeTab === 'audio' ? 'om-asset-tab-btn-active' : ''}`}
            onClick={() => setActiveTab('audio')}
          >
            配音 ({audioAssets.length})
          </button>
        </div>

        <div className="om-asset-actions">
          <button
            type="button"
            className="om-asset-upload-btn"
            onClick={openFileChooser}
            disabled={isUploading}
            aria-label="上传新素材"
          >
            {isUploading ? '正在上传...' : '+ 上传素材'}
          </button>
        </div>
      </div>

      {/* Error message banner */}
      {uploadError && (
        <div className="om-asset-error-banner" role="alert">
          <span>{uploadError}</span>
          <button
            type="button"
            className="om-asset-error-dismiss"
            onClick={() => setUploadError(null)}
            aria-label="关闭错误提示"
          >
            ✕
          </button>
        </div>
      )}

      {/* Dropzone */}
      <div
        className={`om-asset-dropzone ${isDragOver ? 'om-asset-dropzone-active' : ''}`}
        onDragOver={e => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={openFileChooser}
        role="button"
        aria-disabled={isUploading}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFileChooser(); }
        }}
        tabIndex={0}
        aria-label="拖拽文件到此处或点击上传"
      >
        <div className="om-asset-dropzone-icon">📁</div>
        <div className="om-asset-dropzone-text">点击或拖拽图片 (PNG/SVG/JPG) 或配音 (MP3/WAV) 到此处上传</div>
        <div className="om-asset-dropzone-sub">单文件最大 64MB · 上传图片自动作为对象创建</div>
      </div>

      {/* Content area */}
      <div className="om-asset-scroll-content">
        {(activeTab === 'all' || activeTab === 'image') && imageAssets.length > 0 && (
          <div className="om-asset-section">
            <h5 className="om-asset-section-title">🖼 图片素材 ({imageAssets.length})</h5>
            <div className="om-asset-grid">
              {imageAssets.map(img => (
                <div key={img.id} className="om-asset-card" data-testid={`asset-card-${img.id}`}>
                  <div className="om-asset-preview-box">
                    <img
                      src={`/api/assets/${encodeURIComponent(img.id)}/file`}
                      alt={img.name}
                      className="om-asset-img"
                    />
                  </div>
                  <div className="om-asset-meta">
                    <span className="om-asset-name" title={img.name}>
                      {img.name}
                    </span>
                    <span className="om-asset-detail">
                      <span>{img.extension.toUpperCase()}</span>
                      <span>{formatBytes(img.bytes)}</span>
                    </span>
                  </div>
                  <div className="om-asset-footer">
                    <button
                      type="button"
                      className="om-asset-btn-primary"
                      onClick={() => handleUseImage(img)}
                      aria-label={`添加图片 ${img.name} 为新对象`}
                    >
                      + 作为新对象添加
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(activeTab === 'all' || activeTab === 'audio') && audioAssets.length > 0 && (
          <div className="om-asset-section">
            <h5 className="om-asset-section-title">🎵 配音与音频素材 ({audioAssets.length})</h5>
            <div className="om-asset-audio-list">
              {audioAssets.map(aud => (
                <div key={aud.id} className="om-asset-audio-item" data-testid={`asset-audio-${aud.id}`}>
                  <div className="om-asset-audio-info">
                    <span className="om-asset-name" title={aud.name}>
                      {aud.name}
                    </span>
                    <span className="om-asset-detail">
                      <span>{aud.duration !== undefined ? `${aud.duration.toFixed(1)}s` : aud.extension.toUpperCase()}</span>
                      <span>{formatBytes(aud.bytes)}</span>
                    </span>
                  </div>
                  <div className="om-asset-audio-controls">
                    <audio
                      controls
                      src={`/api/assets/${encodeURIComponent(aud.id)}/file`}
                      preload="metadata"
                      className="om-asset-audio-player"
                      aria-label={`试听 ${aud.name}`}
                    />
                  </div>
                  <button
                    type="button"
                    className="om-asset-btn-track"
                    onClick={() => handleAddAudioTrack(aud)}
                    aria-label={`将配音 ${aud.name} 加入音轨`}
                  >
                    + 加入音轨
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {assets.length === 0 && (
          <div className="om-asset-empty">
            暂无已上传的素材。点击上方上传按钮或将文件拖拽入库。
          </div>
        )}
      </div>
    </div>
  );
};
