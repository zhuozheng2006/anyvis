# Manim API 覆盖：入口、参数与运行证据

AnyVis 0.4.0 按已安装的 **Manim CE 0.20.1** 生成积木目录。原有有限清单的 **1,660 / 1,660 个入口均已接入**；扩展到公开子模块和自定义描述符后，共有 **2,293 个类、函数、方法或属性入口**，每一项都有独立的积木类型和参数字段。

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
| 原生行为证据涉及的独立 API | 1,454 | 十二组真实 Manim 测试合并去重；状态、回调、动画与原生调用差分 |

[机器可读核查报告](research/api-registry-verification.json) · [完整运行时目录](../src/studio/core/api-registry.json) · [以前的常用积木审计](research/curated-api-coverage.md)

## 使用方式

默认工具箱仍保留 100 个常用中文积木。点击工具栏的 **API 浏览器**，搜索类或方法（例如 `Circle`、`Axes.plot`、`Mobject.rotate`），加入积木，再点击字段选择参数值。搜索继承方法时会定位到实际声明者；同一个方法不因被多个子类继承而重复计算。

参数编辑器支持数字、文字、调色板和自由选色、布尔值、对象下拉、多对象勾选、常量、函数、向量、标量函数与曲线/曲面函数。列表、字典和复杂回调支持递归可视编辑，包括嵌套调用、属性、条件、索引和切片；高级 JSON 仍可切换。过深或过大的子树保留为 JSON，不会静默截断。

可选参数留空表示使用 Manim 默认值，与 `0`、`false`、空字符串和 `null` 分开。每个 API 的结果可以命名，再被下一块积木引用。执行方式包括保存结果、显示图形、播放动画、动画改变对象，以及可写属性的赋值。`@scene`、`@camera`、二维场景的 `@frame`、`@renderer` 表示当前场景组件。

“参数值 / 回调函数”积木可保存值、函数或调用结果；“临时设置容器”支持 `tempconfig` 等上下文管理器。复杂回调可连接受控的函数/方法调用、属性读取、索引、切片、比较和条件分支；没有把用户文本当 Python 执行。仍可使用单独的 Python 扩展，但不将它计入原生覆盖。

构造器通过 `**kwargs` 转发父类参数时，额外参数是否适用仍受 Manim 本身约束。生成器会排除被中间构造器明确占用的父类参数，例如 `FadeOut` 应使用 `mobjects` 列表，不能用父类 `Animation.mobject` 代替。

## 结构化参数示例

这些对象作为字段的 JSON 字符串保存；通常由参数编辑器或 AI 生成。

```json
{"$ref":"圆"}
{"$constant":"BLUE"}
{"$array":[1,0,0]}
{"$float":1}
{"$method":{"api":"Mobject.shift","receiver":{"$ref":"圆"}}}
{"$lambda":{"params":["x"],"body":{"$expr":"sin(x)"}}}
{"$lambda":{"params":["u","v"],"body":{"$array":[{"$expr":"u"},{"$expr":"v"},{"$expr":"sin(u)*cos(v)"}]}}}
{"$call":{"api":"Mobject.rotate","receiver":{"$ref":"圆"},"args":[0.5]}}
{"$property":{"api":"Mobject.width","receiver":{"$ref":"圆"}}}
{"$if":[{"$op":[">",2,1]},"成立","不成立"]}
```

`$float` 保留 Python 浮点类型，例如颜色通道的 `1.0` 不能误编译为整数 `1`；`$method` 生成绑定方法供 `ApplyMethod` 等 API 使用。嵌套方法调用按接收对象动态分派，保留子类重写。

还支持 `$tuple`、`$dict`（整数/元组键）、`$complex`、`$index`、`$slice`、`$local`、`$not` 和返回函数的调用。运算符、API 名称与属性均来自明确清单；未知项在编译时拒绝。结构深度、节点数和字段大小有界，无法直接表达任意 Python 对象、生成器或自定义子类定义。

## 安全与 AI 创作

文件、配置、公式工具、字体、渲染器等敏感 API 保留本机权限标记。AI 可以生成结构化 API 项目，但这类项目不会自动渲染，仍须先检查生成源码并显式启用；原始 Python 扩展不能通过 AI 项目导入绕过限制。AI 提示词只包含常用积木、当前项目已使用的 API 和需求相关条目，避免把整个数千项清单塞进每一次请求。

