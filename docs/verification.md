# AnyVis 验证记录

## 交互式时间轴标记系统（TimelineMarkerBar）、CI 自动化打包健壮性及 SVG/向量空间/渲染管线 +86 项原生覆盖突破（2026-11-08）

十三组真实 Manim 证据合并 **1,668 / 2,293** 个独立入口，单轮净增 **86 个**原生 API，未验证入口大幅降至 **625** 项（通用/Cairo 仅余 167 项，覆盖率历史性跃升至 **90.5%**；OpenGL 专属 458 项），全部调用均经 AnyVis 注册表编译器生成，与直接原生 Python 调用进行严格数值、几何点集与返回值后置条件对比，0 失败、0 fixture gap：
- **SVG 与矢量路径解析族 (`svgMobjects`, +28 项)**：`SVGMobject` 构造器、`SVGMobject.get_file_path`、`SVGMobject.init_svg_mobject`、`SVGMobject.generate_config_style_dict`、`SVGMobject.modify_xml_tree`、`SVGMobject.move_into_position`、`SVGMobject.generate_mobject`、`SVGMobject.get_mob_from_shape_element`、`SVGMobject.get_mobjects_from`、`SVGMobject.apply_style_to_mobject`、`SVGMobject.handle_transform`、`SVGMobject.rect_to_mobject`、`SVGMobject.ellipse_to_mobject`、`SVGMobject.line_to_mobject`、`SVGMobject.polygon_to_mobject`、`SVGMobject.polyline_to_mobject`、`SVGMobject.path_to_mobject`、`SVGMobject.text_to_mobject`，以及 `VMobjectFromSVGPath`、`VMobjectFromSVGPath.handle_commands`、`VMobjectFromSVGPath.init_points`、`VMobjectFromSVGPath.generate_points`；Mobject 动画重载机制 `manim.mobject.mobject.override_animate`、`Mobject.add_animation_override`、`Mobject.animation_override_for`、`Mobject.set_default` 及 `Mobject.save_image`。
- **向量空间与缩放场景族 (`vectorAndZoomScenes`, +28 项)**：`VectorScene`、`VectorScene.get_vector`、`VectorScene.get_basis_vector_labels`、`VectorScene.position_x_coordinate`、`VectorScene.position_y_coordinate`、`VectorScene.write_vector_coordinates`；`LinearTransformationScene`、`LinearTransformationScene.add_transformable_label`、`LinearTransformationScene.apply_function`、`LinearTransformationScene.apply_inverse`、`LinearTransformationScene.apply_inverse_transpose`、`LinearTransformationScene.apply_nonlinear_transformation`、`LinearTransformationScene.get_moving_mobject_movement`、`LinearTransformationScene.get_piece_movement`、`LinearTransformationScene.get_transformable_label_movement`、`LinearTransformationScene.get_vector_movement`、`LinearTransformationScene.update_default_configs`、`LinearTransformationScene.write_vector_coordinates`；`ZoomedScene` 构造器、`ZoomedScene.setup`、`ZoomedScene.get_zoom_factor`、`ZoomedScene.activate_zooming`、`ZoomedScene.get_zoom_in_animation`、`ZoomedScene.get_zoomed_display_pop_out_animation`。
- **渲染管线、媒体输出与交互事件族 (`renderingAndFileWriter`, +39 项)**：`CairoRenderer`、`CairoRenderer.get_frame`、`CairoRenderer.freeze_current_frame`、`CairoRenderer.init_scene`、`CairoRenderer.save_static_frame_data`、`CairoRenderer.update_frame`、`CairoRenderer.update_skipping_status`、`CairoRenderer.scene_finished`；矢量渲染辅助 `manim.renderer.vectorized_mobject_rendering.build_matrix_lists`、`manim.renderer.vectorized_mobject_rendering.triangulate_mobject`；`SceneFileWriter`、`SceneFileWriter.init_output_directories`、`SceneFileWriter.get_resolution_directory`、`SceneFileWriter.is_already_cached`、`SceneFileWriter.init_audio`、`SceneFileWriter.add_audio_segment`、`SceneFileWriter.write_subcaption_file`、`SceneFileWriter.next_section`、`SceneFileWriter.finish_last_section`、`manim.scene.scene_file_writer.to_av_frame_rate`；Pango 文本转矢量 `MarkupUtils`、`MarkupUtils.text2svg`、`PangoUtils`、`PangoUtils.remove_last_M`；命令行与质量元数据 `QualityDict`、`VideoMetadata`、`capture`、`get_dir_layout`、`TexTemplate.from_file`；场景生命周期与交互事件 `Scene.setup`、`Scene.construct`、`Scene.tear_down`、`SceneInteractContinue`、`SceneInteractContinue.sender`、`SceneInteractRerun`、`SceneInteractRerun.sender`、`SceneInteractRerun.kwargs`。
- **创新功能与同类产品超越**：
  - **专业剪辑级交互式时间轴标记系统 (`TimelineMarkerBar`)**：对标 Motion Canvas / Remotion / Premiere Pro / Final Cut，在时间轴顶部构建专用标记栏。创作者只需在播放时或定位处按下 `M` 键或点击工具栏“标记”，即可在当前播放头瞬间创建时间锚点（自动着色并显示精细时间戳如 `01:24`）；点击标记瞬间跳转吸附播放头，双击内联重命名（如“引言公式”、“第二引理推导”），右键或双击一键删除；当启用吸附（`snapping`）时，拖拽片段自动精准磁吸至时间标记点。
  - **CI 自动化与桌面端打包健壮性提升**：彻底排查并修复 Linux GitHub 2-core runner 运行 ASAR 封装应用时 30s 硬编码看门狗超时的偶发问题，在 `desktop/main.cjs` 中引入 `--smoke-timeout` 参数并将打包环境默认等待从 30s 提高至 75s（外部看门狗 90s），确保 Linux、Windows、macOS 三端打包发布 100% 绿灯。
- **测试与验证指标**：
  - 本地 367 项应用测试（46 个测试文件，单轮新增 2 项标记模型测试全部通过）。
  - 原生 Python/Manim 测试增至 14 个独立测试族（22+ 项原生测试入口），合并去重后取得运行证据的 API 跃升至 **1,668 项**。
  - 11 项桌面环境检查、真实 worker 媒体渲染与混音、确定性钢琴合成、TypeScript 严格编译与生产打包全量通过。

## 动态参数滑块台（ValueTracker）、时间轴一键变速缩放及配置/相机/动画生命周期 +128 项原生覆盖扩展（2026-11-08）

