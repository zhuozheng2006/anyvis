import type { Project } from './core/types';
import { createAction } from './core/catalog';
import { compileProject } from './core/compiler';
import { createEmptyProject } from './core/project';
import { appendPlaygroundActions, playgroundApi, playgroundName } from './playground-actions';

export interface ColorSwatch {
  name: string;
  hex: string;
  manimName: string;
}

export const PALETTE_3B1B: ColorSwatch[] = [
  { name: '3B1B 金黄', hex: '#e2b340', manimName: 'YELLOW' },
  { name: '3B1B 青蓝', hex: '#58c4dd', manimName: 'BLUE_C' },
  { name: '3B1B 草绿', hex: '#83c167', manimName: 'GREEN_C' },
  { name: '3B1B 珊瑚红', hex: '#fc6255', manimName: 'RED_C' },
  { name: '3B1B 薰衣紫', hex: '#bb86fc', manimName: 'PURPLE_C' },
  { name: '3B1B 晨光天蓝', hex: '#38bdf8', manimName: 'TEAL_C' },
  { name: '活力亮橙', hex: '#ff9f43', manimName: 'ORANGE' },
  { name: '纯净自然白', hex: '#ffffff', manimName: 'WHITE' },
];

export interface TexStylingPreset {
  id: string;
  name: string;
  rawTex: string;
  defaultColors: Record<string, string>;
  description: string;
}

export const TEX_STYLING_PRESETS: TexStylingPreset[] = [
  {
    id: 'euler-identity',
    name: '欧拉恒等式 (Euler Identity)',
    rawTex: 'e^{i\\pi} + 1 = 0',
    defaultColors: {
      e: '#e2b340',
      i: '#58c4dd',
      '\\pi': '#83c167',
    },
    description: '连接自然对数、虚数单位与圆周率的最美公式',
  },
  {
    id: 'pythagoras',
    name: '勾股定理 (Pythagorean Theorem)',
    rawTex: 'a^2 + b^2 = c^2',
    defaultColors: {
      a: '#e2b340',
      b: '#58c4dd',
      c: '#fc6255',
    },
    description: '直角三角形边长几何关系',
  },
  {
    id: 'energy-mass',
    name: '质能方程 (Mass-Energy Equivalence)',
    rawTex: 'E = m c^2',
    defaultColors: {
      E: '#e2b340',
      m: '#58c4dd',
      c: '#83c167',
    },
    description: '狭义相对论核心结论',
  },
  {
    id: 'ftc',
    name: '微积分基本定理 (Newton-Leibniz Formula)',
    rawTex: '\\int_a^b f\'(x) \\, dx = f(b) - f(a)',
    defaultColors: {
      a: '#fc6255',
      b: '#e2b340',
      x: '#58c4dd',
      f: '#bb86fc',
    },
    description: '微分与定积分互为逆运算的核心纽带',
  },
  {
    id: 'fourier-series',
    name: '复指数傅里叶级数 (Complex Fourier Series)',
    rawTex: 'f(x) = \\sum_{n=-\\infty}^\\infty c_n e^{i n x}',
    defaultColors: {
      'c_n': '#e2b340',
      n: '#58c4dd',
      x: '#83c167',
    },
    description: '周期函数正交三角级数分解',
  },
  {
    id: 'quadratic-formula',
    name: '一元二次求根公式 (Quadratic Formula)',
    rawTex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    defaultColors: {
      x: '#e2b340',
      b: '#58c4dd',
      a: '#fc6255',
      c: '#83c167',
    },
    description: '代数基本求根公式',
  },
];

export interface TexToken {
  id: string;
  text: string;
  isMathSymbol: boolean;
  color?: string;
}

/**
 * Tokenizes raw LaTeX text into candidate tokens for coloring
 */
export function tokenizeTexFormula(raw: string): TexToken[] {
  // Regex matches LaTeX commands like \pi, \int, \frac, subscripts like c_n, or single identifiers like x, y, a
  const regex = /(\\[a-zA-Z]+|[a-zA-Z]_[a-zA-Z0-9]+|[a-zA-Z]|[0-9]+|[+\-=*/^()])/g;
  const tokens: TexToken[] = [];
  let match: RegExpExecArray | null;
  let counter = 0;

  while ((match = regex.exec(raw)) !== null) {
    const text = match[0];
    const isMathSymbol = /^[a-zA-Z]/.test(text) || text.startsWith('\\');
    tokens.push({
      id: `tok_${counter++}_${text}`,
      text,
      isMathSymbol,
    });
  }

  return tokens;
}

/**
 * Applies color map to produce colored LaTeX string and isolated substrings
 */
export function applyColorsToTex(
  raw: string,
  colorMap: Record<string, string>
): {
  coloredTex: string;
  isolatedSubstrings: string[];
  texToColorMap: Record<string, string>;
} {
  const isolatedSubstrings: string[] = [];
  const texToColorMap: Record<string, string> = {};

  for (const [key, color] of Object.entries(colorMap)) {
    if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw Error('公式颜色必须为六位十六进制颜色。');
    if (key && color && color.toLowerCase() !== '#ffffff') {
      isolatedSubstrings.push(key);
      texToColorMap[key] = color;
    }
  }

  // Sort keys by descending length to prevent sub-string collision (e.g. \pi before p)
  const sortedKeys = Object.keys(texToColorMap).sort((a, b) => b.length - a.length);

  let coloredTex = raw;
  if (sortedKeys.length > 0) {
    const pattern = new RegExp(
      sortedKeys
        .map(k => {
          const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return `(?<!\\\\[a-zA-Z]*)${escaped}(?![a-zA-Z])`;
        })
        .join('|'),
      'g'
    );
    coloredTex = raw.replace(pattern, match => {
      const color = texToColorMap[match];
      return color ? `{\\color[HTML]{${color.slice(1).toUpperCase()}}${match}}` : match;
    });
  }

  return {
    coloredTex,
    isolatedSubstrings,
    texToColorMap,
  };
}

/** Export the same MathTex construction as insertion, preserving TeX colors. */
export function generateColoredMathTexPython(raw: string, colorMap: Record<string, string>): string {
  return compileProject(createColoredMathTexActions(createEmptyProject(), raw, colorMap).project).code;
}

export function createColoredMathTexActions(project: Project, raw: string, colorMap: Record<string, string>, name = '彩色公式'): { project: Project; actionIds: string[] } {
  const { coloredTex } = applyColorsToTex(raw, colorMap);
  const formulaName = playgroundName(name.slice(0, 80));
  const template = playgroundName('公式配色模板');
  // The curated formula block applies a uniform .set_color after construction.
  // MathTex API keeps scoped inline TeX colors intact.
  return appendPlaygroundActions(project, [
    playgroundApi('TexTemplate', template, {}, { mode: 'store' }),
    playgroundApi('TexTemplate.add_to_preamble', playgroundName('加载公式配色'), { txt: '\\usepackage{xcolor}' }, { receiver: template, mode: 'store' }),
    playgroundApi('MathTex', formulaName, { tex_strings: [coloredTex], font_size: 58, kwargs: { tex_template: { $ref: template } } }, { mode: 'store' }),
    createAction('write', { target: formulaName, duration: 2 }),
    createAction('wait', { duration: 1.5 }),
  ]);
}
