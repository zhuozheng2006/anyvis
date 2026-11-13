import React, { useMemo, useState } from 'react';
import { compileExpression } from './core/expression';
import './expression-plot-preview.css';

export interface ExpressionSample {
  x: number;
  y: number;
}

export interface ExpressionEvalResult {
  valid: boolean;
  error?: string;
  samples: ExpressionSample[];
  yMin: number;
  yMax: number;
}

export const EXPRESSION_PRESETS: ReadonlyArray<{ label: string; expr: string }> = [
  { label: 'sin(x)', expr: 'sin(x)' },
  { label: 'cos(x)', expr: 'cos(x)' },
  { label: 'x²/3', expr: 'x^2 / 3' },
  { label: '高斯钟形', expr: '2 * exp(-x^2)' },
  { label: '阻尼振荡', expr: 'exp(-0.3*abs(x)) * cos(3*x)' },
  { label: '三次曲线', expr: '0.2 * (x^3 - 3*x)' },
];

const SAFE_MATH_FUNCS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
};

type Token =
  | { type: 'number'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma' };

function tokenizeForEval(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const ch = source[index];
    if (/\s/.test(ch)) {
      index += 1;
      continue;
    }
    if (source.slice(index, index + 2) === '**') {
      tokens.push({ type: 'op', value: '^' });
      index += 2;
      continue;
    }
    if ('+-*/^%'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      index += 1;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      index += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      index += 1;
      continue;
    }
    const numberMatch = source.slice(index).match(/^(?:\d+\.\d*|\.\d+|\d+)(?:e[+-]?\d+)?/i);
    if (numberMatch) {
      tokens.push({ type: 'number', value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }
    const identMatch = source.slice(index).match(/^[\p{L}_][\p{L}\p{N}_]*/u);
    if (identMatch) {
      tokens.push({ type: 'ident', value: identMatch[0] });
      index += identMatch[0].length;
      continue;
    }
    throw new Error(`无法识别符号 ${ch}`);
  }
  return tokens;
}

export function evaluateScalarExpressionAt(
  raw: string,
  vars: Record<string, number>
): number {
  const tokens = tokenizeForEval(raw);
  let cursor = 0;

  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];

  const parseExpression = (): number => {
    let left = parseTerm();
    while (peek()?.type === 'op' && (peek() as { value: string }).value.match(/^[+-]$/)) {
      const op = (consume() as { value: string }).value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number => {
    let left = parseUnary();
    while (peek()?.type === 'op' && (peek() as { value: string }).value.match(/^[*/%]$/)) {
      const op = (consume() as { value: string }).value;
      const right = parseUnary();
      left = op === '*' ? left * right : op === '/' ? left / right : left % right;
    }
    return left;
  };

  const parseUnary = (): number => {
    if (peek()?.type === 'op' && (peek() as { value: string }).value.match(/^[+-]$/)) {
      const op = (consume() as { value: string }).value;
      const v = parseUnary();
      return op === '-' ? -v : v;
    }
    return parsePower();
  };

  const parsePower = (): number => {
    const base = parsePrimary();
    if (peek()?.type === 'op' && (peek() as { value: string }).value === '^') {
      consume();
      return Math.pow(base, parseUnary());
    }
    return base;
  };

  const parsePrimary = (): number => {
    const token = consume();
    if (!token) throw new Error('表达式不完整');
    if (token.type === 'number') return token.value;
    if (token.type === 'paren' && token.value === '(') {
      const val = parseExpression();
      const closing = consume();
      if (!closing || closing.type !== 'paren' || closing.value !== ')') {
        throw new Error('缺少右括号');
      }
      return val;
    }
    if (token.type === 'ident') {
      if (peek()?.type === 'paren' && (peek() as { value: string }).value === '(') {
        const fn = SAFE_MATH_FUNCS[token.value];
        if (!fn) throw new Error(`不支持的函数 ${token.value}`);
        consume(); // '('
        const args: number[] = [parseExpression()];
        while (peek()?.type === 'comma') {
          consume();
          args.push(parseExpression());
        }
        const closing = consume();
        if (!closing || closing.type !== 'paren' || closing.value !== ')') {
          throw new Error(`函数 ${token.value} 缺少右括号`);
        }
        return fn(...args);
      }
      if (token.value === 'pi') return Math.PI;
      if (token.value === 'e') return Math.E;
      if (Object.prototype.hasOwnProperty.call(vars, token.value)) {
        return vars[token.value];
      }
      throw new Error(`不允许的变量 ${token.value}`);
    }
    throw new Error('表达式语法错误');
  };

  const result = parseExpression();
  if (cursor < tokens.length) throw new Error('表达式存在多余内容');
  return result;
}

export function sampleExpressionCurve(
  raw: string,
  trackerValues: Record<string, number> = {},
  domain: [number, number] = [-4, 4],
  steps = 65
): ExpressionEvalResult {
  const symbols: Record<string, string> = {
    x: 'x',
    t: 't',
    u: 'u',
    v: 'v',
  };
  for (const k of Object.keys(trackerValues)) {
    symbols[k] = k;
  }
  try {
    compileExpression(raw, symbols);
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : '表达式语法错误',
      samples: [],
      yMin: -2,
      yMax: 2,
    };
  }

  const [xMin, xMax] = domain;
  const samples: ExpressionSample[] = [];
  let yMin = Infinity;
  let yMax = -Infinity;

  for (let i = 0; i < steps; i++) {
    const x = xMin + ((xMax - xMin) * i) / Math.max(1, steps - 1);
    try {
      const y = evaluateScalarExpressionAt(raw, {
        ...trackerValues,
        x,
        t: x,
        u: x,
        v: 0,
      });
      if (Number.isFinite(y) && Math.abs(y) <= 1e4) {
        samples.push({ x, y });
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    } catch {
      // Skip domain singularities like 1/0 or sqrt(-1)
    }
  }

  if (samples.length === 0) {
    return {
      valid: false,
      error: '在区间 [-4, 4] 内无有效实数取值',
      samples: [],
      yMin: -2,
      yMax: 2,
    };
  }

  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || Math.abs(yMax - yMin) < 0.5) {
    const mid = Number.isFinite(yMin) ? (yMin + yMax) / 2 : 0;
    yMin = mid - 1.5;
    yMax = mid + 1.5;
  } else {
    const pad = (yMax - yMin) * 0.15;
    yMin -= pad;
    yMax += pad;
  }

  return {
    valid: true,
    samples,
    yMin,
    yMax,
  };
}

/** Build SVG path data, starting a new subpath across domain gaps or sign-flipping asymptotes. */
export function buildExpressionSvgPath(
  samples: ExpressionSample[],
  yMin: number,
  yMax: number,
  xMin = -4,
  xMax = 4,
  steps = 65,
  width = 240,
  height = 76
): string {
  if (samples.length === 0) return '';
  const xSpan = Math.max(1e-6, xMax - xMin);
  const ySpan = Math.max(1e-6, yMax - yMin);
  const stepX = xSpan / Math.max(1, steps - 1);
  const toSvgX = (x: number) => ((x - xMin) / xSpan) * width;
  const toSvgY = (y: number) => height - ((y - yMin) / ySpan) * height;
  const parts: string[] = [];

  for (let idx = 0; idx < samples.length; idx++) {
    const pt = samples[idx];
    const prev = idx > 0 ? samples[idx - 1] : null;
    const hasDomainGap = prev !== null && pt.x - prev.x > stepX * 1.5;
    const hasPoleJump =
      prev !== null &&
      prev.y * pt.y < 0 &&
      Math.abs(pt.y - prev.y) > ySpan * 0.65;
    const cmd = idx === 0 || hasDomainGap || hasPoleJump ? 'M' : 'L';
    parts.push(`${cmd}${toSvgX(pt.x).toFixed(1)},${toSvgY(pt.y).toFixed(1)}`);
  }

  return parts.join(' ');
}

export interface ExpressionPlotPreviewProps {
  expression: string;
  trackerValues?: Record<string, number>;
  onSelectPreset?(expr: string): void;
}

export const ExpressionPlotPreview: React.FC<ExpressionPlotPreviewProps> = ({
  expression,
  trackerValues = {},
  onSelectPreset,
}) => {
  const [hoverSample, setHoverSample] = useState<ExpressionSample | null>(null);
  const result = useMemo(
    () => sampleExpressionCurve(expression, trackerValues),
    [expression, trackerValues]
  );

  const width = 240;
  const height = 76;
  const xMin = -4;
  const xMax = 4;

  const toSvgX = (x: number) => ((x - xMin) / (xMax - xMin)) * width;
  const toSvgY = (y: number) =>
    height - ((y - result.yMin) / Math.max(1e-6, result.yMax - result.yMin)) * height;

  const pathData = useMemo(() => {
    if (!result.valid || result.samples.length === 0) return '';
    return buildExpressionSvgPath(result.samples, result.yMin, result.yMax, xMin, xMax, 65, width, height);
  }, [result]);

  const zeroY = toSvgY(0);
  const zeroX = toSvgX(0);

  return (
    <div className="expr-plot-preview" aria-label="函数表达式实时预览">
      <div className="expr-plot-header">
        <span className="expr-plot-badge">f(x) = {expression || '0'}</span>
        {result.valid && (
          <span className="expr-plot-readout">
            {hoverSample
              ? `x=${hoverSample.x.toFixed(2)}, y=${hoverSample.y.toFixed(2)}`
              : `y ∈ [${result.yMin.toFixed(1)}, ${result.yMax.toFixed(1)}]`}
          </span>
        )}
      </div>

      {result.valid ? (
        <svg
          className="expr-plot-svg"
          viewBox={`0 0 ${width} ${height}`}
          onMouseMove={e => {
            if (result.samples.length === 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
            const targetX = xMin + ratio * (xMax - xMin);
            let nearest = result.samples[0];
            for (const s of result.samples) {
              if (Math.abs(s.x - targetX) < Math.abs(nearest.x - targetX)) {
                nearest = s;
              }
            }
            setHoverSample(nearest);
          }}
          onMouseLeave={() => setHoverSample(null)}
        >
          {/* Axes */}
          {zeroY >= 0 && zeroY <= height && (
            <line
              x1={0}
              y1={zeroY}
              x2={width}
              y2={zeroY}
              stroke="rgba(148, 163, 184, 0.35)"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
          )}
          {zeroX >= 0 && zeroX <= width && (
            <line
              x1={zeroX}
              y1={0}
              x2={zeroX}
              y2={height}
              stroke="rgba(148, 163, 184, 0.35)"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
          )}
          {/* Curve */}
          <path
            d={pathData}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Hover indicator */}
          {hoverSample && (
            <circle
              cx={toSvgX(hoverSample.x)}
              cy={toSvgY(hoverSample.y)}
              r="3.5"
              fill="#facc15"
              stroke="#0f172a"
              strokeWidth="1.5"
            />
          )}
        </svg>
      ) : (
        <div className="expr-plot-error" role="alert">
          {result.error}
        </div>
      )}

      {onSelectPreset && (
        <div className="expr-plot-presets" role="group" aria-label="常用函数预设">
          {EXPRESSION_PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              className="expr-plot-preset-btn"
              onClick={() => onSelectPreset(p.expr)}
              title={`填入表达式 ${p.expr}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
