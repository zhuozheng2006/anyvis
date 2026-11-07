# API 参数值编译模块约定（初始委派与后续扩展）

Gemini负责且只修改 `src/studio/core/api-values.ts` 与 `api-values.test.ts`。根代理负责其余目录、编译器、编辑器和集成。不要运行网络、安装、服务、Git或修改环境。

实现并导出：

```ts
export interface ApiValueContext {
  references: ReadonlySet<string>;
  symbols?: Record<string,string>; // 已由编译器生成的数学变量映射
  constants: Record<string, {code:string; requiresTrust?:boolean}>;
  callables: Record<string, {code:string; requiresTrust?:boolean}>;
}
export interface CompiledApiValue { code:string; references:string[]; requiresTrust:boolean }
export function compileApiValue(value:unknown, context:ApiValueContext):CompiledApiValue;
```

输入是已解析JSON。普通null/boolean/finite number/string/array/字典分别编译为Python对应字面值，字符串安全引用（包含True/null也仍是字符串）。拒绝NaN、Infinity、超过深度20、总节点4000、字符串长度20000、私有/原型污染键。任何含`$`开头键的对象必须匹配下面唯一精确形状，不允许额外键，也不允许未知标签：

- `{"$ref":"名称"}`：引用已有 `objects[json(name)]`，检查context.references；收集引用名。
- `{"$constant":"名字"}`：只能来自context.constants中静态映射。
- `{"$api":"名字"}`：只能来自context.callables中静态映射，返回函数/类本身（不是调用），传播requiresTrust。
- `{"$expr":"数学表达式"}`：复用现有 `compileExpression`，禁止eval或Python字符串拼接执行。
- `{"$array":[...]}`：numpy数组 `np.array([...])`。
- `{"$tuple":[...]}`：Python tuple，正确处理0/1元素。
- `{"$dict":[[key,value],...]}`：允许整数、字符串、tuple键的Python字典，拒绝明显不可hash键。
- `{"$complex":[real,imag]}`：两个有限数，`complex(real,imag)`。
- `{"$lambda":{"params":["t"],"body":{"$expr":"sin(t)"}}}`：参数为0–8个不重复、非Python关键字且不以_开头的ASCII标识符；禁止self/objects/np等保留名字。body可为标量、数组/tuple/dict或其它安全值；params仅在body作用域内可用。
- `{"$local":"p"}`：只能引用当前lambda参数。
- `{"$index":{"value":{"$local":"p"},"index":0}}`：对安全值取整数索引，整数绝对值不超过100000；字符串索引必须非私有。不允许属性访问。
- `{"$slice":{"value":{"$ref":"组"},"start":0,"stop":2,"step":1}}`：start/stop为整数或null；step非零整数；安全地编译切片。

方法返回值由API积木先保存成命名结果，再通过$ref传入。不要添加任意代码、任意import、getattr或任意方法调用标签。context.code由调用方生成，不是用户输入；用户不能自己提供context。词法作用域不能漏到外部或篡改现有symbols对象。

测试应覆盖有效值、注入文本作为普通字符串、非法标签/多余键、缺失引用、作用域与保留字、所有资源上限，检查requiresTrust传播。完成后只报告实际测试，不宣称完整API覆盖。不要改现有expression.ts。


## 集成后的扩展

以上为最初委派范围。集成实现另外加入 `$call`（静态注册的 API／方法以及安全值产生的函数调用）、`$property`（注册属性读取）、`$op`（白名单运算）、`$if`、`$not`，并支持继承方法别名。它们不接受任意 Python 源码或 import 字符串；API 与属性解析器仅由编译器提供。函数参数名允许内部下划线，仍禁止私有前缀及保留名。

本地文件/TeX 参数和嵌套调用传播 requiresTrust；AI 可导入这些结构化项目，但不能自动授权执行。准确的数据结构、错误分支与回归用例见 `api-values.ts`、`api-callbacks.test.ts` 和 `api-integration.test.ts`。
