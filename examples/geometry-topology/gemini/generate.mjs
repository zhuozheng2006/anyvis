import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAction } from '../../../src/studio/core/catalog.ts';
import { validateProject, createEmptyProject } from '../../../src/studio/core/project.ts';
import { compileProject } from '../../../src/studio/core/compiler.ts';
import { exportStandalonePython } from '../../../src/studio/core/export.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Preserve stable project ID for regression and comparative evaluation
export const PROJECT_ID = '29d56efc-3e40-4dbb-b138-bed1b24041bf';

export function buildChapter01Project() {
  const project = createEmptyProject();
  project.id = PROJECT_ID;
  project.name = '第一章：圆、椭圆、方形在什么意义下是同一种形状？';
  project.scene = {
    dimension: '2d',
    background: '#0A1128',
    width: 1280,
    height: 720,
    fps: 24,
  };

  // Helper to create actions
  const a = (type, overrides = {}) => createAction(type, overrides);
  const par = (...children) => ({ ...a('parallel'), children });

  // Palette constants (深蓝背景、青绿/金/紫配色)
  const TEAL = '#2DD4BF';
  const GOLD = '#FBBF24';
  const PURPLE = '#A855F7';
  const RED = '#F43F5E';
  const WHITE = '#F8FAFC';
  const BLUE_TEXT = '#38BDF8';
  const SUB_FONT_SIZE = 32;
  const BANNER_FONT_SIZE = 26;
  const SUB_MAX_WIDTH = 12.4;

  const actions = [];

  // =============================================================
  // SHOT 1: 提问与直觉冲突 (Target: 25.0s)
  // =============================================================
  const shot1 = a('sequence');
  shot1.children = [
    // Banner (1.0s)
    a('text', { name: 's01_banner', text: '第一章 · 形状的本质', fontSize: BANNER_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: BLUE_TEXT, x: 0, y: 3.2, appear: 'fade', duration: 1.0 }),

    // Subtitle 1 (1.5s write + 8.5s visual & think + 1.0s fade = 11.0s)
    a('text', { name: 's01_sub1', text: '在欧几里得几何直觉中，\n圆、椭圆与方形显然截然不同。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: WHITE, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    // Shapes enter in parallel (1.5s)
    par(
      a('circle', { name: 's01_circle', radius: 1.2, color: TEAL, fill: 0.15, x: -4.2, y: 0.3, appear: 'create', duration: 1.5 }),
      a('ellipse', { name: 's01_ellipse', width: 2.8, height: 1.6, color: GOLD, fill: 0.15, x: 0, y: 0.3, appear: 'create', duration: 1.5 }),
      a('square', { name: 's01_square', side: 2.2, color: PURPLE, fill: 0.15, x: 4.2, y: 0.3, appear: 'create', duration: 1.5 }),
    ),
    // Labels enter in parallel (1.0s)
    par(
      a('text', { name: 's01_lbl_c', text: '圆 (Circle)', fontSize: 24, maxWidth: 4.0, color: TEAL, x: -4.2, y: -1.4, appear: 'fade', duration: 1.0 }),
      a('text', { name: 's01_lbl_e', text: '椭圆 (Ellipse)', fontSize: 24, maxWidth: 4.0, color: GOLD, x: 0, y: -1.4, appear: 'fade', duration: 1.0 }),
      a('text', { name: 's01_lbl_s', text: '正方形 (Square)', fontSize: 24, maxWidth: 4.0, color: PURPLE, x: 4.2, y: -1.4, appear: 'fade', duration: 1.0 }),
    ),
    // Thinking pause (6.0s)
    a('wait', { duration: 6.0 }),
    a('fade_out', { target: 's01_sub1', duration: 1.0 }),

    // Subtitle 2 (1.5s write + 9.5s visual & think + 1.0s fade + 1.0s cleanup = 13.0s)
    a('text', { name: 's01_sub2', text: '但现代拓扑学却给出惊人结论：\n它们在本质上是同一种形状！', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: GOLD, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    // Visual actions: highlights (3.0s)
    a('indicate', { target: 's01_circle', duration: 1.0 }),
    a('indicate', { target: 's01_ellipse', duration: 1.0 }),
    a('indicate', { target: 's01_square', duration: 1.0 }),
    // Thinking pause (6.5s)
    a('wait', { duration: 6.5 }),
    a('fade_out', { target: 's01_sub2', duration: 1.0 }),
    // Parallel Cleanup (1.0s)
    par(
      a('fade_out', { target: 's01_banner', duration: 1.0 }),
      a('fade_out', { target: 's01_circle', duration: 1.0 }),
      a('fade_out', { target: 's01_ellipse', duration: 1.0 }),
      a('fade_out', { target: 's01_square', duration: 1.0 }),
      a('fade_out', { target: 's01_lbl_c', duration: 1.0 }),
      a('fade_out', { target: 's01_lbl_e', duration: 1.0 }),
      a('fade_out', { target: 's01_lbl_s', duration: 1.0 }),
    ),
  ];
  actions.push(shot1);

  // =============================================================
  // SHOT 2: 观察形变——橡皮泥模型与连续形变 (Target: 25.0s)
  // =============================================================
  const shot2 = a('sequence');
  shot2.children = [
    a('text', { name: 's02_banner', text: '拓扑直觉 · 橡皮薄膜几何', fontSize: BANNER_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: BLUE_TEXT, x: 0, y: 3.2, appear: 'fade', duration: 1.0 }),

    // Subtitle 1 (1.5s + 8.5s + 1.0s = 11.0s)
    a('text', { name: 's02_sub1', text: '设想这个圆环是由\n极具柔韧弹性的橡皮筋做成的。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: WHITE, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    a('circle', { name: 's02_main', radius: 1.8, color: TEAL, fill: 0.15, x: 0, y: 0.3, appear: 'create', duration: 1.5 }),
    a('scale', { target: 's02_main', factor: 1.15, duration: 1.5 }),
    a('scale', { target: 's02_main', factor: 0.8696, duration: 1.5 }),
    a('wait', { duration: 4.0 }),
    a('fade_out', { target: 's02_sub1', duration: 1.0 }),

    // Subtitle 2 (1.5s + 9.5s + 1.0s + 1.0s = 13.0s)
    // Mathematical fix: "连续形变" instead of "平滑拉伸" to avoid confusing with smooth/diffeomorphism
    a('text', { name: 's02_sub2', text: '只要不剪断、不粘合，经过连续形变，\n圆便可变为椭圆甚至方形。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: GOLD, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    a('ellipse', { name: 's02_target_ellipse', width: 4.0, height: 2.0, color: GOLD, fill: 0.15, x: 0, y: 0.3, appear: 'hidden', duration: 0.1 }),
    a('transform', { target: 's02_main', destination: 's02_target_ellipse', duration: 2.0 }),
    a('square', { name: 's02_target_square', side: 3.0, color: PURPLE, fill: 0.15, x: 0, y: 0.3, appear: 'hidden', duration: 0.1 }),
    a('transform', { target: 's02_main', destination: 's02_target_square', duration: 2.0 }),
    a('passing_flash', { target: 's02_main', color: GOLD, timeWidth: 0.25, duration: 1.5 }),
    a('wait', { duration: 4.0 }),
    a('fade_out', { target: 's02_sub2', duration: 1.0 }),
    par(
      a('fade_out', { target: 's02_banner', duration: 1.0 }),
      a('fade_out', { target: 's02_main', duration: 1.0 }),
    ),
  ];
  actions.push(shot2);

  // =============================================================
  // SHOT 3: 几何度量的破产——刚性度量失效 (Target: 25.0s)
  // =============================================================
  const shot3 = a('sequence');
  shot3.children = [
    a('text', { name: 's03_banner', text: '几何度量的局限 · 距离与曲率失效', fontSize: BANNER_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: BLUE_TEXT, x: 0, y: 3.2, appear: 'fade', duration: 1.0 }),

    // Subtitle 1 (1.5s + 8.5s + 1.0s = 11.0s)
    a('text', { name: 's03_sub1', text: '在欧氏几何中：圆具有恒定曲率与恒定半径，\n而方形拥有四个尖锐直角。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: WHITE, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    par(
      a('circle', { name: 's03_circle', radius: 1.5, color: TEAL, fill: 0.15, x: -3.5, y: 0.3, appear: 'create', duration: 1.5 }),
      a('square', { name: 's03_square', side: 3.0, color: PURPLE, fill: 0.15, x: 3.5, y: 0.3, appear: 'create', duration: 1.5 }),
    ),
    par(
      a('arrow', { name: 's03_radius_arrow', x1: -3.5, y1: 0.3, x2: -2.0, y2: 0.3, color: GOLD, appear: 'create', duration: 1.0 }),
      a('text', { name: 's03_radius_lbl', text: '半径 R 恒定', fontSize: 22, maxWidth: 3.0, color: GOLD, x: -2.7, y: 0.7, appear: 'write', duration: 1.0 }),
      a('dot', { name: 's03_corner_dot', radius: 0.14, color: RED, fill: 1, x: 5.0, y: 1.8, appear: 'fade', duration: 1.0 }),
      a('text', { name: 's03_corner_lbl', text: '90° 尖锐直角', fontSize: 22, maxWidth: 3.0, color: PURPLE, x: 3.5, y: -1.6, appear: 'write', duration: 1.0 }),
    ),
    a('wait', { duration: 6.0 }),
    a('fade_out', { target: 's03_sub1', duration: 1.0 }),

    // Subtitle 2 (1.5s + 9.5s + 1.0s + 1.0s = 13.0s)
    a('text', { name: 's03_sub2', text: '距离、角度与曲率——\n这些传统度量在柔性形变中荡然无存。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: RED, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    par(
      a('fade_out', { target: 's03_radius_arrow', duration: 0.8 }),
      a('fade_out', { target: 's03_radius_lbl', duration: 0.8 }),
      a('fade_out', { target: 's03_corner_dot', duration: 0.8 }),
      a('fade_out', { target: 's03_corner_lbl', duration: 0.8 }),
    ),
    a('formula', { name: 's03_metric_tex', tex: '\\text{Distances } d(x,y) \\text{ are NOT Preserved}', fontSize: 30, color: RED, x: 0, y: 0.3, appear: 'write', duration: 1.7 }),
    a('indicate', { target: 's03_metric_tex', duration: 1.5 }),
    a('wait', { duration: 5.5 }),
    a('fade_out', { target: 's03_sub2', duration: 1.0 }),
    par(
      a('fade_out', { target: 's03_banner', duration: 1.0 }),
      a('fade_out', { target: 's03_circle', duration: 1.0 }),
      a('fade_out', { target: 's03_square', duration: 1.0 }),
      a('fade_out', { target: 's03_metric_tex', duration: 1.0 }),
    ),
  ];
  actions.push(shot3);

  // =============================================================
  // SHOT 4: 拓扑学的新标尺——寻找不变的本质 (Target: 25.0s)
  // =============================================================
  const shot4 = a('sequence');
  shot4.children = [
    a('text', { name: 's04_banner', text: '拓扑学的视角 · 点的邻域与连通性', fontSize: BANNER_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: BLUE_TEXT, x: 0, y: 3.2, appear: 'fade', duration: 1.0 }),

    // Subtitle 1 (1.5s + 8.5s + 1.0s = 11.0s)
    a('text', { name: 's04_sub1', text: '如果丢弃了度量标尺，\n几何中究竟还有什么是真正不变的？', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: WHITE, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    a('circle', { name: 's04_curve', radius: 1.8, color: TEAL, fill: 0.1, x: 0, y: 0.3, appear: 'create', duration: 1.5 }),
    par(
      a('dot', { name: 's04_dot1', radius: 0.12, color: GOLD, fill: 1, x: -0.25, y: 2.1, appear: 'fade', duration: 0.8 }),
      a('dot', { name: 's04_dot2', radius: 0.12, color: GOLD, fill: 1, x: 0.25, y: 2.1, appear: 'fade', duration: 0.8 }),
      a('circle', { name: 's04_neigh', radius: 0.55, color: PURPLE, fill: 0.25, x: 0, y: 2.1, appear: 'create', duration: 1.0 }),
      a('formula', { name: 's04_lbl_u', tex: 'U(p)', fontSize: 28, color: PURPLE, x: 0, y: 2.9, appear: 'write', duration: 1.0 }),
    ),
    a('wait', { duration: 6.0 }),
    a('fade_out', { target: 's04_sub1', duration: 1.0 }),

    // Subtitle 2 (1.5s + 9.5s + 1.0s + 1.0s = 13.0s)
    a('text', { name: 's04_sub2', text: '拓扑学只关注最纯粹的关系：\n点与点之间的邻近与连通结构。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: TEAL, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    a('wave', { target: 's04_curve', amplitude: 0.25, ripples: 2, direction: 'UP', duration: 2.0 }),
    a('rotate', { target: 's04_curve', angle: 90, axis: 'OUT', duration: 1.5 }),
    a('circumscribe', { target: 's04_neigh', duration: 1.5 }),
    a('wait', { duration: 4.5 }),
    a('fade_out', { target: 's04_sub2', duration: 1.0 }),
    par(
      a('fade_out', { target: 's04_banner', duration: 1.0 }),
      a('fade_out', { target: 's04_curve', duration: 1.0 }),
      a('fade_out', { target: 's04_neigh', duration: 1.0 }),
      a('fade_out', { target: 's04_dot1', duration: 1.0 }),
      a('fade_out', { target: 's04_dot2', duration: 1.0 }),
      a('fade_out', { target: 's04_lbl_u', duration: 1.0 }),
    ),
  ];
  actions.push(shot4);

  // =============================================================
  // SHOT 5: 严格条件一：连续映射 (Continuity) (Target: 25.0s)
  // =============================================================
  const shot5 = a('sequence');
  shot5.children = [
    a('text', { name: 's05_banner', text: '核心准则一 · 映射的连续性 (Continuity)', fontSize: BANNER_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: BLUE_TEXT, x: 0, y: 3.2, appear: 'fade', duration: 1.0 }),

    // Subtitle 1 (1.5s + 8.5s + 1.0s = 11.0s)
    a('text', { name: 's05_sub1', text: '第一个严格数学要求：\n两形状之间的对应映射必须是‘连续’的。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: WHITE, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    par(
      a('circle', { name: 's05_circ', radius: 1.4, color: TEAL, fill: 0.15, x: -3.6, y: 0.3, appear: 'create', duration: 1.5 }),
      a('square', { name: 's05_sq', side: 2.5, color: PURPLE, fill: 0.15, x: 3.6, y: 0.3, appear: 'create', duration: 1.5 }),
      a('arrow', { name: 's05_map_arrow', x1: -1.6, y1: 0.3, x2: 1.6, y2: 0.3, color: GOLD, appear: 'create', duration: 1.2 }),
      a('formula', { name: 's05_tex_f', tex: 'f: X \\to Y', fontSize: 34, color: GOLD, x: 0, y: 0.9, appear: 'write', duration: 1.2 }),
    ),
    a('wait', { duration: 7.0 }),
    a('fade_out', { target: 's05_sub1', duration: 1.0 }),

    // Subtitle 2 (1.5s + 9.5s + 1.0s + 1.0s = 13.0s)
    a('text', { name: 's05_sub2', text: '原空间中无限贴近的点，经映射后依然保持紧邻，\n中途绝无断开。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: GOLD, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    par(
      a('dot', { name: 's05_p1', radius: 0.11, color: GOLD, fill: 1, x: -3.75, y: 1.7, appear: 'fade', duration: 0.8 }),
      a('dot', { name: 's05_p2', radius: 0.11, color: GOLD, fill: 1, x: -3.45, y: 1.7, appear: 'fade', duration: 0.8 }),
      a('dot', { name: 's05_fp1', radius: 0.11, color: GOLD, fill: 1, x: 3.45, y: 1.55, appear: 'fade', duration: 0.8 }),
      a('dot', { name: 's05_fp2', radius: 0.11, color: GOLD, fill: 1, x: 3.75, y: 1.55, appear: 'fade', duration: 0.8 }),
    ),
    a('passing_flash', { target: 's05_circ', color: TEAL, timeWidth: 0.3, duration: 1.5 }),
    a('passing_flash', { target: 's05_sq', color: PURPLE, timeWidth: 0.3, duration: 1.5 }),
    a('wait', { duration: 5.7 }),
    a('fade_out', { target: 's05_sub2', duration: 1.0 }),
    par(
      a('fade_out', { target: 's05_banner', duration: 1.0 }),
      a('fade_out', { target: 's05_circ', duration: 1.0 }),
      a('fade_out', { target: 's05_sq', duration: 1.0 }),
      a('fade_out', { target: 's05_map_arrow', duration: 1.0 }),
      a('fade_out', { target: 's05_tex_f', duration: 1.0 }),
      a('fade_out', { target: 's05_p1', duration: 1.0 }),
      a('fade_out', { target: 's05_p2', duration: 1.0 }),
      a('fade_out', { target: 's05_fp1', duration: 1.0 }),
      a('fade_out', { target: 's05_fp2', duration: 1.0 }),
    ),
  ];
  actions.push(shot5);

  // =============================================================
  // SHOT 6: 反例辨析：撕裂为何被禁止？ (Target: 25.0s)
  // =============================================================
  const shot6 = a('sequence');
  shot6.children = [
    a('text', { name: 's06_banner', text: '拓扑反例 · 撕裂破坏了连续性', fontSize: BANNER_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: RED, x: 0, y: 3.2, appear: 'fade', duration: 1.0 }),

    // Subtitle 1 (1.5s + 8.5s + 1.0s = 11.0s)
    // Mathematical fix: "切断并把切口两侧分开" to avoid mixing open and closed intervals
    a('text', { name: 's06_sub1', text: '切断并把切口两侧分开，\n原本紧邻的两点被强行分离。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: WHITE, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    par(
      a('arc', { name: 's06_cut_arc', radius: 1.5, start: 20, angle: 320, color: TEAL, fill: 0, x: -3.2, y: 0.3, appear: 'create', duration: 1.5 }),
      a('dot', { name: 's06_cp1', radius: 0.13, color: RED, fill: 1, x: -1.75, y: 0.8, appear: 'fade', duration: 1.0 }),
      a('dot', { name: 's06_cp2', radius: 0.13, color: RED, fill: 1, x: -1.75, y: -0.2, appear: 'fade', duration: 1.0 }),
      a('line', { name: 's06_straight_line', x1: 1.0, y1: 0.3, x2: 5.4, y2: 0.3, color: PURPLE, appear: 'create', duration: 1.5 }),
      a('dot', { name: 's06_lp1', radius: 0.13, color: RED, fill: 1, x: 1.0, y: 0.3, appear: 'fade', duration: 1.0 }),
      a('dot', { name: 's06_lp2', radius: 0.13, color: RED, fill: 1, x: 5.4, y: 0.3, appear: 'fade', duration: 1.0 }),
    ),
    a('wait', { duration: 7.0 }),
    a('fade_out', { target: 's06_sub1', duration: 1.0 }),

    // Subtitle 2 (1.5s + 9.5s + 1.0s + 1.0s = 13.0s)
    a('text', { name: 's06_sub2', text: '撕裂导致邻近关系破坏——\n线段与圆环在拓扑上绝不相同！', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: RED, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    par(
      a('dashed_line', { name: 's06_gap_line', x1: 1.0, y1: 0.9, x2: 5.4, y2: 0.9, dashLength: 0.18, dashRatio: 0.6, color: RED, appear: 'create', duration: 1.2 }),
      // Normal text explicitly stating "不同胚", avoiding TeX cancel package dependency
      a('text', { name: 's06_not_homeo', text: '圆周 S¹ 与线段不同胚', fontSize: 28, maxWidth: SUB_MAX_WIDTH, color: RED, x: -0.8, y: 1.9, appear: 'write', duration: 1.5 }),
    ),
    a('circumscribe', { target: 's06_not_homeo', duration: 1.5 }),
    a('wait', { duration: 6.5 }),
    a('fade_out', { target: 's06_sub2', duration: 1.0 }),
    par(
      a('fade_out', { target: 's06_banner', duration: 1.0 }),
      a('fade_out', { target: 's06_cut_arc', duration: 1.0 }),
      a('fade_out', { target: 's06_straight_line', duration: 1.0 }),
      a('fade_out', { target: 's06_gap_line', duration: 1.0 }),
      a('fade_out', { target: 's06_not_homeo', duration: 1.0 }),
      a('fade_out', { target: 's06_cp1', duration: 1.0 }),
      a('fade_out', { target: 's06_cp2', duration: 1.0 }),
      a('fade_out', { target: 's06_lp1', duration: 1.0 }),
      a('fade_out', { target: 's06_lp2', duration: 1.0 }),
    ),
  ];
  actions.push(shot6);

  // =============================================================
  // SHOT 7: 严格条件二：双射（一一对应） (Target: 25.0s)
  // =============================================================
  const shot7 = a('sequence');
  shot7.children = [
    a('text', { name: 's07_banner', text: '核心准则二 · 一一对应的双射 (Bijection)', fontSize: BANNER_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: BLUE_TEXT, x: 0, y: 3.2, appear: 'fade', duration: 1.0 }),

    // Subtitle 1 (1.5s + 8.5s + 1.0s = 11.0s)
    a('text', { name: 's07_sub1', text: '第二个严格数学要求：\n映射必须是‘一一对应’的双射。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: WHITE, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    par(
      a('dot', { name: 's07_origin', radius: 0.12, color: GOLD, fill: 1, x: 0, y: 0.3, appear: 'fade', duration: 0.8 }),
      a('circle', { name: 's07_circ', radius: 1.4, color: TEAL, fill: 0.1, x: 0, y: 0.3, appear: 'create', duration: 1.5 }),
      a('square', { name: 's07_sq', side: 3.6, color: PURPLE, fill: 0.08, x: 0, y: 0.3, appear: 'create', duration: 1.5 }),
      a('arrow', { name: 's07_ray1', x1: 0, y1: 0.3, x2: 2.2, y2: 1.5, color: GOLD, appear: 'create', duration: 1.0 }),
      a('arrow', { name: 's07_ray2', x1: 0, y1: 0.3, x2: -2.2, y2: 1.5, color: GOLD, appear: 'create', duration: 1.0 }),
    ),
    a('wait', { duration: 7.0 }),
    a('fade_out', { target: 's07_sub1', duration: 1.0 }),

    // Subtitle 2 (1.5s + 9.5s + 1.0s + 1.0s = 13.0s)
    a('text', { name: 's07_sub2', text: '每点对应唯一的目标点，\n既不能将两点捏为一个，也不能漏掉任何点。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: GOLD, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    par(
      a('arrow', { name: 's07_ray3', x1: 0, y1: 0.3, x2: 2.2, y2: -0.9, color: GOLD, appear: 'create', duration: 1.0 }),
      a('arrow', { name: 's07_ray4', x1: 0, y1: 0.3, x2: -2.2, y2: -0.9, color: GOLD, appear: 'create', duration: 1.0 }),
    ),
    a('indicate', { target: 's07_circ', duration: 1.2 }),
    a('indicate', { target: 's07_sq', duration: 1.2 }),
    a('wait', { duration: 6.1 }),
    a('fade_out', { target: 's07_sub2', duration: 1.0 }),
    par(
      a('fade_out', { target: 's07_banner', duration: 1.0 }),
      a('fade_out', { target: 's07_circ', duration: 1.0 }),
      a('fade_out', { target: 's07_sq', duration: 1.0 }),
      a('fade_out', { target: 's07_ray1', duration: 1.0 }),
      a('fade_out', { target: 's07_ray2', duration: 1.0 }),
      a('fade_out', { target: 's07_ray3', duration: 1.0 }),
      a('fade_out', { target: 's07_ray4', duration: 1.0 }),
      a('fade_out', { target: 's07_origin', duration: 1.0 }),
    ),
  ];
  actions.push(shot7);

  // =============================================================
  // SHOT 8: 反例辨析：粘合为何被禁止？ (Target: 25.0s)
  // =============================================================
  const shot8 = a('sequence');
  shot8.children = [
    a('text', { name: 's08_banner', text: '拓扑反例 · 粘合破坏了单射与回路结构', fontSize: BANNER_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: RED, x: 0, y: 3.2, appear: 'fade', duration: 1.0 }),

    // Subtitle 1 (1.5s + 8.5s + 1.0s = 11.0s)
    a('text', { name: 's08_sub1', text: '如果将圆环对向捏紧并粘合，\n就会形成一个‘8’字形图形。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: WHITE, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    par(
      a('circle', { name: 's08_loop1', radius: 1.1, color: RED, fill: 0.15, x: -1.1, y: 0.3, appear: 'create', duration: 1.5 }),
      a('circle', { name: 's08_loop2', radius: 1.1, color: RED, fill: 0.15, x: 1.1, y: 0.3, appear: 'create', duration: 1.5 }),
      a('dot', { name: 's08_cross_dot', radius: 0.16, color: GOLD, fill: 1, x: 0, y: 0.3, appear: 'fade', duration: 0.8 }),
      a('text', { name: 's08_cross_lbl', text: '交叉粘合点', fontSize: 24, maxWidth: 3.0, color: GOLD, x: 0, y: -1.3, appear: 'write', duration: 1.0 }),
    ),
    a('wait', { duration: 7.0 }),
    a('fade_out', { target: 's08_sub1', duration: 1.0 }),

    // Subtitle 2 (1.5s + 9.5s + 1.0s + 1.0s = 13.0s)
    a('text', { name: 's08_sub2', text: '粘合使两个原点重合，破坏了一一对应，\n还凭空虚增了闭环！', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: RED, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    a('flash', { target: 's08_cross_dot', duration: 1.5 }),
    a('wiggle', { target: 's08_loop1', duration: 1.5 }),
    // Normal text explicitly stating "不同胚", avoiding TeX cancel package dependency
    a('text', { name: 's08_tex_fail', text: '圆环与“8”字形空间不同胚', fontSize: 28, maxWidth: SUB_MAX_WIDTH, color: RED, x: 0, y: 2.1, appear: 'write', duration: 1.5 }),
    a('wait', { duration: 5.0 }),
    a('fade_out', { target: 's08_sub2', duration: 1.0 }),
    par(
      a('fade_out', { target: 's08_banner', duration: 1.0 }),
      a('fade_out', { target: 's08_loop1', duration: 1.0 }),
      a('fade_out', { target: 's08_loop2', duration: 1.0 }),
      a('fade_out', { target: 's08_cross_dot', duration: 1.0 }),
      a('fade_out', { target: 's08_cross_lbl', duration: 1.0 }),
      a('fade_out', { target: 's08_tex_fail', duration: 1.0 }),
    ),
  ];
  actions.push(shot8);

  // =============================================================
  // SHOT 9: 严格条件三：连续逆映射（同胚） (Target: 25.0s)
  // =============================================================
  const shot9 = a('sequence');
  shot9.children = [
    a('text', { name: 's09_banner', text: '核心准则三 · 逆映射连续与同胚 (Homeomorphism)', fontSize: BANNER_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: BLUE_TEXT, x: 0, y: 3.2, appear: 'fade', duration: 1.0 }),

    // Subtitle 1 (1.5s + 8.5s + 1.0s = 11.0s)
    a('text', { name: 's09_sub1', text: '第三个核心准则：不仅正向可连续压缩，\n反向逆映射也必须完全连续。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: WHITE, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    a('circle', { name: 's09_morph', radius: 1.6, color: TEAL, fill: 0.15, x: 0, y: 0.3, appear: 'create', duration: 1.5 }),
    a('square', { name: 's09_to_sq', side: 2.8, color: PURPLE, fill: 0.15, x: 0, y: 0.3, appear: 'hidden', duration: 0.1 }),
    a('transform', { target: 's09_morph', destination: 's09_to_sq', duration: 2.0 }),
    a('circle', { name: 's09_to_c', radius: 1.6, color: TEAL, fill: 0.15, x: 0, y: 0.3, appear: 'hidden', duration: 0.1 }),
    a('transform', { target: 's09_morph', destination: 's09_to_c', duration: 2.0 }),
    a('wait', { duration: 3.0 }),
    a('fade_out', { target: 's09_sub1', duration: 1.0 }),

    // Subtitle 2 (1.5s + 9.5s + 1.0s + 1.0s = 13.0s)
    // Mathematical fix: "在同胚这一等价标准下" replacing "终极等价"
    a('text', { name: 's09_sub2', text: '双向连续且一一对应——\n在同胚这一等价标准下，它们被视为相同！', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: GOLD, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    a('formula', { name: 's09_homeo_def', tex: 'X \\cong Y \\iff f \\text{ and } f^{-1} \\text{ are Continuous Bijections}', fontSize: 28, color: GOLD, x: 0, y: 2.2, appear: 'write', duration: 1.8 }),
    a('indicate', { target: 's09_homeo_def', duration: 1.5 }),
    a('circumscribe', { target: 's09_morph', duration: 1.5 }),
    a('wait', { duration: 4.7 }),
    a('fade_out', { target: 's09_sub2', duration: 1.0 }),
    par(
      a('fade_out', { target: 's09_banner', duration: 1.0 }),
      a('fade_out', { target: 's09_morph', duration: 1.0 }),
      a('fade_out', { target: 's09_homeo_def', duration: 1.0 }),
    ),
  ];
  actions.push(shot9);

  // =============================================================
  // SHOT 10: 关键辨析：圆周不是圆盘！ (Target: 25.0s)
  // =============================================================
  const shot10 = a('sequence');
  shot10.children = [
    a('text', { name: 's10_banner', text: '关键辨析 · 边界与内部：圆周不是圆盘', fontSize: BANNER_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: BLUE_TEXT, x: 0, y: 3.2, appear: 'fade', duration: 1.0 }),

    // Subtitle 1 (1.5s + 8.5s + 1.0s = 11.0s)
    a('text', { name: 's10_sub1', text: '请特别注意拓扑对象的精确定义：\n我们研究的是空心圆周，而非实心圆盘。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: WHITE, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    par(
      a('circle', { name: 's10_circle_1d', radius: 1.4, color: TEAL, fill: 0, x: -3.5, y: 0.3, appear: 'create', duration: 1.5 }),
      a('text', { name: 's10_lbl_1d', text: '圆周 S¹ (1维流形)', fontSize: 24, maxWidth: 3.5, color: TEAL, x: -3.5, y: -1.5, appear: 'write', duration: 1.0 }),
      a('circle', { name: 's10_disk_2d', radius: 1.4, color: PURPLE, fill: 0.65, x: 3.5, y: 0.3, appear: 'create', duration: 1.5 }),
      a('text', { name: 's10_lbl_2d', text: '圆盘 D² (2维流形)', fontSize: 24, maxWidth: 3.5, color: PURPLE, x: 3.5, y: -1.5, appear: 'write', duration: 1.0 }),
    ),
    a('wait', { duration: 7.0 }),
    a('fade_out', { target: 's10_sub1', duration: 1.0 }),

    // Subtitle 2 (1.5s + 9.5s + 1.0s + 1.0s = 13.0s)
    a('text', { name: 's10_sub2', text: '圆周是一维闭合线，圆盘是二维实心面——\n二者维度不同，绝不同胚！', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: GOLD, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    // Normal text explicitly stating "不同胚", avoiding TeX cancel package dependency
    a('text', { name: 's10_neq', text: '圆周 S¹ 与圆盘 D² 不同胚！', fontSize: 32, maxWidth: SUB_MAX_WIDTH, color: RED, x: 0, y: 0.3, appear: 'write', duration: 1.5 }),
    a('flash', { target: 's10_neq', duration: 1.5 }),
    a('indicate', { target: 's10_disk_2d', duration: 1.5 }),
    a('wait', { duration: 5.0 }),
    a('fade_out', { target: 's10_sub2', duration: 1.0 }),
    par(
      a('fade_out', { target: 's10_banner', duration: 1.0 }),
      a('fade_out', { target: 's10_circle_1d', duration: 1.0 }),
      a('fade_out', { target: 's10_disk_2d', duration: 1.0 }),
      a('fade_out', { target: 's10_neq', duration: 1.0 }),
      a('fade_out', { target: 's10_lbl_1d', duration: 1.0 }),
      a('fade_out', { target: 's10_lbl_2d', duration: 1.0 }),
    ),
  ];
  actions.push(shot10);

  // =============================================================
  // SHOT 11: 拓扑不变量：孔洞与连通度 (Target: 25.0s)
  // =============================================================
  const shot11 = a('sequence');
  shot11.children = [
    a('text', { name: 's11_banner', text: '深层本质 · 拓扑不变量 (Topological Invariants)', fontSize: BANNER_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: BLUE_TEXT, x: 0, y: 3.2, appear: 'fade', duration: 1.0 }),

    // Subtitle 1 (1.5s + 8.5s + 1.0s = 11.0s)
    // Mathematical fix: having the same invariant does not generally imply homeomorphism.
    // Explicitly states: continuous bijection proves homeomorphism; invariants help rule out impossible mappings.
    a('text', { name: 's11_sub1', text: '刚才的双向连续对应证明了它们同胚；\n不变量可以帮助排除不可能的对应。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: WHITE, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    par(
      a('circle', { name: 's11_c', radius: 1.1, color: TEAL, fill: 0.1, x: -4.0, y: 0.3, appear: 'create', duration: 1.5 }),
      a('ellipse', { name: 's11_e', width: 2.5, height: 1.5, color: GOLD, fill: 0.1, x: 0, y: 0.3, appear: 'create', duration: 1.5 }),
      a('square', { name: 's11_s', side: 2.0, color: PURPLE, fill: 0.1, x: 4.0, y: 0.3, appear: 'create', duration: 1.5 }),
      a('dot', { name: 's11_hole_c', radius: 0.12, color: GOLD, fill: 1, x: -4.0, y: 0.3, appear: 'fade', duration: 0.8 }),
      a('dot', { name: 's11_hole_e', radius: 0.12, color: GOLD, fill: 1, x: 0, y: 0.3, appear: 'fade', duration: 0.8 }),
      a('dot', { name: 's11_hole_s', radius: 0.12, color: GOLD, fill: 1, x: 4.0, y: 0.3, appear: 'fade', duration: 0.8 }),
    ),
    a('wait', { duration: 7.0 }),
    a('fade_out', { target: 's11_sub1', duration: 1.0 }),

    // Subtitle 2 (1.5s + 9.5s + 1.0s + 1.0s = 13.0s)
    // Mathematical fix: avoids "开线段", rigorously expresses cutting property of S^1
    a('text', { name: 's11_sub2', text: '切断一处仍保持连通，切断两处才分成两截——\n回路与孔洞的连通性质完全相同！', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: TEAL, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    a('formula', { name: 's11_inv_tex', tex: '\\chi(S^1) = 0, \\quad \\beta_1(S^1) = 1 \\text{ (One Hole)}', fontSize: 28, color: GOLD, x: 0, y: 2.0, appear: 'write', duration: 1.8 }),
    par(
      a('passing_flash', { target: 's11_c', color: TEAL, timeWidth: 0.3, duration: 1.5 }),
      a('passing_flash', { target: 's11_e', color: GOLD, timeWidth: 0.3, duration: 1.5 }),
      a('passing_flash', { target: 's11_s', color: PURPLE, timeWidth: 0.3, duration: 1.5 }),
    ),
    a('wait', { duration: 6.2 }),
    a('fade_out', { target: 's11_sub2', duration: 1.0 }),
    par(
      a('fade_out', { target: 's11_banner', duration: 1.0 }),
      a('fade_out', { target: 's11_c', duration: 1.0 }),
      a('fade_out', { target: 's11_e', duration: 1.0 }),
      a('fade_out', { target: 's11_s', duration: 1.0 }),
      a('fade_out', { target: 's11_inv_tex', duration: 1.0 }),
      a('fade_out', { target: 's11_hole_c', duration: 1.0 }),
      a('fade_out', { target: 's11_hole_e', duration: 1.0 }),
      a('fade_out', { target: 's11_hole_s', duration: 1.0 }),
    ),
  ];
  actions.push(shot11);

  // =============================================================
  // SHOT 12: 宏大收束：拓扑视角下的新世界 (Target: 25.0s)
  // =============================================================
  const shot12 = a('sequence');
  shot12.children = [
    // Mathematical fix: "拓扑同胚的等价标准" replacing "最高秩序"
    a('text', { name: 's12_banner', text: '全章总结 · 拓扑同胚的等价标准', fontSize: BANNER_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: BLUE_TEXT, x: 0, y: 3.2, appear: 'fade', duration: 1.0 }),

    // Subtitle 1 (1.5s + 8.5s + 1.0s = 11.0s)
    // Mathematical fix: "在同胚这一等价标准下" replacing "最高数学意义"
    a('text', { name: 's12_sub1', text: '在什么意义下它们是同一种形状？\n在同胚这一等价标准下！', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: GOLD, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    a('circle', { name: 's12_final', radius: 1.8, color: TEAL, fill: 0.15, x: 0, y: 0.2, appear: 'create', duration: 1.5 }),
    a('ellipse', { name: 's12_to_e', width: 4.0, height: 2.0, color: GOLD, fill: 0.15, x: 0, y: 0.2, appear: 'hidden', duration: 0.1 }),
    a('transform', { target: 's12_final', destination: 's12_to_e', duration: 2.0 }),
    a('square', { name: 's12_to_s', side: 3.0, color: PURPLE, fill: 0.15, x: 0, y: 0.2, appear: 'hidden', duration: 0.1 }),
    a('transform', { target: 's12_final', destination: 's12_to_s', duration: 2.0 }),
    a('circle', { name: 's12_to_c', radius: 1.8, color: TEAL, fill: 0.15, x: 0, y: 0.2, appear: 'hidden', duration: 0.1 }),
    a('transform', { target: 's12_final', destination: 's12_to_c', duration: 2.0 }),
    a('wait', { duration: 1.0 }),
    a('fade_out', { target: 's12_sub1', duration: 1.0 }),

    // Subtitle 2 (1.5s + 9.5s + 1.0s + 1.0s hold = 13.0s)
    a('text', { name: 's12_sub2', text: '抛开僵硬度量，拓扑让我们洞察到\n几何深处最永恒、自由的内在联结。', fontSize: SUB_FONT_SIZE, maxWidth: SUB_MAX_WIDTH, color: TEAL, x: 0, y: -3.1, appear: 'write', duration: 1.5 }),
    a('formula', { name: 's12_final_tex', tex: '\\text{Circle} \\cong \\text{Ellipse} \\cong \\text{Square} \\cong S^1', fontSize: 30, color: GOLD, x: 0, y: 2.3, appear: 'write', duration: 2.0 }),
    a('indicate', { target: 's12_final_tex', duration: 1.5 }),
    a('circumscribe', { target: 's12_final', duration: 1.5 }),
    a('wait', { duration: 4.0 }),
    a('fade_out', { target: 's12_sub2', duration: 1.0 }),
    // Final serene hold
    a('wait', { duration: 1.5 }),
  ];
  actions.push(shot12);

  project.actions = actions;
  return project;
}

// Self-run when executed via node
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Generating Chapter 01 AnyVis project...');
  const project = buildChapter01Project();
  
  // 1. Validation
  console.log('Validating project...');
  const validated = validateProject(project);
  console.log(`Validation OK: "${validated.name}" (ID: ${validated.id}), actions count: ${validated.actions.length}`);

  // Count total blocks recursively
  let totalBlocks = 0;
  const countBlocks = (items) => {
    for (const item of items) {
      totalBlocks++;
      if (item.children) countBlocks(item.children);
      if (item.branches) item.branches.forEach(countBlocks);
    }
  };
  countBlocks(validated.actions);
  console.log(`Total recursive blocks count: ${totalBlocks} (budget: <= 500)`);

  // 2. Per-shot compilation & duration check
  console.log('Checking individual shots duration:');
  let cumulative = 0;
  validated.actions.forEach((shot, i) => {
    const sp = createEmptyProject();
    sp.actions = [shot];
    const c = compileProject(sp);
    cumulative += c.duration;
    console.log(`  Shot ${String(i + 1).padStart(2, '0')}: ${c.duration.toFixed(1)}s (cumulative: ${cumulative.toFixed(1)}s)`);
    if (c.diagnostics.length > 0) {
      console.error(`Shot ${i + 1} diagnostics:`, c.diagnostics);
      process.exit(1);
    }
  });

  // 3. Full Project Compilation
  console.log('Compiling entire project...');
  const compiled = compileProject(validated);
  console.log(`Compilation finished.`);
  console.log(`Estimated duration: ${compiled.duration} seconds (target: 300.0s)`);
  console.log(`Requires trust: ${compiled.requiresTrust}`);
  console.log(`Diagnostics count: ${compiled.diagnostics.length}`);
  if (compiled.diagnostics.length > 0) {
    console.error('Diagnostics:', compiled.diagnostics);
    process.exit(1);
  }

  // 4. Standalone python verification
  console.log('Testing exportStandalonePython...');
  const pyCode = exportStandalonePython(validated);
  console.log(`Standalone python code generated successfully (${pyCode.split('\n').length} lines).`);

  // 5. Output chapter-01.anyvis.json
  const outPath = path.join(__dirname, 'chapter-01.anyvis.json');
  fs.writeFileSync(outPath, JSON.stringify(validated, null, 2), 'utf-8');
  console.log(`Wrote JSON project to: ${outPath}`);
}
