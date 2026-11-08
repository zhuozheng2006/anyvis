import type { Project, Action } from './core/types';

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
    if (color && color !== '#ffffff') {
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
      return color ? `\\color{${color}}{${match}}` : match;
    });
  }

  return {
    coloredTex,
    isolatedSubstrings,
    texToColorMap,
  };
}

/**
 * Generates standalone Python code for Manim CE colored MathTex scene
 */
export function generateColoredMathTexPython(
  raw: string,
  colorMap: Record<string, string>
): string {
  const { isolatedSubstrings, texToColorMap } = applyColorsToTex(raw, colorMap);

  const substringsStr = JSON.stringify(isolatedSubstrings);
  const colorStatements = Object.entries(texToColorMap)
    .map(([key, hex]) => {
      const swatch = PALETTE_3B1B.find(s => s.hex.toLowerCase() === hex.toLowerCase());
      const colorVal = swatch ? swatch.manimName : `"${hex}"`;
      return `        formula.set_color_by_tex("${key}", ${colorVal})`;
    })
    .join('\n');

  return `from manim import *

class ColoredTexScene(Scene):
    """
    3Blue1Brown-style Colored MathTex Formula.
    Formula: ${raw}
    """
    def construct(self):
        # 1. 声明并隔离着色关键词
        formula = MathTex(
            r"${raw}",
            substrings_to_isolate=${substringsStr},
        ).scale(1.5)

        # 2. 为对应变量及符号应用专属色彩
${colorStatements || '        # (No custom colors specified)'}

        # 3. 经典 3B1B 手写书写动画
        self.play(Write(formula), run_time=2.0)
        self.wait(1.5)

        # 4. 重点变量脉冲放大动画
        if len(${substringsStr}) > 0:
            target_sub = formula.get_part_by_tex("${isolatedSubstrings[0] || ''}")
            if target_sub:
                self.play(
                    target_sub.animate.scale(1.25),
                    rate_func=there_and_back,
                    run_time=1.0,
                )
                self.wait(1.0)
`;
}

/**
 * Creates AnyVis project actions for inserting the colored MathTex object into the scene
 */
export function createColoredMathTexActions(
  project: Project,
  raw: string,
  colorMap: Record<string, string>,
  name: string = '彩色公式'
): { project: Project; actionIds: string[] } {
  const ts = Date.now().toString(36).slice(-4);
  const { coloredTex } = applyColorsToTex(raw, colorMap);
  const formulaName = `${name}_${ts}`;

  const mathAction: Action = {
    id: `action_mathtex_${ts}`,
    type: 'create_math_tex',
    fields: {
      name: formulaName,
      text: coloredTex,
      color: '#ffffff',
      scale: 1.2,
      note: `3B1B 专属配色公式: ${raw}`,
    },
    children: [],
  };

  return {
    project: {
      ...project,
      actions: [...project.actions, mathAction],
    },
    actionIds: [mathAction.id],
  };
}