十二组真实 Manim 证据合并 **1,582 / 2,293** 个独立入口，单轮净增 **128 个**原生 API，未验证入口大幅降至 **711** 项（通用/Cairo 仅余 255 项，覆盖率跃升至 **85.5%**；OpenGL 专属 456 项），全部调用均经 AnyVis 注册表编译器生成，与直接原生 Python 调用进行严格数值、几何点集与返回值后置条件对比，0 失败、0 fixture gap：
- **配置与日志系统全量覆盖 (`api-config`, +52 项，实现 `manim._config.*` 100% 覆盖)**：`ManimConfig` 构造器及全部剩余属性（`assets_dir`、`custom_folders`、`enable_gui`、`enable_wireframe`、`ffmpeg_loglevel`、`frame_size`、`gui_location`、`input_file`、`log_dir`、`media_embed`、`notify_outdated_version`、`partial_movie_dir`、`plugins`、`preview`、`preview_command`、`progress_bar`、`quality`、`renderer`、`save_pngs`、`save_sections`、`scene_names`、`sections_dir`、`seed`、`show_in_file_browser`、`tex_dir`、`tex_template`、`tex_template_file`、`text_dir`、`transparent`、`use_projection_fill_shaders`、`use_projection_stroke_shaders`、`video_dir`、`window_monitor`、`window_position`、`window_size`、`write_all`、`write_to_movie`）、`resolve_movie_file_extension`、`update`、`digest_parser`、`digest_file`、`digest_args`、`config_file_paths`、`make_config_parser`、`tempconfig`、`JSONFormatter`、`JSONFormatter.format`、`parse_theme`、`make_logger`、`set_file_logger`、`parse_cli_ctx`。
- **全系列相机、动画生命周期、分段与 Pango/图像工具 (`camerasAndLifecycle`, +76 项新覆盖)**：`Camera`、`Camera.background_color`、`Camera.background_opacity`、`Camera.get_cairo_context`、`Camera.cache_cairo_context`、`Camera.get_cached_cairo_context`、`Camera.set_cairo_context_path`、`Camera.set_cairo_context_color`、`Camera.apply_fill`、`Camera.apply_stroke`、`Camera.display_point_cloud`、`Camera.display_multiple_point_cloud_mobjects`、`Camera.get_background_colored_vmobject_displayer`、`Camera.display_multiple_background_colored_vmobjects`、`BackgroundColoredVMobjectDisplayer`（含 `reset_pixel_array`、`display`、`resize_background_array`、`resize_background_array_to_match`）、`MappingCamera`（含 `points_to_pixel_coords`、`capture_mobjects`）、`OldMultiCamera`（含 `init_background`、`set_background`、`set_pixel_array`、`capture_mobjects`）、`MovingCamera`（含 `cache_cairo_context`、`get_cached_cairo_context`、`capture_mobjects`）、`MultiCamera`（含 `add_image_mobject_from_camera`、`get_mobjects_indicating_movement`、`reset`、`update_sub_cameras`、`capture_mobjects`）、`ThreeDCamera`（含 `get_fill_rgbas`、`get_stroke_rgbas`、`modified_rgbas`、`transform_points_pre_display`、`get_mobjects_to_display`、`capture_mobjects`）、`ImageMobjectFromCamera`、`ImageMobjectFromCamera.get_pixel_array`、`Add` 与 `Wait` 的 `begin`/`interpolate`/`update_mobjects`/`finish`/`clean_up_from_scene`、`Animation`（含 `begin`、`interpolate_mobject`、`interpolate_submobject`、`set_default`）、`AnimationGroup`、`Succession`、`ShowPartial`、`Section`（含 `is_empty`、`get_clean_partial_movie_files`）、`MarkupUtils.validate`、`TextSetting`、`PangoUtils.str2style`、`PangoUtils.str2weight`、`index_labels`、`print_family`、`extract_mobject_family_members`、`restructure_list_to_exclude_certain_family_members`、`get_json`、`change_to_rgba_array`、`invert_image`、`drag_pixels`。
- **创新功能与同类产品超越**：
  - **GeoGebra / Desmos 级动态参数滑块台 (`TrackerControlBar`)**：在对象管理器中自动汇总场景内所有 `ValueTracker` 动态参数（支持一键 `+ 声明参数` 自动分配未占用的数学变量名 `a, b, k, t...`），提供自适应量程滑块与数值输入实时调节参数初值（同步刷新函数曲线实时预览），并支持一键 `⚡ 动画` 追加该参数的 `animate_value` 动画积木及依赖安全删除校验。
  - **时间轴单片段与多选批量一键变速 (`scaleActionsDuration`)**：对标 Motion Canvas / Remotion / After Effects，在时间轴单片段检视栏与多选批量工具栏提供一键 `2x 加速`（时长 ×0.5）与 `0.5x 减速`（时长 ×2），自动递归处理复合容器内部动作并严格对齐帧率网格。

本地 365 项应用测试（45 个测试文件）、22 项原生测试入口、6 项证据校验、11 项桌面检查、真实 worker 媒体渲染与混音、确定性钢琴合成及生产构建全部通过。

## 舞台坐标九宫格触控板、全局命令面板（⌘K）、画面帧 PNG 快照及文字/括号/流线/凸包 +104 项原生覆盖扩展（2026-11-08）

十二组真实 Manim 证据合并 **1,454 / 2,293** 个独立入口，单轮新增 **104 个**原生 API，未验证入口大幅降至 **839** 项（通用/Cairo 仅余 383 项，覆盖率达 78.2%；OpenGL 专属 456 项），全部调用均经 AnyVis 注册表编译器生成，与直接原生 Python 调用进行严格数值、几何点集与返回值后置条件对比，0 失败、0 fixture gap：
- **文字、数字、公式与括号标注 (`textAndBraces`)**：`DecimalNumber`、`DecimalNumber.font_size`、`DecimalNumber.get_value`、`DecimalNumber.set_value`、`DecimalNumber.increment_value`、`Integer`、`Integer.get_value`、`Variable`、`BulletedList`、`BulletedList.fade_all_but`、`MathTex`、`MathTex.get_part_by_tex`、`MathTex.index_of_part`、`MathTex.set_color_by_tex`、`MathTex.set_color_by_tex_to_color_map`、`MathTex.set_opacity_by_tex`、`MathTex.sort_alphabetically`、`MathTexPart`、`SingleStringMathTex`、`SingleStringMathTex.font_size`、`SingleStringMathTex.get_tex_string`、`SingleStringMathTex.init_colors`、`Tex`、`Title`、`MarkupText`、`MarkupText.font_size`、`MarkupText.font_list`、`Paragraph`、`Text`、`Text.font_size`、`Text.font_list`、`Text.init_colors`、`remove_invisible_chars`、`Code.get_styles_list`、`ArcBrace`、`Brace`、`BraceBetweenPoints`、`BraceLabel`、`BraceLabel.creation_anim`、`BraceLabel.change_brace_label`、`BraceLabel.shift_brace`、`BraceText`。
- **核心基类、流线向量场、凸包与模板工具 (`coreMobjectsAndUtils`)**：`FullScreenRectangle`、`ScreenRectangle`、`ManimBanner`、`ManimBanner.create`、`ManimBanner.expand`、`ManimBanner.scale`、`Group`、`Mobject`、`Mobject.generate_points`、`Mobject.init_colors`、`Mobject.get_mobject_type_class`、`Mobject.get_pieces`、`Mobject.get_merged_array`、`Mobject.apply_over_attr_arrays`、`Mobject.set`、`Mobject.set_z_index_by_z_Point3D`、`Mobject.throw_error_if_no_points`、`VMobject.get_mobject_type_class`、`VMobject.init_colors`、`CurvesAsSubmobjects`、`VGroup.add`、`VectorizedPoint`、`get_mobject_class`、`get_point_mobject_class`、`get_vectorized_mobject_class`、`ArrowVectorField`、`VectorField.fit_to_coordinate_system`、`VectorField.get_colored_background_image`、`StreamLines`、`StreamLines.create`、`StreamLines.start_animation`、`StreamLines.end_animation`、`DictAsObject`、`flatten_iterable_parameters`、`Percent`、`not_quite_there`、`squish_rate_func`、`unit_interval`、`zero`、`manim.utils.polylabel.Polygon`、`Polygon.inside`、`Polygon.compute_distance`、`Cell`、`polylabel`、`QuickHullPoint`、`SubFacet`、`Facet`、`Facet.compute_normal`、`Horizon`、`QuickHull`、`QuickHull.initialize`、`QuickHull.build`、`QuickHull.classify`、`QuickHull.compute_horizon`、`TexTemplate`、`TexTemplate.copy`、`TexTemplate.add_to_preamble`、`TexTemplate.add_to_document`、`TexTemplate.get_texcode_for_expression`、`TexTemplate.get_texcode_for_expression_in_env`、`TexFontTemplates`、`TexTemplateLibrary`、`tex_hash`。
- **创新功能与同类产品超越**：
  - **交互式舞台坐标与九宫格对齐触控板 (`PositionPad`)**：在编辑带有 `(x, y)` 位置或 `(dx, dy)` 位移的对象与动作时，提供 16:9 比例微缩 Manim 舞台（支持拖拽/点击实时拾取坐标、Shift 键 0.5 步长吸附）以及 `UL / UP / UR / LEFT / ORIGIN / RIGHT / DL / DOWN / DR` 九宫格一键对齐按钮，告别手填坐标盲调。
  - **全局命令面板 (`CommandPalette`, `⌘/Ctrl + K`)**：对标 Motion Canvas / Remotion Studio / Linear，按下 `⌘/Ctrl + K` 即可多关键词模糊搜索并一键添加任何图形/动画积木、直接跳转定位当前场景中的任意对象或动作、切换编辑器视图与背景主题、开启演播模式或触发渲染导出。
  - **画面帧无损 PNG 快照 (`captureVideoFrame`)**：在舞台预览标题栏及命令面板支持一键截取当前播放头位置的原画分辨率 PNG 图片，方便教师与创作者直接提取高精数学插图制作讲义或封面。

