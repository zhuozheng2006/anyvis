# Manim API 覆盖：入口、参数与运行证据

AnyVis 0.3.0 按已安装的 **Manim CE 0.20.1** 生成积木目录。原有有限清单的 **1,660 / 1,660 个入口均已接入**；扩展到公开子模块和自定义描述符后，共有 **2,293 个类、函数、方法或属性入口**，每一项都有独立的积木类型和参数字段。

这完成了该版本已发现清单的入口接入，**不等于全 Manim 功能或所有参数组合已完成运行验收**。特别是 0.22.1 尚未验证，OpenGL 在本机受环境限制，不能将“可以生成调用”写成“已经渲染通过”。

## 实际数量与核查

| 项目 | 数量 | 核查方式 |
| --- | ---: | --- |
| 类 | 331 | 真实 Python 对象解析 |
| 函数 | 267 | 真实 Python 对象解析 |
| 实例方法 | 1,473 | 按实际声明类去重，继承路径可检索 |
| 类方法 / 静态方法 | 18 / 33 | 保留绑定语义 |
| 属性及自定义描述符 | 171 | 其中 128 项提供写入方式 |
| 参数输入字段 | 9,136 | 原签名 + 未被中间构造器占用的继承参数 |
| 常量及公开类数据 | 2,765 | 全部真实解析成功 |
| 可核对的调用签名 | 2,117 | 参数名、种类、必填状态逐项核对 |
| 没有可反射签名的类 | 5 | 提供显式位置参数列表和命名参数字典，不伪造签名 |
| 旧清单缺失入口 | 0 | 与固定 gzip 库存逐项比较 |
| 本轮原生行为断言涉及的独立 API | 27 | 真实 Manim 对象状态、时序、回调及画面像素断言 |

[机器可读核查报告](research/api-registry-verification.json) · [完整运行时目录](../src/studio/core/api-registry.json) · [以前的常用积木审计](research/curated-api-coverage.md)

## 使用方式

默认工具箱仍保留 97 个常用中文积木。点击工具栏的 **API 浏览器**，搜索类或方法（例如 `Circle`、`Axes.plot`、`Mobject.rotate`），加入积木，再点击字段选择参数值。搜索继承方法时会定位到实际声明者；同一个方法不因被多个子类继承而重复计算。

参数编辑器支持数字、文字、调色板和自由选色、布尔值、对象下拉、多对象勾选、常量、函数、向量、标量函数与曲线/曲面函数。列表、字典和复杂回调也可使用结构化 JSON；这是高级功能，目前尚未全部做成可嵌套的可视值积木。

可选参数留空表示使用 Manim 默认值，与 `0`、`false`、空字符串和 `null` 分开。每个 API 的结果可以命名，再被下一块积木引用。执行方式包括保存结果、显示图形、播放动画、动画改变对象，以及可写属性的赋值。`@scene`、`@camera`、二维场景的 `@frame`、`@renderer` 表示当前场景组件。

“参数值 / 回调函数”积木可保存值、函数或调用结果；“临时设置容器”支持 `tempconfig` 等上下文管理器。复杂回调可连接受控的函数/方法调用、属性读取、索引、切片、比较和条件分支；没有把用户文本当 Python 执行。仍可使用单独的 Python 扩展，但不将它计入原生覆盖。

构造器通过 `**kwargs` 转发父类参数时，额外参数是否适用仍受 Manim 本身约束。生成器会排除被中间构造器明确占用的父类参数，例如 `FadeOut` 应使用 `mobjects` 列表，不能用父类 `Animation.mobject` 代替。

## 结构化参数示例

这些对象作为字段的 JSON 字符串保存；通常由参数编辑器或 AI 生成。

```json
{"$ref":"圆"}
{"$constant":"BLUE"}
{"$array":[1,0,0]}
{"$lambda":{"params":["x"],"body":{"$expr":"sin(x)"}}}
{"$lambda":{"params":["u","v"],"body":{"$array":[{"$expr":"u"},{"$expr":"v"},{"$expr":"sin(u)*cos(v)"}]}}}
{"$call":{"api":"Mobject.rotate","receiver":{"$ref":"圆"},"args":[0.5]}}
{"$property":{"api":"Mobject.width","receiver":{"$ref":"圆"}}}
{"$if":[{"$op":[">",2,1]},"成立","不成立"]}
```

还支持 `$tuple`、`$dict`（整数/元组键）、`$complex`、`$index`、`$slice`、`$local`、`$not` 和返回函数的调用。运算符、API 名称与属性均来自明确清单；未知项在编译时拒绝。结构深度、节点数和字段大小有界，无法直接表达任意 Python 对象、生成器或自定义子类定义。

## 安全与 AI 创作

文件、配置、公式工具、字体、渲染器等敏感 API 保留本机权限标记。AI 可以生成结构化 API 项目，但这类项目不会自动渲染，仍须先检查生成源码并显式启用；原始 Python 扩展不能通过 AI 项目导入绕过限制。AI 提示词只包含常用积木、当前项目已使用的 API 和需求相关条目，避免把整个数千项清单塞进每一次请求。

## 已运行证据与剩余边界

- 2,293 个入口和 2,765 个常量全部解析成功；2,117 项签名匹配，属性写入能力也经过核对。
- 原生集成测试覆盖构造器、可变参数、位置专用/关键字专用参数、属性读写、类方法、返回值、曲线回调、updater、动态重绘、动画组合、上下文恢复及真实画面像素。测试中的固定断言代码只用于测量，不计为原生 API 实现。
- [参数曲线工程与视频](../examples/api/README.md)由 21 个可编辑积木生成，实际视频 1280×720、24 fps、565 帧、23.54 秒；所有帧解码通过，并人工查看关键帧。
- 533 个入口专属于 OpenGL，已接入渲染器选择、编译、导出和 worker 路由，但本机 `glcontext` 无法导入 `egl`，**没有通过 OpenGL 原生渲染验收**。切换渲染器不能自动解决宿主环境缺少的后端。
- `manim.utils.testing.frames_comparison` 因当前环境没有 pytest 而无法导入，明确记录为不可用模块。CLI 入口、Sphinx 文档构建、私有名称和仅在运行时生成的动态成员不在该清单范围内。
- 大部分 API 尚无逐项动画视觉验收；原生断言不等于所有参数组合、所有平台和所有渲染器均验证。复杂回调的纯可视嵌套编辑、自定义 Python 类型，以及 0.22.1 的新增与变更 API 仍需继续工作。

## 复现

在已经安装 Manim 0.20.1 的 Python 环境运行，不会自动安装或修改环境：

```sh
python scripts/generate-api-registry.py --check
npm test
ANYVIS_API_REPORT=artifacts/api/native-evidence.json npm run test:api-native
python scripts/verify-api-registry.py --native-report artifacts/api/native-evidence.json
npm run build
npm run test:desktop
```

Windows 可先在 PowerShell 设置 `$env:ANYVIS_API_REPORT='artifacts/api/native-evidence.json'`。单独运行 `npm run api:verify` 只验证入口与签名，不附加尚未执行的原生证据。旧的 `audit-manim-coverage.py` 仍核查 97 个常用积木，默认写入 `docs/research/curated-api-coverage.md`，不会覆盖本报告。
