# Manim API 入口覆盖审计

本报告由本机 **Manim CE 0.20.1 / Python 3.12.8** 的只读 introspection 与当前积木目录生成。它不是“完整支持 Manim”的声明。

## 当前计数

“有原生入口”只表示至少一个积木使用了对应公开 API；不表示全部参数、Python 值、组合方式或渲染器行为都已支持。

| 类别 | 已发现 | 有原生积木入口 | 有明确 API 渲染证据 | 有明确行为证据 |
| --- | ---: | ---: | ---: | ---: |
| 公开类（去别名） | 253 | 65 | 18 | 0 |
| 公开函数（去别名） | 146 | 1 | 0 | 0 |
| 公开可调用成员（按实际声明类去重） | 1214 | 29 | 1 | 0 |
| 公开属性 | 47 | 1 | 0 | 0 |

顶层导出名为 254 个类名、146 个函数名；别名去重后见上表。目录共有 97 种积木，其中 94 种带原生 API 映射、2 种为编排语言控制、1 种为代码扩展。

此前库存的直接声明成员为 1064 项。本次补充沿公开类 MRO 可访问、但声明者未被顶层直接导出的成员 197 项，统一按真实声明者去重。此前库存计数对比：无变化。

未解析的积木 API 映射：0；未解析运行时 API：0。未提供原生映射的普通积木：无。

## 分母与证据口径

1. 类与函数取自 `manim` 包顶层公开导出，定义模块必须属于 Manim；同一对象的不同导出名不重复计数。
2. 方法与属性沿导出类的真实 MRO 解析，例如 `Axes.plot` 归属 `CoordinateSystem.plot`。同一继承方法不会因出现在多种几何类上而重复增加覆盖数；类方法、静态方法和属性均保留类型与归属。
3. 每个条目保存签名、参数、默认值描述、模块、声明类及当前积木映射。所有未映射 API 在 JSON 的 `unmapped_api_ids` 中逐项列出，其完整描述保留在 `api_entries`。
4. 这仍是边界明确的发现库存：尚未穷尽未在包顶层导出的公开模块 API、动态生成成员、C 层描述符、枚举或普通类数据属性。没有把这些未知项伪装成已排除的无用 API，也不据此给出“完整覆盖百分比”。
5. `inputs_constructible` 和 `parameter_coverage` 保持 `not_audited`，直到逐 API 的参数适配审计完成。代表积木视频不会自动证明它映射的所有 API 参数路径都被运行过。
6. `render_verified` 只接受明确列出 `api_refs`、引擎版本匹配的原生渲染证据；最后帧冒烟与连续视频分开记录。编译测试不能充当渲染测试。`behavior_verified` 另需状态、身份或时序断言证据。
7. Python 扩展不计入原生入口；序列和重复属于 AnyVis 编排语言，不能靠给它们附上任意 Manim 名称抬高计数。

## 可复现命令

在要审计的 Manim 环境中运行；脚本不会安装依赖、访问网络、启动服务或渲染作品。

```sh
conda activate manim
python scripts/audit-manim-coverage.py --expected-version 0.20.1 --evidence docs/research/native-blocks-batch-1-evidence.json
```

Node 需要支持直接加载 TypeScript。也可以先导出目录 JSON，再通过 `--catalog catalog.json` 输入；输入支持积木数组或 `{"blocks": [...], "runtimeApis": [...]}`。输出位置由 `--output` 和 `--markdown` 指定。默认清单为 `.json.gz`，gzip 时间戳固定为 0；显式指定 `--output path.json` 则输出普通 JSON。`--expected-version` 不匹配即停止，防止把另一个安装环境的结果混入当前记录。

压缩清单保留全部 JSON 数据，可解压后查看：

```sh
gzip -dc docs/research/manim-ce-0.20.1-coverage.json.gz > docs/research/manim-ce-0.20.1-coverage.json
```

也可直接用 Python 读取，无需另建解压文件：

```python
import gzip, json
with gzip.open('docs/research/manim-ce-0.20.1-coverage.json.gz', 'rt', encoding='utf-8') as stream:
    report = json.load(stream)
print(len(report['api_entries']))
```

目录元数据 SHA-256：`a1d47bf9d94e2b1e9710c3e9c4aefba04f42f503ab9486a81b3b834f6bc817b0`。报告不包含生成时间、私有安装路径或进程内存地址，输入不变时重复生成应字节一致。

## 验证证据

| 证据 | 类型 | 渲染器 | 积木条目数 | 显式 API 条目数 |
| --- | --- | --- | ---: | ---: |
| `native-blocks-batch-1-animation` | native_video | cairo | 11 | 11 |
| `native-blocks-batch-1-geometry` | native_video | cairo | 8 | 8 |