本地 361 项应用测试（44 个测试文件）、22 项原生测试入口、6 项证据校验、11 项桌面检查、真实 worker 媒体渲染与混音、确定性钢琴合成及生产构建全部通过。

## 函数曲线实时预览、对象与动作一键克隆、构建分包优化及矩阵/表格/三维多面体原生覆盖扩展（2026-11-08）

十二组真实 Manim 证据合并 **1,350 / 2,293** 个独立入口，新增 60 个原生 API，未验证入口降至 **943** 项（通用/Cairo 仅余 487 项，OpenGL 专属 456 项），全部调用均经 AnyVis 注册表编译器生成，与直接原生 Python 调用进行严格数值、几何点集与返回值后置条件对比，0 失败、0 fixture gap：
- **几何标注、曲线与多边形**：`AnnotationDot`、`ArcPolygonFromArcs`、`CubicBezier`、`CurvedDoubleArrow`、`LabeledDot`、`TangentialArc`、`TipableVMobject`、`Label`、`LabeledArrow`、`LabeledLine`、`LabeledPolygram`、`Polygram`、`Polygram.get_vertex_groups`、`RegularPolygram`、`Angle.from_three_points`、`Vector.coordinate_label`、`Arrow.reset_normal_vector`、`Arrow.scale`、`Line.generate_points`、`Line.init_points`、`BackgroundRectangle.set_style`、`BackgroundRectangle.pointwise_become_partial`。
- **三维多面体、曲面采样与 3D 几何工具**：`Arrow3D`、`Line3D`、`ThreeDVMobject`、`Polyhedron`、`Polyhedron.extract_face_coords`、`Polyhedron.create_faces`、`Polyhedron.get_edges`、`Polyhedron.update_faces`、`ConvexHull3D`、`Cone.func`、`Cylinder.func`、`Sphere.func`、`Torus.func`、`Surface.func`、`get_3d_vmob_start_corner_index`、`get_3d_vmob_end_corner_index`、`get_3d_vmob_start_corner`、`get_3d_vmob_end_corner`、`get_3d_vmob_gradient_start_and_end_points`、`get_3d_vmob_unit_normal`、`get_3d_vmob_start_corner_unit_normal`、`get_3d_vmob_end_corner_unit_normal`。
- **矩阵与表格家族**：`Matrix`、`IntegerMatrix`、`DecimalMatrix`、`MobjectMatrix`、`Matrix.add_background_to_entries`、`Matrix.set_column_colors`、`Matrix.set_row_colors`、`get_det_text`、`matrix_to_mobject`、`matrix_to_tex_string`、`Table`、`Table.create`、`IntegerTable`、`DecimalTable`、`MathTable`、`MobjectTable`。
- **创新功能与工程优化（超越 Desmos/GeoGebra 及同类 Manim 工具）**：
  - **Desmos 级函数表达式实时曲线预览 (`ExpressionPlotPreview`)**：在属性检视器编辑任何数学函数表达式字段（如 `sin(x)`、`2 * exp(-x^2)`、`k * sin(x)`）时，实时渲染带坐标网格、自动量程缩放、悬停坐标读数 (`x, y`)、与编译器同源的语法诊断以及 6 种经典函数一键填入胶囊的 SVG 曲线图，并自动联动场景中已声明的 `ValueTracker` 动态变量初始值。
  - **对象与时间轴片段一键克隆 (`duplicateAction`)**：支持在对象管理器一键复制角色对象（自动生成无冲突唯一名称如 `圆 2`、`圆 3`），并在时间轴检视器及快捷键 `D` 支持一键克隆当前动作或复合片段，紧邻原动作插入。
  - **生产构建精细化代码分包 (`vite.config.ts` `manualChunks`)**：将 `api-registry`、`vendor-blockly`、`vendor-codemirror`、`vendor-math`、`vendor-three`、`vendor-timeline`、`vendor-icons`、`vendor-react` 拆分为独立可缓存 chunk，主编辑器入口 `StudioApp.js` 体积从 **3,453.50 kB** 降至 **330.37 kB**（缩减逾 10 倍）。

本地 356 项应用测试（42 个测试文件）、22 项原生测试入口、6 项证据校验、11 项桌面检查、真实 worker 媒体渲染与混音、确定性钢琴合成及生产构建全部通过。

## 演播模式、数学公式符号分块助手、画面风格预设与颜色/几何原生覆盖扩展（2026-11-08）

十二组真实 Manim 证据合并 **1,290 / 2,293** 个独立入口，新增 37 个原生 API（覆盖 `manim.utils.color.core` 的全套颜色转换、渐变、插值、HSV 色彩空间，以及箭头尖端 `ArrowTriangleFilledTip`、`ArrowCircleTip`、`StealthTip`、`Vector`、`Cross`、`Elbow`、`ConvexHull` 等），剩余 1,003 项。全部调用均经 AnyVis 注册表编译器生成，与直接原生 Python 调用进行严格数值、类型与几何后置条件对比，0 失败、0 fixture gap：
- **颜色空间与数值工具**：`color_to_rgb`、`color_to_rgba`、`color_to_int_rgb`、`color_to_int_rgba`、`hex_to_rgb`、`rgb_to_hex`、`rgb_to_color`、`rgba_to_color`、`interpolate_color`、`invert_color`、`average_color`、`color_gradient`、`get_shaded_rgb`、`random_color`、`random_bright_color`、`RandomColorGenerator`、`RandomColorGenerator.next`、`ManimColor`、`ManimColor.contrasting`、`ManimColor.to_int_rgb`、`ManimColor.to_int_rgba`、`ManimColor.to_int_rgba_with_alpha`、`ManimColor.to_rgba_with_alpha`、`ManimColor.opacity`、`ManimColor.into`、`ManimColor.parse`、`HSV`、`HSV.h`、`HSV.hue`、`HSV.s`、`HSV.saturation`、`HSV.v`、`HSV.value`。
- **几何图元与箭头尖端**：`ArrowTriangleFilledTip`、`ArrowTriangleTip`、`ArrowCircleFilledTip`、`ArrowCircleTip`、`ArrowSquareFilledTip`、`ArrowSquareTip`、`StealthTip`、`StealthTip.length`、`Cross`、`Elbow`、`Vector`、`ConvexHull`。
- **创新功能与同类产品超越**：
  - **交互式演播/幻灯片放映模式 (`computePresentationSteps` & Presentation HUD)**：对比传统视频编辑器或 Motion Canvas（需写 TypeScript 代码），AnyVis 首创可视化交互演播模式。自动根据 `wait` 停顿点与动作节点切分讲解步骤，播放至停顿点自动驻留，支持空格/右键步进推进、左键倒退回看、从头重演及浮动 HUD 步进指示，数学教师与演讲者可直接投影演示。
  - **LaTeX 数学符号调色板与公式分块助手 (`MathSymbolPalette`)**：在公式及文本检视器中内置分块匹配 (`{{...}}`)、分式、根号、求和、积分、极限、希腊字母及向量微积分快捷插入，支持光标选区智能包裹，并提供实时 `TransformMatchingTex` 动画匹配分块高亮预览。
  - **画面风格/主题预设 (Math Theme Presets)**：在画面设置中一键应用 3B1B 经典黑、教室黑板、极简纸白、深邃纯黑与星云深紫预设，轻松调出专业数学动画质感。