## 已运行证据与剩余边界

- 2,293 个入口和 2,765 个常量全部解析成功；2,117 项签名匹配，属性写入能力也经过核对。
- 原生集成测试覆盖构造器、可变参数、位置专用/关键字专用参数、属性读写、类方法、返回值、曲线回调、updater、动态重绘、动画组合、上下文恢复及真实画面像素。测试中的固定断言代码只用于测量，不计为原生 API 实现。
- [参数曲线工程与视频](../examples/api/README.md)由 21 个可编辑积木生成，实际视频 1280×720、24 fps、565 帧、23.54 秒；所有帧解码通过，并人工查看关键帧。
- 十二组测试合并后，1,454 个不同入口已有运行证据，剩余未验证入口已降至 839 个（其中通用/Cairo 仅余 383 项，已覆盖全部通用/Cairo API 的 78.2%；OpenGL 专属 456 项）。只读差分测试 200 项全部通过。
- 本轮在 `api-families` 中再新增 104 个独立入口的行为测试（新增 `textAndBraces` 与 `coreMobjectsAndUtils` 两大测试族），覆盖文字、数字与公式排版（`DecimalNumber` 及读写属性、`Integer`、`Variable`、`BulletedList`、`MathTex` 及其子部分检索/着色/透明度/排序、`MathTexPart`、`SingleStringMathTex`、`Tex`、`Title`、`MarkupText`、`Paragraph`、`Text`、`remove_invisible_chars`、`Code.get_styles_list`）、括号与横幅（`ArcBrace`、`Brace`、`BraceBetweenPoints`、`BraceLabel` 及其动画/切换/位移、`BraceText`、`ManimBanner` 及其创建/展开/缩放、`FullScreenRectangle`、`ScreenRectangle`）、核心基类与流线向量场（`Group`、`Mobject`、`CurvesAsSubmobjects`、`VGroup.add`、`VectorizedPoint`、`get_mobject_class`、`get_point_mobject_class`、`get_vectorized_mobject_class`、`ArrowVectorField`、`VectorField.fit_to_coordinate_system`、`VectorField.get_colored_background_image`、`StreamLines` 及其创建/启停动画）以及几何算法与模板工具（`polylabel`、`QuickHull`/`Facet`/`SubFacet`/`Horizon`/`QuickHullPoint`、`TexTemplate`/`TexFontTemplates`/`TexTemplateLibrary`/`tex_hash`、`not_quite_there`/`squish_rate_func`/`unit_interval`/`zero`、`DictAsObject`、`Percent`、`flatten_iterable_parameters`），全部断言具体后置条件，0 失败。
- 本轮在 `api-families` 中新增 60 个独立入口的行为测试，覆盖几何标注与多边形（`AnnotationDot`、`ArcPolygonFromArcs`、`CubicBezier`、`CurvedDoubleArrow`、`LabeledDot`、`TangentialArc`、`TipableVMobject`、`Label`、`LabeledArrow`、`LabeledLine`、`LabeledPolygram`、`Polygram`、`Polygram.get_vertex_groups`、`RegularPolygram`、`Angle.from_three_points`、`Vector.coordinate_label`、`Arrow.reset_normal_vector`、`Arrow.scale`、`Line.generate_points`、`Line.init_points`、`BackgroundRectangle.set_style`、`BackgroundRectangle.pointwise_become_partial`）、三维对象与多面体/法线工具（`Arrow3D`、`Line3D`、`ThreeDVMobject`、`Polyhedron`、`Polyhedron.extract_face_coords`、`Polyhedron.create_faces`、`Polyhedron.get_edges`、`Polyhedron.update_faces`、`ConvexHull3D`、`Cone.func`、`Cylinder.func`、`Sphere.func`、`Torus.func`、`Surface.func`、`get_3d_vmob_*` 全套 8 个函数）以及矩阵与表格（`Matrix`、`IntegerMatrix`、`DecimalMatrix`、`MobjectMatrix`、`Matrix.add_background_to_entries`、`Matrix.set_column_colors`、`Matrix.set_row_colors`、`get_det_text`、`matrix_to_mobject`、`matrix_to_tex_string`、`Table`、`Table.create`、`IntegerTable`、`DecimalTable`、`MathTable`、`MobjectTable`），全部断言具体几何、结构与返回值，0 失败。
- 本轮在 mutations fixture 中新增 82 个独立入口的行为测试，包括 VMobject 贝塞尔曲线拆分/平滑曲线追加/样式/采样函数/颜色更新、Mobject 径向渐变/深度拉伸与缩放/子对象重排/家族递归/点云对齐、Line3D/Surface/Cone/Cylinder/Cube/Prism 三维对象以及 Brace/Table 标注与表格操作，全部断言具体几何、结构与属性，0 失败、0 占位 gap。
- 图片与相机 fixture 包含 74 个 API、75 组断言，新增 70 个此前未覆盖的入口。真实 Cairo/Pillow 像素、原始透明通道、取景边界和三维投影均检查具体结果；额外独立导出工程验证 API 创建的图片可显示并移动。修复 Pillow 13 兼容处理只覆盖上传图片积木而遗漏 API 图片的问题。
- 动画生命周期/updater/tracker 新增 57 个 API；点云、VDict、向量场新增 41 个 API。断言中间位置、时序、暂停/循环、点与 RGBA 的同步筛选及 RK4 移动；这些状态测试不宣称逐项视频编码验证。
- 相机缩放和旋转采用非默认分辨率、非单位矩阵，避免恒等实现误通过。AbstractImageMobject 两个抽象入口验证的是对子类重写的动态派发，不宣称抽象基类可直接调用。
- PMobject.point_from_proportion 的浮点索引错误已由生成的运行时兼容处理修复，新增正常比例、空集/单点、越界、嵌套调用和 MoveAlongPath 内部调用回归。仍采用原本的 floor 离散取样，不将点云取样描述为连续曲线插值。
- 场景 fixture 新增 55 个 API、61 组断言；坐标系/曲线/图结构新增 49 个 API，检查非均匀缩放与平移、导数/积分曲线锚点、拓扑及实际场景像素。
- 同时修复 ThreeDScene 默认视角属性错名，以及前景根对象/分组重叠导致更新器执行两次。按原生分组提取规则保持前景层次，独立组身份保留。三项兼容处理仅在 Manim 0.20.1 且能力探测复现问题时生效，保留已修复实现、子类重写和其他版本。
- 配置与画框 fixture 新增 63 个独立 API；用非默认初始配置验证属性读写与尺寸、方向、路径，并断言配置复制后的修改不影响原对象。
- 新增 17 块浮点颜色、绑定方法和动画回调工程，13.17 秒 / 316 帧全部解码，时间戳单调，红色像素确认浮点颜色真实进入视频。
- 新增 77 个 OpenGL 对象状态 API：实际检查点数组、路径长度、边界框、复制隔离、颜色/透明度、更新器和曲面采样。通过禁用上下文创建确保状态 fixture 不依赖图形设备；报告明确 `renderValidated=false`。Manim 0.20.1 的 `get_arc_length` 在本机 NumPy 2.5.4 下使用 `np.sum(generator)` 报错，已用版本与能力探测限定的兼容处理修复，并验证采样参数转发、空路径、子类重写和既有修复保留。
- 533 个入口专属于 OpenGL，已接入渲染器选择、编译、导出和 worker 路由，本机 `glcontext` 无法导入 `egl`，仍没有本机 OpenGL 渲染通过证据。Linux Xvfb/Mesa softpipe 的独立编译场景已真实绘制 12 帧并验证 160 px 位移，见[原生 CI](https://github.com/zhuozheng2006/anyvis/actions/runs/42444921112)。这是具体场景的像素测试，不是 533 项 OpenGL API 的逐项视觉验收；机器报告 `openGLBehaviorVerified=false` 保留此完整覆盖边界。切换渲染器不能自动解决宿主环境缺少的后端。
- `manim.utils.testing.frames_comparison` 因当前环境没有 pytest 而无法导入，明确记录为不可用模块。CLI 入口、Sphinx 文档构建、私有名称和仅在运行时生成的动态成员不在该清单范围内。
- 大部分 API 尚无逐项动画视觉验收；原生断言不等于所有参数组合、所有平台和所有渲染器均验证。自定义 Python 类型，以及 0.22.1 的新增与变更 API 仍需继续工作。

## 下一批行为验证分母

1,454 项证据之外的 839 项逐项列在机器报告的 `entriesWithoutBehaviorEvidence`，不以跳过测试计为通过。

| 未取得行为证据的类型 | 数量 |
| --- | ---: |
| 实例方法 | 572 |
| 类 | 96 |
| 函数 | 79 |
| 属性 | 65 |
| 静态方法 | 20 |
| 类方法 | 7 |

其中 383 项可用于通用渲染器，456 项 OpenGL 专属。后续优先扩充 Camera、Scene、SVG 解析和配置类接口的隔离 fixture；OpenGL 后续使用已验证的 Linux softpipe 渲染基线继续扩充场景。权限标记不是排除项，只是要求测试避免改动用户环境。

## 复现

在已经安装 Manim 0.20.1 的 Python 环境运行，不会自动安装或修改环境：

```sh
python scripts/generate-api-registry.py --check
npm test
export ANYVIS_API_REPORT=artifacts/api/native-evidence.json
export ANYVIS_API_FAMILIES_REPORT=artifacts/api/native-families-evidence.json
export ANYVIS_API_QUERIES_REPORT=artifacts/api/native-queries-evidence.json
export ANYVIS_API_UTILITIES_REPORT=artifacts/api/native-utilities-evidence.json
export ANYVIS_API_MUTATIONS_REPORT=artifacts/api/native-mutations-evidence.json
export ANYVIS_API_CONFIG_REPORT=artifacts/api/native-config-evidence.json
export ANYVIS_API_RASTER_REPORT=artifacts/api/native-raster-evidence.json
export ANYVIS_API_ANIMATION_STATE_REPORT=artifacts/api/native-animation-state-evidence.json
export ANYVIS_API_POINTCLOUD_REPORT=artifacts/api/native-pointcloud-evidence.json
export ANYVIS_API_SCENE_REPORT=artifacts/api/native-scene-evidence.json
export ANYVIS_API_COORDINATES_REPORT=artifacts/api/native-coordinates-evidence.json
export ANYVIS_API_OPENGL_STATE_REPORT=artifacts/api/native-opengl-state-evidence.json
npm run test:api-native
python scripts/test_verify_api_registry.py
python scripts/verify-api-registry.py --native-report "$ANYVIS_API_REPORT" --native-report "$ANYVIS_API_FAMILIES_REPORT" --native-report "$ANYVIS_API_QUERIES_REPORT" --native-report "$ANYVIS_API_UTILITIES_REPORT" --native-report "$ANYVIS_API_MUTATIONS_REPORT" --native-report "$ANYVIS_API_CONFIG_REPORT" --native-report "$ANYVIS_API_RASTER_REPORT" --native-report "$ANYVIS_API_ANIMATION_STATE_REPORT" --native-report "$ANYVIS_API_POINTCLOUD_REPORT" --native-report "$ANYVIS_API_SCENE_REPORT" --native-report "$ANYVIS_API_COORDINATES_REPORT" --native-report "$ANYVIS_API_OPENGL_STATE_REPORT"
npm run build
npm run test:desktop
```

Windows 可先在 PowerShell 设置 `$env:ANYVIS_API_REPORT='artifacts/api/native-evidence.json'`。单独运行 `npm run api:verify` 只验证入口与签名，不附加尚未执行的原生证据。旧的 `audit-manim-coverage.py` 仍核查 100 个常用积木，默认写入 `docs/research/curated-api-coverage.md`，不会覆盖本报告。

行为报告绑定注册表、依赖锁文件、编译器源文件及测试文件的 SHA-256；版本不符、失败或源码过期的证据不能计入。`Native Manim API regression` 工作流在独立 Ubuntu / Python 3.12 / Cairo 环境执行原生测试与 worker 媒体集成，并保存机器可读证据。

带逐项 outcomes 的证据，其 apiIds 必须与 verified 项完全一致；failed 项即使误写 passed=true 也被拒绝，fixture_gap 不计覆盖。六项证据校验回归包含畸形报告、失败、跳过和陈旧源码。

独立像素测试 `npm run test:opengl-render` 实际运行编译出的场景；本机没有上下文时明确跳过，不计覆盖。Linux CI 使用 Xvfb/Mesa softpipe（默认 LLVMpipe 在首次网格绘制时崩溃），并设置 `ANYVIS_REQUIRE_OPENGL=1`，上下文缺失或像素断言不满足均失败；其结果单独保存为 `opengl-render-evidence.json`，不将一次像素测试扩张为 533 个 OpenGL API 全部验收。
