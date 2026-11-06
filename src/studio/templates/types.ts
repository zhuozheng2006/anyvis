import type { Project } from '../core/types.ts';

export interface StudioTemplate {
  id: string;
  title: string;
  description: string;
  category: '入门' | '数学' | '算法' | '三维';
  duration: number;
  color: string;
  icon: string;
  /** These are lightweight explanatory diagrams, not rendered video frames. */
  thumbnail: string;
  thumbnailKind: 'illustration';
  previewUrl: string;
  posterUrl: string;
  previewKind: 'prerendered-native-manim';
  previewEngine: 'Manim Community 0.20.1';
  project: Project;
}