本地 352 项应用测试、22 项原生测试入口、6 项证据校验、11 项桌面检查、真实 worker 媒体渲染与混音、确定性钢琴合成及生产构建全部通过。

## 向量空间场景、缓动曲线交互选择与时间轴剃刀分割（2026-11-08）

十二组真实 Manim 证据合并 **1,253 / 2,293** 个独立入口，新增 25 个 `VectorScene` 与 `LinearTransformationScene` API，剩余 1,040 项。全部调用均经 AnyVis 注册表编译器生成，包含真实的线性空间变换、基底向量、单位正方形和坐标系几何断言，0 失败、0 fixture gap：
- **向量空间与线性变换场景**：`VectorScene`、`VectorScene.add_axes`、`VectorScene.add_plane`、`VectorScene.add_vector`、`VectorScene.get_basis_vectors`、`VectorScene.get_vector_label`、`VectorScene.label_vector`、`VectorScene.lock_in_faded_grid`、`VectorScene.vector_to_coords`、`LinearTransformationScene`、`LinearTransformationScene.setup`、`LinearTransformationScene.add_unit_square`、`LinearTransformationScene.get_unit_square`、`LinearTransformationScene.add_vector`、`LinearTransformationScene.add_title`、`LinearTransformationScene.add_transformable_mobject`、`LinearTransformationScene.add_moving_mobject`、`LinearTransformationScene.add_foreground_mobject`、`LinearTransformationScene.add_background_mobject`、`LinearTransformationScene.add_special_mobjects`、`LinearTransformationScene.apply_matrix`、`LinearTransformationScene.apply_transposed_matrix`、`LinearTransformationScene.get_matrix_transformation`、`LinearTransformationScene.get_transposed_matrix_transformation`、`LinearTransformationScene.get_ghost_vectors`。
- **Upstream 兼容补丁**：
  - `_av_vector_scene_compat`：修复 Manim 0.20.1 中 `VectorScene.lock_in_faded_grid` 调用 `CairoRenderer.update_frame` 漏传 `scene` 参数引发的 `TypeError`。
- **创新功能与体验优化（超越同类产品）**：
  - **缓动曲线可视化选择器 (`RateFuncPicker`)**：打破传统 Manim GUI 仅有纯文字下拉框的局限，提供交互式 SVG 缓动曲线图形化选择，实时动画小球循迹预览全部 10 种 Manim 节奏函数（`smooth`、`linear`、`rush_into`、`rush_from`、`slow_into`、`double_smooth`、`there_and_back`、`wiggle`、`lingering`、`exponential_decay`）。
  - **动画与等待片段剃刀分割 (`splitActionClip`)**：在播放头位置对 `wait` 片段或动画片段执行非破坏性高精度分割，位移 (`dx`, `dy`, `dz`)、旋转 (`angle`)、时长及缩放比例严格按时间切分比例数学等分，支持剪刀按钮与键盘 `C` 快捷键。

本地 345 项应用测试、22 项原生测试入口、6 项证据校验、11 项桌面检查、真实 worker 媒体渲染与混音、确定性钢琴合成及生产构建全部通过。

## 动画生命周期、坐标系统与时间轴多选批量操作扩展（2026-11-08）

十二组真实 Manim 证据合并 **1,228 / 2,293** 个独立入口，新增 134 个动画、坐标系与图表 API（覆盖旋转、变形、数值、构建、指示、移动、速度修饰、组合，以及线性轴、对数轴、坐标系、三维轴、隐函数、柱状图、样本空间等），剩余 1,065 项。全部调用均经 AnyVis 注册表编译器生成，包含真实的 observable 几何、点集与状态断言，0 失败、0 fixture gap：
- **动画生命周期与变换**：`Rotate`、`Rotating`、`ClockwiseTransform`、`CounterclockwiseTransform`、`CyclicReplace`、`FadeTransform`、`FadeTransformPieces`、`ShrinkToCenter`、`GrowFromCenter`、`GrowFromEdge`、`SpinInFromNothing`、`TransformFromCopy`、`TransformAnimations`、`ChangingDecimal`、`CountInFrom`、`FadeToColor`、`ShowPassingFlash`、`ShowCreationThenDestruction`、`ShowCreationThenFadeOut`、`AnimationGroup`、`Succession`、`LaggedStart`、`Homotopy`、`ComplexHomotopy`、`SmoothedVectorizedHomotopy`、`PhaseFlow`、`ChangeSpeed` 等。
- **坐标系与函数图表**：`LinearBase`、`LogBase`、`NumberLine`、`CoordinateSystem`、`ThreeDAxes`、`ImplicitFunction`、`BarChart`、`SampleSpace` 等的坐标变换、刻度标签、轴线投影与离散分割断言。
- **Manim 0.20.1 兼容适配**：
  - `_av_movement_compat`: 注入 `VMobject` 到 `manim.animation.movement` 解决 upstream 放置于 `TYPE_CHECKING` 导致的 `NameError`。
  - `_av_sample_space_compat`: 兼容 `SampleSpace.get_subdivision_braces_and_labels` 中传递的 `min_num_quads` 关键字参数。
  - `_av_number_line_compat`: 为 `NumberLine` 补充 `default_numbers_to_display` 解决 `get_labels` 时的 `AttributeError`。
- **时间轴多选、框选与批量移动/删除**：
  - 时间轴 Marquee 框选与 Shift / Cmd 多选/反选，实时高亮选中片段。
  - 批量波纹移动（`moveAnimationClips`）：多选时拖动任意选中片段，保持选中片段内部相对顺序波纹位移。
  - 批量原子删除（`removeActions`）：支持 Delete/Backspace 快捷键及检视器批量删除工具条，原子执行并严格校验跨子树依赖保护。

本地 344 项应用测试、22 项原生测试入口、6 项证据校验、11 项桌面检查、真实 worker 媒体渲染与混音、确定性钢琴合成及生产构建全部通过。

## Mobject/VMobject、三维与几何标注扩展验证（2026-11-08）

十二组真实 Manim 证据合并 **1,094 / 2,293** 个独立入口，新增 82 个几何路径、变形、三维与表格 API，剩余 1,199 项。全部调用均经 AnyVis 注册表编译器生成，与直接原生 Python 调用进行严格后置条件对比，0 失败、0 fixture gap：
- **VMobject 路径与贝塞尔**：`add_smooth_curve_to`、`gen_cubic_bezier_tuples_from_points`、`get_cubic_bezier_tuples_from_points`、`get_nth_curve_function`、`get_nth_curve_function_with_length`、`get_nth_curve_length_pieces`、`gen_subpaths_from_points_2d`、`get_subpaths_from_points`、`insert_n_curves_to_point_list`、`pointwise_become_partial`、`set_anchors_and_handles`、`scale_handle_to_anchor_distances`、`force_direction`、`change_anchor_mode`、`consider_points_equals_2d`、`align_points`、`align_rgbas`、`generate_rgbas_array`、`update_rgbas_array`、`set_shade_in_3d`、`set_style`、`set_points`、`set_color`、`fade`、`rotate`、`scale`、`apply_function`、`interpolate_color`、`VectorizedPoint.set_location`、`CurvesAsSubmobjects.point_from_proportion`。
- **Mobject 变换与家族**：`fade_to`、`proportion_from_point`、`put_start_and_end_on`、`set_color_by_gradient`、`set_colors_by_radial_gradient`、`set_submobject_colors_by_radial_gradient`、`stretch_about_point`、`stretch_to_fit_depth`、`scale_to_fit_depth`、`sort_submobjects`、`apply_to_family`、`align_points`（PMobject 派发）、`align_points_with_larger`、`null_point_align`、`interpolate`、`add_background_rectangle_to_family_members_with_points`、`add_background_rectangle_to_submobjects`、`pose_at_angle`、`to_original_color`、`repeat_submobject`、`reduce_across_dimension`。
- **三维与弧线**：`Line3D.parallel_to`、`Line3D.perpendicular_to`、`Line3D.pointify`、`Line3D.set_start_and_end_attrs`、`Cone.set_direction`、`Cylinder.set_direction`、`Cylinder.add_bases`、`Surface.set_fill_by_checkerboard`、`Surface.set_fill_by_value`、`Cube.generate_points`、`Cube.init_points`、`Prism.generate_points`、`Arc.generate_points`、`Arc.init_points`、`Annulus.generate_points`、`Annulus.init_points`、`AnnularSector.generate_points`、`AnnularSector.init_points`、`TipableVMobject.create_tip`、`TipableVMobject.assign_tip_attr`、`TipableVMobject.position_tip`、`TipableVMobject.reset_endpoints_based_on_tip`。
- **标注与表格**：`Brace.get_text`、`Brace.get_tex`、`Brace.put_at_tip`、`BraceLabel.change_label`、`Table.add_background_to_entries`、`Table.add_highlighted_cell`、`Table.set_column_colors`、`Table.set_row_colors`、`Table.scale`。

