import type { Project } from './core/types';
import { compileProject } from './core/compiler';
import { templateCatalog } from './templates';
import { renderScene } from './render-revision';

export interface VideoPreview {
  url: string; poster?: string; revision: string;
  quality: 'preview' | 'final'; builtin?: boolean; format: 'webm' | 'mp4';
}
const references = templateCatalog.map(template => ({
  template, code: compileProject(template.project).code,
  scene: JSON.stringify(renderScene(template.project.scene)),
}));
/** Only an unchanged, checked template can use its bundled native render. */
export function builtinPreview(project: Project, revision: string): VideoPreview | null {
  const compiled = compileProject(project);
  if (compiled.diagnostics.some(d => d.severity === 'error') || compiled.requiresTrust) return null;
  const scene = JSON.stringify(renderScene(project.scene));
  const match = references.find(reference => reference.code === compiled.code && reference.scene === scene);
  if (!match) return null;
  return { url: match.template.previewUrl, poster: match.template.posterUrl, revision, quality: 'preview', builtin: true, format: 'webm' };
}
