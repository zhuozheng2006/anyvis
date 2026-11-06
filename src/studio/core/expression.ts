/** Small scalar math grammar; never accepts Python text, attributes or indexing. */
const FUNCTIONS: Record<string, [string, number, number]> = {
  sin: ['np.sin', 1, 1], cos: ['np.cos', 1, 1], tan: ['np.tan', 1, 1],
  asin: ['np.arcsin', 1, 1], acos: ['np.arccos', 1, 1], atan: ['np.arctan', 1, 1], atan2: ['np.arctan2', 2, 2],
  sinh: ['np.sinh', 1, 1], cosh: ['np.cosh', 1, 1], tanh: ['np.tanh', 1, 1],
  exp: ['np.exp', 1, 1], log: ['np.log', 1, 1], ln: ['np.log', 1, 1], sqrt: ['np.sqrt', 1, 1],
  abs: ['abs', 1, 1], floor: ['np.floor', 1, 1], ceil: ['np.ceil', 1, 1], min: ['min', 2, 8], max: ['max', 2, 8],
};
export const RESERVED_SYMBOLS = new Set(['x', 'y', 'z', 't', 'u', 'v', 'pi', 'e', ...Object.keys(FUNCTIONS)]);
export function compileExpression(source: string, symbols: Record<string, string> = {}): string {
  if (!source.trim() || source.length > 400) throw new Error('数学表达式不能为空，且最多 400 个字符。');
  const tokens: string[] = [];
  let remaining = source.trim();
  while (remaining) {
    const match = /^(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|\*\*|[+\-*/^(),%])/.exec(remaining);
    if (!match) throw new Error(`数学表达式不支持“${remaining.slice(0, 16)}”。请使用数字、参数和数学函数。`);
    tokens.push(match[0]);
    remaining = remaining.slice(match[0].length).trimStart();
    if (tokens.length > 180) throw new Error('数学表达式过于复杂。');
  }
  let cursor = 0;
  let depth = 0;
  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];
  const primary = (): string => {
    if (++depth > 30) throw new Error('数学表达式嵌套过深。');
    const token = consume();
    let result: string;
    if (token === '(') {
      result = sum();
      if (consume() !== ')') throw new Error('数学表达式缺少右括号。');
      result = `(${result})`;
    } else if (token && /^(?:\d|\.)/.test(token)) {
      const number = Number(token);
      if (!Number.isFinite(number) || Math.abs(number) > 1e100) throw new Error('数学常量过大。');
      result = String(number);
    } else if (token && FUNCTIONS[token] && peek() === '(') {
      consume();
      const args: string[] = [];
      if (peek() !== ')') {
        args.push(sum());
        while (peek() === ',') { consume(); args.push(sum()); }
      }
      if (consume() !== ')') throw new Error(`函数 ${token} 缺少右括号。`);
      const [name, min, max] = FUNCTIONS[token];
      if (args.length < min || args.length > max) throw new Error(`函数 ${token} 的参数数量应为 ${min === max ? min : `${min}–${max}`}。`);
      result = `${name}(${args.join(', ')})`;
    } else if (token === 'pi' || token === 'e') result = `np.${token}`;
    else if (token && Object.prototype.hasOwnProperty.call(symbols, token)) result = symbols[token];
    else throw new Error(`未定义数学变量“${token ?? ''}”。先声明参数，或使用当前函数的自变量。`);
    depth--;
    return result;
  };
  const power = (): string => {
    const left = primary();
    if (peek() === '^' || peek() === '**') { consume(); return `(${left} ** ${unary()})`; }
    return left;
  };
  const unary = (): string => {
    if (peek() === '+' || peek() === '-') { const sign = consume(); return `(${sign}${unary()})`; }
    return power();
  };
  const product = (): string => {
    let left = unary();
    while (peek() === '*' || peek() === '/' || peek() === '%') { const op = consume(); left = `(${left} ${op} ${unary()})`; }
    return left;
  };
  const sum = (): string => {
    let left = product();
    while (peek() === '+' || peek() === '-') { const op = consume(); left = `(${left} ${op} ${product()})`; }
    return left;
  };
  const result = sum();
  if (cursor !== tokens.length) throw new Error(`数学表达式在“${peek()}”处格式不正确。乘法请明确写 *。`);
  return result;
}