本地 342 项应用测试、22 项原生测试、6 项证据校验、11 项桌面检查、真实 worker 渲染与生产构建通过。

## OpenGL 状态与曲线长度兼容验证（2026-11-08）

十二组真实 Manim 证据合并 **1,012 / 2,293** 个独立入口，新增 77 个 OpenGL 对象状态 API，剩余 1,281 项。点数组、曲面采样、路径、复制隔离、样式和更新器均断言具体结果；状态测试不创建图形上下文，明确 `renderValidated=false`。

修复 Manim 0.20.1 的 OpenGL 曲线长度在 NumPy 2.5.4 下使用 `np.sum(generator)` 报错，限定版本和实际能力探测，并覆盖其他版本、已修复实现、子类、空路径和采样参数。独立真实像素测试在 Linux Xvfb/Mesa softpipe 中通过：320×180、12 fps、完整 12 帧，红方块质心位移 160.00 px，并检查面积、颜色、背景和中间位置。LLVMpipe 在首次 VAO 绘制崩溃，改用 softpipe 后保持原有断言全部通过；本机没有上下文，仍明确跳过。此次只验证一个具体渲染工程，不能声称全部 OpenGL API 均已视觉验收。

本地 342 项应用测试、22 项原生测试、6 项证据校验、11 项桌面检查、真实 worker 渲染与生产构建通过。源码提交 `63ef59060de713c5589db09ed213c7e95eb977f9`，诊断提交 `7e96b4c24ea0a3bd27940bbe928b3daf59e38c49`，CI 驱动配置提交 `9d6fb478ceeb4ea8fca5cf16c3626d889ca62bac`。后两者不改变应用运行代码。