## 各模块尚未覆盖的入口

| 模块 | 发现条目 | 已有入口 | 尚无入口 |
| --- | ---: | ---: | ---: |
| `manim._config` | 1 | 0 | 1 |
| `manim.animation.animation` | 36 | 1 | 35 |
| `manim.animation.changing` | 5 | 1 | 4 |
| `manim.animation.composition` | 18 | 1 | 17 |
| `manim.animation.creation` | 31 | 6 | 25 |
| `manim.animation.fading` | 6 | 2 | 4 |
| `manim.animation.growing` | 8 | 4 | 4 |
| `manim.animation.indication` | 17 | 7 | 10 |
| `manim.animation.movement` | 10 | 1 | 9 |
| `manim.animation.numbers` | 4 | 0 | 4 |
| `manim.animation.rotation` | 4 | 1 | 3 |
| `manim.animation.specialized` | 1 | 0 | 1 |
| `manim.animation.speedmodifier` | 9 | 0 | 9 |
| `manim.animation.transform` | 45 | 4 | 41 |
| `manim.animation.transform_matching_parts` | 8 | 1 | 7 |
| `manim.animation.updaters.mobject_update_utils` | 8 | 1 | 7 |
| `manim.animation.updaters.update` | 6 | 0 | 6 |
| `manim.camera.camera` | 54 | 0 | 54 |
| `manim.camera.mapping_camera` | 9 | 0 | 9 |
| `manim.camera.moving_camera` | 9 | 0 | 9 |
| `manim.camera.multi_camera` | 6 | 0 | 6 |
| `manim.camera.three_d_camera` | 28 | 0 | 28 |
| `manim.constants` | 3 | 0 | 3 |
| `manim.mobject.frame` | 3 | 0 | 3 |
| `manim.mobject.geometry.arc` | 46 | 7 | 39 |
| `manim.mobject.geometry.boolean_ops` | 4 | 0 | 4 |
| `manim.mobject.geometry.labeled` | 4 | 0 | 4 |
| `manim.mobject.geometry.line` | 33 | 3 | 30 |
| `manim.mobject.geometry.polygram` | 15 | 6 | 9 |
| `manim.mobject.geometry.shape_matchers` | 6 | 2 | 4 |
| `manim.mobject.geometry.tips` | 14 | 0 | 14 |
| `manim.mobject.graph` | 10 | 1 | 9 |
| `manim.mobject.graphing.coordinate_systems` | 71 | 7 | 64 |
| `manim.mobject.graphing.functions` | 11 | 1 | 10 |
| `manim.mobject.graphing.number_line` | 19 | 1 | 18 |
| `manim.mobject.graphing.probability` | 17 | 1 | 16 |
| `manim.mobject.graphing.scale` | 8 | 0 | 8 |
| `manim.mobject.logo` | 4 | 0 | 4 |
| `manim.mobject.matrix` | 15 | 1 | 14 |
| `manim.mobject.mobject` | 164 | 13 | 151 |
| `manim.mobject.opengl.dot_cloud` | 4 | 0 | 4 |
| `manim.mobject.opengl.opengl_mobject` | 185 | 0 | 185 |
| `manim.mobject.opengl.opengl_point_cloud_mobject` | 20 | 0 | 20 |
| `manim.mobject.svg.brace` | 14 | 1 | 13 |
| `manim.mobject.svg.svg_mobject` | 23 | 0 | 23 |
| `manim.mobject.table` | 22 | 0 | 22 |
| `manim.mobject.text.code_mobject` | 2 | 0 | 2 |
| `manim.mobject.text.numbers` | 8 | 1 | 7 |
| `manim.mobject.text.tex_mobject` | 15 | 1 | 14 |
| `manim.mobject.text.text_mobject` | 9 | 1 | 8 |
| `manim.mobject.three_d.polyhedra` | 10 | 0 | 10 |
| `manim.mobject.three_d.three_d_utils` | 8 | 0 | 8 |
| `manim.mobject.three_d.three_dimensions` | 35 | 4 | 31 |
| `manim.mobject.types.image_mobject` | 14 | 0 | 14 |
| `manim.mobject.types.point_cloud_mobject` | 34 | 0 | 34 |
| `manim.mobject.types.vectorized_mobject` | 120 | 4 | 116 |
| `manim.mobject.value_tracker` | 8 | 3 | 5 |
| `manim.mobject.vector_field` | 17 | 0 | 17 |
| `manim.plugins.plugins_flags` | 2 | 0 | 2 |
| `manim.renderer.cairo_renderer` | 12 | 0 | 12 |
| `manim.scene.moving_camera_scene` | 2 | 0 | 2 |
| `manim.scene.scene` | 60 | 3 | 57 |
| `manim.scene.scene_file_writer` | 28 | 0 | 28 |
| `manim.scene.section` | 5 | 0 | 5 |
| `manim.scene.three_d_scene` | 18 | 5 | 13 |
| `manim.scene.vector_space_scene` | 43 | 0 | 43 |
| `manim.scene.zoomed_scene` | 6 | 0 | 6 |
| `manim.utils.bezier` | 14 | 0 | 14 |
| `manim.utils.color.core` | 49 | 0 | 49 |
| `manim.utils.commands` | 3 | 0 | 3 |
| `manim.utils.config_ops` | 3 | 0 | 3 |
| `manim.utils.debug` | 2 | 0 | 2 |
| `manim.utils.file_ops` | 13 | 0 | 13 |
| `manim.utils.images` | 4 | 0 | 4 |
| `manim.utils.iterables` | 13 | 0 | 13 |
| `manim.utils.paths` | 4 | 0 | 4 |
| `manim.utils.rate_functions` | 17 | 0 | 17 |
| `manim.utils.simple_functions` | 3 | 0 | 3 |
| `manim.utils.sounds` | 1 | 0 | 1 |
| `manim.utils.space_ops` | 30 | 0 | 30 |
| `manim.utils.tex` | 8 | 0 | 8 |
| `manim.utils.tex_templates` | 2 | 0 | 2 |