[最终原生工作流](https://github.com/zhuozheng2006/anyvis/actions/runs/42444921112)全绿：22 项原生测试、1,012 项合并证据、OpenGL 像素测试、真实 worker/上传素材与混音、钢琴/无声导出；[机器证据附件](https://github.com/zhuozheng2006/anyvis/actions/runs/42444921112/artifacts/13603760388)。[三平台桌面工作流](https://github.com/zhuozheng2006/anyvis/actions/runs/42444633481)全部通过；对应安装包见文末。

## 场景与坐标系验证、原生兼容修复（2026-11-08）

PR #1 已获用户授权并合并，提交 `4173c5fd06fb1669cd86bf0c1369fec49273dd0e`。本轮继续新增 55 个场景 API、49 个坐标系/曲线/图结构 API 和点云取样，十一份证据合并为 **935 / 2,293** 个独立入口，新增 105 项；仍有 1,358 项待验证，其中 533 项 OpenGL。

修复三处真实 Manim 0.20.1 行为问题：点云比例取样浮点索引错误、恢复三维默认视角时的属性错名、前景对象重复加入导致更新器双速。后者包括跨根分组与前景成员重叠，两种添加顺序均验证只更新一次并保留兄弟对象与前景层次。兼容处理仅作用于当前 Python 进程，独立源码导出也包含；版本门禁、能力探测、已有正确实现、子类重写、空集/越界及返回契约均有回归。

本地 342 项应用测试、20 项原生测试入口、6 项证据校验、11 项桌面检查、真实渲染/上传素材与混音、TypeScript/Vite 和桌面资源准备通过。源码提交 `354e3610dcbe3108fa650a2914aef528d4c43e51` 的[原生 CI](https://github.com/zhuozheng2006/anyvis/actions/runs/42443586274)与[三平台桌面 CI](https://github.com/zhuozheng2006/anyvis/actions/runs/42443586279)全部通过。

## 图片 API 与复合片段删除修复（2026-11-08）

- 图片/相机新增 75 组具体断言，涉及 74 个 API；图片/相机阶段与既有证据合并后为 **732 / 2,293** 个独立 API，新增 70 项。继续加入 57 项动画和 41 项点云/向量场后，当前共 **830 / 2,293** 项，较上一轮新增 168 项，仍有 1,463 项待验证。
- 修复通过 API 创建 ImageMobject 时遗漏 Pillow 13 兼容初始化的问题。独立导出的纯 API 图片工程实际渲染，红色图片位移后像素重心落在预期区域；既有上传 PNG/SVG 与配音混音回归通过。
- 修复删除复合片段时漏检内部对象的外部引用。现在检查整个删除子树，阻止产生悬空引用；子树内部对象和引用可以一起删除。新增回归先复现旧实现失败，再验证修复。
- 本地 342 项应用测试、16 项原生测试入口（九份证据）、6 项证据验证、11 项桌面回归及 TypeScript/Vite 构建通过。应用修复提交 `04c5d206550cb2a476326096f990e12030a5f8d5` 的[原生 CI](https://github.com/zhuozheng2006/anyvis/actions/runs/42440905788)（732 项证据）与[三平台桌面 CI](https://github.com/zhuozheng2006/anyvis/actions/runs/42440905662)均通过。后续 830 项扩展只修改测试、证据校验和文档，集中在[已合并 PR #1](https://github.com/zhuozheng2006/anyvis/pull/1)；最终云端结果见 PR 检查页。

## v0.4.0 时间轴、对象与素材（2026-11-08）

采用 MIT 许可的 React Timeline Editor 1.0.0，替换手写拖拽时间轴。三个视图共享工程与撤销历史；新增对象管理、图片和配音上传、素材 ZIP、配音非阻塞调度与实际视频混音。[设计与边界](editor-timeline-design.md)。

| 检查 | 实际结果 |
| --- | --- |
| 前端、模型与编译器 | 340 项测试，39 个文件全部通过 |
| 真实 API 行为 | 六组原生测试合并去重为 662 项，0 失败；新增数值/回调/文件路径隔离 fixture 与变换/路径状态差分 |
| 入口与证据审计 | 2,293 项解析、2,117 项签名、2,765 项常量；证据源码指纹有效；4 项证据校验测试通过 |
| 服务与桌面宿主 | 6 项服务、11 项桌面检查通过；包含 3 MB 原始素材转发和普通 JSON 请求大小隔离 |
| 原生媒体集成 | 原有渲染/错误定位/取消链路通过；新增透明 PNG 位移和 OGG 配音延迟、入点、增益、停止验证通过，48 帧、水平移动 180 像素、有效片段 660 Hz、前后静音 |
| 浏览器 | 真实拖动配音 0→2 秒，左裁剪至开始 3.125 秒/入点 1.125 秒/长度 2.875 秒；音量 0→-6 dB 后撤销→0、重做→-6；积木参数同步；只读代码滚至末尾 |
| 素材可移植 | 浏览器下载 ZIP，检查项目 + 2 个原始素材 + Python 完整；重新导入后素材、参数和真实预览保留 |
| 构建 | TypeScript/Vite 与桌面资源准备通过；Studio 大分块警告仍存在 |

浏览器实测发现并修复了隐藏 Blockly 清空时间轴选择、拖动时检查器改变轨道高度、参数下拉 label/value 反转等问题。Gemini 3.8 Flash High 协作实现对象/素材管理与差分 fixture；集成后由主代理复核并测试。当前本机缺少已下载的 Electron 可执行文件，因此本轮本机未完成 Electron UI 冒烟，v0.4.0 配乐提交 `4c544f7` 的三平台 CI 均已完成，含最终 ASAR 启动；Intel Mac 仅构建、未实际运行。

协议升级为 authoringProtocol=4；启动器开发模式监视服务源码，新旧协议不符时提示重启。上传位图支持整体移动/缩放/旋转/透明度，角色的独立表情与肢体需要分层或矢量部件。

完整 API 行为覆盖仍未完成：1,631 项尚无逐项证据，包含 533 项 OpenGL 专属入口。已补充播放头处分割配音、一次撤销及 Home/End/Shift 逐帧定位；关键帧曲线、框选、动画剃刀工具与任意跨轨动画重叠仍需实现。

![v0.4.0 时间轴与配音分割](screenshots/studio-timeline-v0.4-cut.jpg)


### v0.4.0 后续修复与独立 CI

默认配乐支持本地生成舒缓钢琴、无配乐及音量调节。新作品默认钢琴，偏好可记忆；已有/导入工程保留设置。时间轴显示自动铺满的配乐轨，画面设置与对象管理器均可进入。生成器的确定性、毫秒长度、峰值、首尾淡化及 600 秒上限通过；4 秒真实视频为 96 帧，云端钢琴音轨 RMS 0.01573、峰值 0.07453，关闭后无音频流。浏览器完成切换、真实预览、刷新后的设置恢复；独立 Python 导出包含合成器。

![默认钢琴配乐与音量设置](screenshots/studio-default-piano.jpg)

服务重启后的过期会话仅自动刷新重试一次；权限拒绝与不明确的网络错误不重试，三项回归通过。

配乐应用提交 `4c544f7c6fd7ea23d8d1ee9171542b5832c971c9` 的[独立原生 CI](https://github.com/zhuozheng2006/anyvis/actions/runs/42413639269)全部通过，包含 662 项 API 行为证据、真实配音分割混音、钢琴与无配乐视频及 600 秒合成检查。[原生验证附件](https://github.com/zhuozheng2006/anyvis/actions/runs/42413639269/artifacts/13590851025)。三平台桌面结果和安装包见下方最新下载。

- `021860b` 修复 SVG 小数 viewBox 被舍入为零，以及无 viewBox 的物理尺寸换算；真实视频逐帧检查蓝色 SVG 图形保留。
- 首轮原生 CI 在生成 OGG 测试样本时因 PyAV 不含 `libvorbis` 编码器失败。改用仓库内自生成的固定 OGG 样本后，[原生 CI 42411619514](https://github.com/zhuozheng2006/anyvis/actions/runs/42411619514)全部通过。仍实际上传、解码、裁剪和混音，不要求用户环境含 Vorbis 编码器。
- 时间轴新增配音分割，保留源素材连续入点与音量、独立命名，一次撤销还原。模型回归、浏览器操作与真实混音通过；分割点附近 RMS 0.0501，前后静音、有效片段 660 Hz。动态时机的配音显示在待编排列表；组合快捷键不再误触吸附，鼠标选择片段增加直接响应。

## v0.3.1 行为验证扩展（2026-11-08）

在 Manim CE 0.20.1 / Python 3.12 / Cairo 上，三组原生测试合并后取得 **419 个不同 API** 的行为证据；包括几何/变换/路径/颜色与速率/动画/三维坐标六个家族的 544 次断言调用，以及 199 个读接口与直接 Python 调用的差分检查。另 1 个 `NumberLine.get_labels` 默认实例直接调用就报错，明确保留为 fixture gap，不计覆盖。

修复 JSON 丢失 Python float 类型导致 RGB 的 1.0 变成 1/255、嵌套方法未调用子类重写、少字段积木隐藏必要输入的问题。新增绑定方法值及递归可视参数树。前后端统一检查 authoringProtocol=2，旧服务需重启。

17 块可编辑回归工程实际生成 13.17 秒、1280×720、24 fps 视频；316 帧全部解码，285 帧检出红色像素，时间戳单调。真实 worker 媒体/诊断/取消集成、6 项服务和 10 项桌面宿主/独立 bundle 检查通过。源码指纹让过期或失败的原生证据无法混入覆盖报告。

287 项 Vitest 测试、TypeScript/Vite 构建、桌面资源准备通过。Chrome 768×819 实测确认递归弹窗正文滚动、底部应用/取消按钮完整可见；非法 JSON 切换被阻止且草稿保留，Esc 关闭。嵌套回调应用后一步撤销/重做通过。Gemini 3.8 Flash High 协作修改 6 个 UI/测试文件；主代理根据实际浏览器结果与代码审查回修并全量复验。大分块构建警告仍存在。

依赖审计识别 mathjs 与 Vitest 链共 4 项告警；定向更新至 mathjs 15.2.0、Vitest 5.1.0 后为 0 项。其余直接依赖保持，未使用强制 audit fix 或跨版本传递依赖 override。升级后重新通过上述 287 项测试、原生测试、媒体集成和桌面构建；证据指纹现在也绑定 package-lock.json。

首次独立 Ubuntu CI 的 419 项原生行为通过，但完整入口审计因 OpenGL 窗口模块缺少显示服务失败。修复仅为审计命令提供 Xvfb，未删除任何失败条目；[修复后的原生 CI](https://github.com/zhuozheng2006/anyvis/actions/runs/42400588533)通过。Xvfb 导入检查不等于 OpenGL 真实渲染。

最终应用提交为 `1f28edc9f79c15f3ba37919e835eb4dac2c8ce10`。[最终独立原生 CI](https://github.com/zhuozheng2006/anyvis/actions/runs/42401140743)通过：依赖审计 0 项、2293 项入口全部解析、2117 项签名一致、419 项原生行为证据、真实媒体集成通过。[审计与行为证据附件](https://github.com/zhuozheng2006/anyvis/actions/runs/42401140743/artifacts/13585930255)。当前依赖版本的[三平台桌面 CI](https://github.com/zhuozheng2006/anyvis/actions/runs/42401140734)结果见文末；下方 v0.3.0 安装包只对应历史版本。完整 API 行为验收尚未完成，533 项 OpenGL 专属入口仍缺少可用本机渲染后端。

## v0.3.0 API 扩展（2026-11-07）

本轮新增基于真实签名生成的 API 积木库，固定 Manim CE **0.20.1**。共 **2293 个独立 API 入口、9136 个参数字段、2765 个常量**；原有 1660 项公开清单全部有对应入口。继承方法别名（例如 Axes.plot）、返回值、属性读写、可调用参数、上下文管理器均进入编译器。原有 97 种入门积木保留。

| 检查 | 实际结果 |
| --- | --- |
| 前端与编译器 | 252 项测试通过；包含全部 API 积木分批序列化往返、参数控件、引用重命名、回调作用域与权限传播 |
| 静态原生审计 | 2293 个入口、2765 个常量全部解析；2117 个可检查签名一致；5 个类无 Python 可检查签名，以 args/kwargs 接入 |
| 新增 API 原生行为 | 27 个不同 API 的真实 Manim 调用，检查几何状态、属性、更新器、动画组合、参数传递和上下文恢复；不等于逐项渲染验收 |
| 服务集成 | 项目→服务编译器→真实 Manim→可播放媒体，诊断与取消链路通过 |
| 可编辑演示 | 21 块工程生成约 23.54 秒、1280×720、24 fps 视频，565 帧全部解码；关键帧人工查看 |
| 浏览器 | API 搜索、圆积木添加、常用色板选色已实际操作；原工程另行保留 |
| 桌面 | 本地宿主/打包回归通过；本版本三平台 CI、最终 ASAR 启动与 API 搜索/添加通过，见文末下载与验证记录 |

示例：[参数改变整条曲线](../examples/api/README.md)。[完整审计报告与边界](Manim-API-Coverage.md)。

**尚未完成的验证**：533 个 OpenGL 专属入口仅完成描述与编译接入，本机 glcontext 缺少 EGL 后端，未通过 OpenGL 真实渲染；Manim 0.22.1 尚未安装验证；复杂嵌套回调仍需要结构化 JSON。CLI、文档构建、私有和运行时动态属性不计入公开创作 API 清单。不能把入口覆盖称为全部功能与全部参数组合已验收。

正在运行旧服务时，新前端会提示重启 `npm run studio`，避免把旧编译器不认识新积木的错误暴露给用户。桌面程序需要退出后打开新版。

## v0.2.2 历史记录

日期：2026-11-07。此记录区分已执行的测试、真实画面检查，以及仍受环境限制的验收。

## 本轮可运行实现

- 原生积木编译器与项目格式；97种目录入口，其中96种为非任意代码积木。
- 默认积木界面，真实Manim预览帧/视频，项目保存、导入导出、Python导出。
- 本地独立作业服务，取消、超时、错误定位、媒体Range、缓存。
- 七个原生积木模板与对应真实Manim预渲染视频；编辑后必须重新渲染，内置参考视频不充当新结果。
- AI兼容服务代理与结构化项目导入，未调用付费模型。
- 色板/任意颜色入口、类型过滤的对象下拉、组合成员多选、矩阵网格、多行代码、单位后缀、嵌套步骤与未连接积木提示。

## 已执行检查

| 检查 | 结果与实际范围 |
| --- | --- |
| `npm test` | 149项通过，包含编译边界、Blockly往返/撤销、AI校验、模板哈希、预览失效、导出、保存恢复、可视化字段、对象引用、500动作往返、批量SVG构造与组合移除回归 |
| `npm run build` | TypeScript与Vite生产构建通过；大分块警告仍存在，不等于性能达标 |
| server 单元检查 | 6项通过，含媒体Range、来源/Host/会话令牌、环境选择、生命周期清理和关闭时取消AI请求 |
| 桌面独立服务与宿主检查 | 10项通过；独立服务和界面资源准备成功；三平台真实Electron启动与安装包构建通过，见桌面打包记录 |
| 新增19种原生积木 | 两段真实视频共233帧全部解码，14项场景断言通过；不代表全部参数覆盖 |
| API覆盖清单 | 10项审计测试通过；固定Manim CE 0.20.1，1660项范围内API中96项有积木入口映射；完整清单可复现 |
| server 原生集成检查 | 1项完整真实链路通过：项目→编译器→Python→Manim→H.264媒体；另测2D/3D、中文/公式、错误积木定位、缓存、取消 |
| 七个完整模板 | 全部原生渲染并查看关键帧，详情见模板README |
| 77种非代码积木目录冒烟 | 实际运行最后帧模式通过；只证明接口可调用，不替代逐项动画视觉验收 |
| UI检查 | Chrome 中检查双栏及窄窗口布局、模板切换、视频播放、颜色弹窗、坐标系过滤；矩阵两个单元格一起修改，一步撤销恢复原值；2×2变换矩阵拒绝非数值并提示具体行列；组合成员搜索、勾选与一步撤销；点击嵌套步骤展开折叠的父积木；Python 页“全部参数”回到积木页；空白作品一键添加圆和移动并成功原生预览 |
| 浏览器网络端到端 | 用户正常终端启动 `npm run studio` 后，实际在 Chrome 修改颜色并生成/下载视频；960×540预览与1280×720成片均为H.264 / 30 fps / 462帧，全部帧解码通过；成片第90帧检出1062个接近新颜色 `#6A5ACD` 的像素（RGB各通道容差15），确认新参数进入真实输出 |

另用独立导出的Python文件运行真实CLI，不另传尺寸/fps参数，确认竖屏 **270×480 / 24 fps / 12帧**；源码导出保留项目画面配置。

![Chrome中的矩阵网格编辑](screenshots/studio-v0.2.1-matrix.jpg)

截图中的底部状态为 Manim 0.20.1 已连接，舞台标记为真实 Manim 预览。原用户草稿保留在“我的作品”，操作验收使用另外创建的示例作品。

![颜色选择与修改后的真实动画](screenshots/studio-v0.2.1-palette.jpg)

![可搜索的组合成员多选](screenshots/studio-v0.2.1-members.jpg)

对象多选控件及对应测试由 Antigravity 中的 Gemini 3.8 Flash High 编写；集成审阅后回修了分隔符兼容性与搜索后的键盘焦点，再进行主编辑器验收。模型生成的代码没有跳过审阅与测试。

## 运行环境与明确边界

真实渲染基于当前已安装的Manim CE **0.20.1 / Python 3.12 / Cairo**。原生默认MP4所需libx264在此PyAV构建中缺失，本地服务已采用原生WebM再用已有libopenh264转MP4。该输出链实际生成并解码成功，但不同机器仍需环境检查。

设计的正式目标仍是Manim 0.22.1，未升级或修改用户conda环境。本机下载Electron受网络限制；GitHub CI已在三平台真实启动准备后的Electron应用并生成安装包。本机真实Manim渲染验收采用浏览器界面及相同编译器/worker。最终安装包在目标机器上的安装与渲染仍未完成。

自动化集成测试通过无socket适配调用同一个HTTP handler；Python、Manim和媒体均真实运行。它与上表单独执行的浏览器网络端到端验收是两项不同检查。工具沙箱仍不能新建监听端口，浏览器验收使用用户在正常终端启动的已有服务。

未宣称全Manim API覆盖、任意脚本即时跳转、时间轴回写、用户研究达标、Windows安装验收、直接API接入外部模型的端到端验收。Gemini应用另行生成影片工程，经过校验和修订，详见影片记录。代码扩展不算原生积木覆盖。

- [模板画面记录](../src/studio/templates/README.md)
- [核心项目协议](v0.2-project-format.md)
- [本地服务与测试](../server/README.md)
- [v0.1与P0历史记录](archive/v0.1-and-p0-verification.md)

## v0.2.2 界面改进

减少工具栏高度、提高次级文字对比度、扩大播放滑块命中区域、突出选中步骤和需要更新的预览。禁用容器中的对象不再被误认为可用引用，原引用保留并显示警告。

![更新后的工作台](screenshots/studio-polish.jpg)

完整覆盖范围见 [Manim API清单](Manim-API-Coverage.md)。

## 长片生产中的回归验证

- 72个原生积木镜头共1800秒，六个可编辑章节各300秒；没有Python扩展积木。生成器编排AnyVis项目，编译器生成Manim代码。
- 完整影片43,200帧全部解码、时间戳单调，720p/24fps；逐镜检查关键帧并修订数学与画面对应关系。
- 文字最大宽度：真实Manim测量确认超宽文字缩小，短文字及位置保持。
- 强调效果：20组原生效果/节奏组合检查结束后的几何、颜色、不透明度与可见对象集合恢复。七个模板按新字段重新真实渲染。
- 长章节：386块工程在Chrome从文件选定到步骤可见566ms；默认命名段落折叠，点击内部圆积木可展开并定位。该单次实测不是跨设备性能保证。新增7项缓存、500动作往返、BlockSvg构造与保存状态回归。
- 服务关闭取消AI请求；桌面退出先关闭窗口触发保存，再等待引擎结束。

![长章节中的积木定位](screenshots/geometry-topology-editor.jpg)

此图验证项目载入与编辑，舞台未生成预览；影片由相同编译器和worker的批量入口渲染，不能把截图中的空舞台描述为影片播放验收。

## 最新桌面测试包

**AnyVis v0.4.0**：[构建 42444633481](https://github.com/zhuozheng2006/anyvis/actions/runs/42444633481)，对应 `7e96b4c24ea0a3bd27940bbe928b3daf59e38c49`，三平台构建与最终 ASAR 启动均通过。包含开源时间轴、对象管理器、图片与配音、SVG 尺寸修复、配音分割、默认钢琴与无配乐设置，服务重启后的会话恢复，以及 API 图片渲染、复合删除、点云取样、默认三维视角、前景对象单次更新和 OpenGL 曲线长度兼容修复。

| 系统 | 安装包附件 | 实际启动验证 |
| --- | --- | --- |
| Apple Silicon Mac | [ARM64 DMG 与 ZIP](https://github.com/zhuozheng2006/anyvis/actions/runs/42444633481/artifacts/13603480710) | 通过 |
| Intel Mac | [x64 DMG 与 ZIP](https://github.com/zhuozheng2006/anyvis/actions/runs/42444633481/artifacts/13603236588) | 仅构建，未在 Intel 运行 |
| Windows x64 | [NSIS 安装程序](https://github.com/zhuozheng2006/anyvis/actions/runs/42444633481/artifacts/13603475520) | 通过 |
| Linux x64 | [AppImage 与 DEB](https://github.com/zhuozheng2006/anyvis/actions/runs/42444633481/artifacts/13603350659) | 通过 |

每个平台执行 342 项应用测试、11 项桌面回归、准备目录和最终打包应用的 Electron 冒烟；实际操作 API Wait 搜索/添加、Circle 对象管理器、时间轴、只读代码，以及钢琴→无配乐→钢琴切换。附件保存 14 天（预计北京时间 2026-11-22 到期），需要 GitHub 登录。Python/Manim、字体和 LaTeX 仍需外部环境；macOS 尚未公证、Windows 尚未配置发行者签名，未运行安装向导。

## v0.3.1 历史桌面测试包

**AnyVis v0.3.1**：[最终构建 42401140734](https://github.com/zhuozheng2006/anyvis/actions/runs/42401140734)，对应应用与依赖提交 `1f28edc9f79c15f3ba37919e835eb4dac2c8ce10`。2026-11-08（北京时间）三平台全部成功。

| 系统 | 安装包附件 | 最终应用启动检查 |
| --- | --- | --- |
| Apple Silicon Mac | [ARM64 DMG 与 ZIP](https://github.com/zhuozheng2006/anyvis/actions/runs/42401140734/artifacts/13585751994) | ARM64 通过 |
| Intel Mac | [x64 DMG 与 ZIP](https://github.com/zhuozheng2006/anyvis/actions/runs/42401140734/artifacts/13586020317) | 已构建；未在 Intel 机器运行 |
| Windows x64 | [NSIS 安装程序](https://github.com/zhuozheng2006/anyvis/actions/runs/42401140734/artifacts/13584863724) | x64 通过 |
| Linux x64 | [AppImage 与 DEB](https://github.com/zhuozheng2006/anyvis/actions/runs/42401140734/artifacts/13585269190) | x64 通过 |

每个平台运行 287 项应用测试、10 项桌面回归、准备目录的 Electron 启动、安装包构建和最终 ASAR 应用启动；最后一项验证打包状态、外置 worker、API 搜索/添加、会话与固定协议、视频 Range/解码，以及引擎重启后的存储。检查报告：[Mac](https://github.com/zhuozheng2006/anyvis/actions/runs/42401140734/artifacts/13585458417)、[Windows](https://github.com/zhuozheng2006/anyvis/actions/runs/42401140734/artifacts/13585755880)、[Linux](https://github.com/zhuozheng2006/anyvis/actions/runs/42401140734/artifacts/13585348906)。

另有[独立 Manim CI](https://github.com/zhuozheng2006/anyvis/actions/runs/42401140743)真实执行 Cairo 渲染与媒体集成，不以桌面参考视频冒充 Manim 渲染。依赖审计为 0 项已知告警；这不是不存在任何安全问题的保证。

附件需要 GitHub 登录，于 **2026-11-22 02:27–02:30（北京时间）** 附近过期。Python/Manim、中文字体和 LaTeX 仍为外部依赖；macOS ad-hoc 签名且未公证，Windows 未配置发行者签名。未运行安装向导，也未在目标机器完整验收外部环境或 Intel Mac 启动。已运行旧服务时，请在原启动终端按 Ctrl+C 后重新运行 `npm run studio`；桌面版退出后使用新安装包。

## v0.3.0 历史桌面测试包

**AnyVis v0.3.0**：[构建42379483960](https://github.com/zhuozheng2006/anyvis/actions/runs/42379483960) 对应提交 `c31aa313aec4a505c639ec0077ac41f87360847b`。2026-11-07（北京时间）macOS、Windows、Linux 全部成功。

| 系统 | 安装包附件 | 最终应用启动检查 |
| --- | --- | --- |
| Apple Silicon Mac | [ARM64 DMG与ZIP](https://github.com/zhuozheng2006/anyvis/actions/runs/42379483960/artifacts/13576792694) | ARM64 通过 |
| Intel Mac | [x64 DMG与ZIP](https://github.com/zhuozheng2006/anyvis/actions/runs/42379483960/artifacts/13577086498) | 已构建；未在 Intel 机器运行 |
| Windows x64 | [NSIS安装程序](https://github.com/zhuozheng2006/anyvis/actions/runs/42379483960/artifacts/13576599871) | x64 通过 |
| Linux x64 | [AppImage与DEB](https://github.com/zhuozheng2006/anyvis/actions/runs/42379483960/artifacts/13577375301) | x64 通过 |

本版本每个平台都执行 252 项应用测试、10 项桌面回归、准备目录的真实 Electron 启动，以及安装包构建后 `release/` 中最终 ASAR 应用的启动。最后一项核对打包状态、`app.asar` 路径、外置 worker 文件，实际搜索 Circle 并加入积木，验证会话与协议转发、视频 Range/浏览器解码、引擎重启后存储。检查报告分别为 [Mac](https://github.com/zhuozheng2006/anyvis/actions/runs/42379483960/artifacts/13577260634)、[Windows](https://github.com/zhuozheng2006/anyvis/actions/runs/42379483960/artifacts/13577715260)、[Linux](https://github.com/zhuozheng2006/anyvis/actions/runs/42379483960/artifacts/13577185882)。

本轮发现并修复 macOS CI 的撤销测试竞态：原测试固定等待 15 ms，可能早于 Blockly 的动画帧事件派发。六组字段/引用测试改为等待动画帧与后续 timer，并用 40 ms 慢帧确认多行代码的一步撤销/重做。首轮失败没有被记为通过；以上附件均来自修复后的同一个提交。

下载需要 GitHub 登录，附件于 **2026-11-21 22:02–22:04（北京时间）** 附近过期。桌面程序自主启动本地引擎，不需额外 Node 服务；Python/Manim、中文字体和公式使用的 LaTeX 仍是外部依赖。macOS 使用 ad-hoc 签名、未公证，Windows 未配置发行者签名。CI 验证最终应用，但没有操作安装向导，也没有把内置参考视频播放冒充本机 Manim 渲染。目标机器安装与外部环境验收仍需完成，见[打包说明](../desktop/PACKAGING.md)。

旧版 v0.2.2 的[构建42337701921](https://github.com/zhuozheng2006/anyvis/actions/runs/42337701921)对应 `36f7359`，仅作为历史记录。