## 当前积木到公开 API 的映射

| 积木类型 | 中文名称 | 映射的公开 API |
| --- | --- | --- |
| `add` | 直接显示 | `Scene.add` |
| `ambient_rotation` | 镜头自动环绕 | `ThreeDScene.begin_ambient_camera_rotation`、`ThreeDScene.stop_ambient_camera_rotation` |
| `animate_value` | 改变参数 | `Mobject.animate`、`ValueTracker.set_value` |
| `annular_sector` | 环形扇区 | `AnnularSector` |
| `annulus` | 圆环 | `Annulus` |
| `apply_matrix` | 线性变换 | `Mobject.animate`、`Mobject.apply_matrix` |
| `arc` | 圆弧 | `Arc` |
| `area` | 曲线下方面积 | `Axes.get_area` |
| `arrange` | 排列组合 | `Mobject.arrange` |
| `arrow` | 箭头 | `Arrow` |
| `axes` | 坐标系 | `Axes` |
| `bar_chart` | 柱状图 | `BarChart` |
| `brace` | 大括号标注 | `Brace` |
| `camera` | 三维镜头 | `ThreeDScene.move_camera`、`ThreeDScene.set_camera_orientation` |
| `circle` | 圆 | `Circle` |
| `circumscribe` | 圈出重点 | `Circumscribe` |
| `code` | Python 扩展 | 扩展，不计覆盖 |
| `color` | 改变颜色 | `Mobject.animate`、`Mobject.set_color` |
| `copy` | 复制对象 | `Mobject.copy` |
| `create` | 绘制对象 | `Create` |
| `cube` | 立方体 | `Cube` |
| `cylinder` | 圆柱 | `Cylinder` |
| `dashed_line` | 虚线 | `DashedLine` |
| `decimal` | 数字 | `DecimalNumber` |
| `dot` | 点 | `Dot` |
| `draw_border` | 描边并填充 | `DrawBorderThenFill` |
| `dynamic_dot` | 随参数运动的点 | `Axes.c2p`、`Dot`、`ValueTracker.get_value`、`always_redraw` |
| `dynamic_line` | 随参数变化的线 | `Axes.c2p`、`Line`、`ValueTracker.get_value`、`always_redraw` |
| `dynamic_number` | 显示参数数值 | `DecimalNumber`、`ValueTracker.get_value`、`always_redraw` |
| `dynamic_plot` | 随参数变化的函数 | `Axes.plot`、`ValueTracker.get_value`、`always_redraw` |
| `ellipse` | 椭圆 | `Ellipse` |
| `fade_in` | 淡入 | `FadeIn` |
| `fade_out` | 淡出 | `FadeOut` |
| `fixed_in_frame` | 固定到屏幕 | `ThreeDScene.add_fixed_in_frame_mobjects` |
| `flash` | 闪光强调 | `Flash` |
| `focus_on` | 聚焦强调 | `FocusOn` |
| `follow` | 文字跟随对象 | `Mobject.add_updater`、`Mobject.get_center`、`Mobject.move_to` |
| `formula` | 数学公式 | `MathTex` |
| `function_plot` | 函数图像 | `Axes.plot` |
| `graph` | 图结构 | `Graph` |
| `graph_highlight` | 强调图顶点 | `Mobject.animate`、`Mobject.set_color`、`VMobject.set_fill`、`VMobject.set_stroke` |
| `group` | 组合对象 | `VGroup` |
| `grow` | 从中心生长 | `GrowFromCenter` |
| `grow_from_edge` | 从边缘长出 | `GrowFromEdge` |
| `grow_from_point` | 从指定位置长出 | `GrowFromPoint` |
| `indicate` | 突出强调 | `Indicate` |
| `line` | 线段 | `Line` |
| `matching_tex` | 匹配公式变形 | `TransformMatchingTex` |
| `matrix` | 矩阵 | `Matrix` |
| `move` | 移动到 | `Mobject.animate`、`Mobject.move_to` |
| `next_to` | 放在对象旁 | `Mobject.next_to` |
| `number_line` | 数轴 | `NumberLine` |
| `opacity` | 改变透明度 | `Mobject.animate`、`VMobject.set_opacity` |
| `parallel` | 同时执行 | `AnimationGroup` |
| `parametric_curve` | 参数曲线 | `ParametricFunction` |
| `passing_flash` | 流动高亮 | `ShowPassingFlash` |
| `path_move` | 沿路径运动 | `MoveAlongPath` |
| `plane` | 网格坐标系 | `NumberPlane` |
| `polygon` | 正多边形 | `RegularPolygon` |
| `rectangle` | 矩形 | `Rectangle` |
| `remove` | 立即移除 | `Scene.remove` |
| `repeat` | 重复执行 | 编排语言控制 |
| `replacement_transform` | 替换为另一个对象 | `ReplacementTransform` |
| `reveal_group` | 逐个显示组合成员 | `ShowIncreasingSubsets` |
| `riemann` | 黎曼矩形 | `Axes.get_riemann_rectangles` |
| `rotate` | 旋转 | `Rotate` |
| `rounded_rectangle` | 圆角矩形 | `RoundedRectangle` |
| `scale` | 缩放 | `Mobject.animate`、`Mobject.scale` |
| `sector` | 扇形 | `Sector` |
| `sequence` | 一组步骤 | 编排语言控制 |
| `set_layer` | 设置叠放层级 | `Mobject.set_z_index` |
| `set_position` | 立即定位 | `Mobject.move_to` |
| `set_style` | 设置样式 | `Mobject.set_color`、`VMobject.set_fill`、`VMobject.set_stroke` |
| `shift` | 移动一段距离 | `Mobject.animate`、`Mobject.shift` |
| `shrink` | 缩小到中心 | `ShrinkToCenter` |
| `sphere` | 球体 | `Sphere` |
| `spin_in` | 旋转入场 | `SpinInFromNothing` |
| `square` | 正方形 | `Square` |
| `star` | 星形 | `Star` |
| `stop_updaters` | 停止自动更新 | `Mobject.clear_updaters` |
| `surface` | 参数曲面 | `Surface` |
| `surrounding_rectangle` | 边框标注 | `SurroundingRectangle` |
| `tangent` | 切线 | `Axes.c2p`、`Line`、`always_redraw` |
| `text` | 文字 | `Text` |
| `three_axes` | 三维坐标系 | `ThreeDAxes` |
| `trace` | 留下运动轨迹 | `Mobject.get_center`、`TracedPath` |
| `tracker` | 声明参数 | `ValueTracker` |
| `transform` | 变成另一个形状 | `Transform` |
| `transform_from_copy` | 从副本变形 | `TransformFromCopy` |
| `triangle` | 三角形 | `Triangle` |
| `type_text` | 逐字显示文字 | `AddTextLetterByLetter` |
| `uncreate` | 擦除 | `Uncreate` |
| `underline` | 下划线标注 | `Underline` |
| `wait` | 等待 | `Scene.wait`、`Wait` |
| `wave` | 波浪起伏 | `ApplyWave` |
| `wiggle` | 轻轻摇晃 | `Wiggle` |
| `write` | 书写对象 | `Write` |

## 独立运行时 API

编译器或运行时使用的 9 个 API 单独记录，不能增加“有原生积木入口”的数字：`MovingCameraScene`、`Scene`、`Scene.play`、`ThreeDScene`、`linear`、`rate_functions.ease_in_sine`、`rate_functions.ease_out_sine`、`smooth`、`there_and_back`。模块公开但未顶层导出的函数保留签名并标记 `inventory_scope: false`，不混入上表的顶层 API 分母。

## 后续验收方向

先从 `unmapped_api_ids` 中筛选创作 API，逐项记录用途和排除理由，再补对应积木、可构造参数、错误定位、行为对照与渲染器验证。自动清单提供检查入口，无法代替这一过程。增加几个常用积木只是进度，不代表完整 API 工作已经完成。

完整机器清单：[manim-ce-0.20.1-coverage.json.gz](research/manim-ce-0.20.1-coverage.json.gz)。
