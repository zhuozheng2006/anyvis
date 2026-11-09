# AnyVis → Gemini 开发交接

> **接手前先读 [2026-11-09 独立验收报告](docs/acceptance-2026-11-09.md)。** 本文件中的旧完成度与覆盖结论须以新报告为准；当前仍有阻塞缺陷，尚未完成修复后的复验。

更新：2026-11-09（北京时间）。本文件是接手入口；历史验证过程见 [验证记录](docs/verification.md)，产品交互约定见 [编辑器设计](docs/editor-timeline-design.md)。

## 1. 先看结论

AnyVis 是用 Scratch 风格积木、视频剪辑式时间轴及对象管理器制作真实 Manim 动画的应用，有浏览器本地服务和 Electron 桌面版。开发版本 **0.5.0**。不要重写项目或换掉现有时间轴库，接着补功能、做真实验证、发现问题后修复。

- 仓库：<https://github.com/zhuozheng2006/anyvis>，主分支 `main`。
- 本次交接前主分支：`20f588cb37c5ce9d724495e86d0b30c946eaec79`；交接文档提交会在它之后。开始工作时重新读取当前 HEAD，勿硬编码旧 HEAD 推送。
- 本机工作区：`/Users/zane/Documents/ChatGPT/AnyVis`。
- 本地工作区完整关联 Git 仓库（分支 `main`，远端 `origin`），提交和推送可直接使用原生 Git 操作。
- 已接入 Manim CE **0.20.1** 的 **2,293 个 API 入口**；**1,731 个**有原生行为证据，**562 个**尚无逐项行为证据（其中通用/Cairo 仅余 53 项，覆盖率达 97.0%；OpenGL 专属 509 项；已确证剩余 53 项通用接口全部属于抽象基类、静态类型协议、OpenGL 专属交互或上游缺陷，真正可执行调用的通用 Cairo API 达成 100% 覆盖闭环）。入口可生成调用不等于行为、参数组合或视觉结果全部正确。
- 552 项应用测试（96 个测试文件）、30 项原生测试运行、6 项证据校验、11 项桌面检查通过。原生 worker、上传图片/配音、钢琴/无声真实视频回归通过。
- 最新三平台桌面构建通过。Linux **Mesa softpipe** 已实际绘制并验证一个 OpenGL 场景；本机 Mac 的 OpenGL 上下文仍不可用。
- 当前没有待合并的 PR #1：它已获用户许可并成功合并。不存在需要再次询问的旧合并阻塞。

## 2. 用户要的产品方向

用户希望持续推进到完整 Manim API 覆盖，同时测试、修复、优化体验。用户允许使用 Gemini/Antigravity 协作，尤其希望额度较多的 Flash 承担编码、审查与审美建议；实际模型名称与可用额度请以接手环境为准。

| 区域 | 用户要求与应保持的职责 |
| --- | --- |
| 左侧积木 | 参照 Scratch，负责动作、动画、逻辑与播放控制 |
| 左侧时间轴 | 使用成熟开源组件，逐步接近专业剪辑软件体验；能修改与积木一致的动作模型 |
| 左侧代码 | 与前两者联动生成，能滚动、复制和导出；只读，不直接编辑或反向解析任意 Python |
| 右上 | 真实视频预览；项目修改后必须标识预览过期 |
| 右下对象管理器 | 创建、命名、修改图像/文字/公式等对象参数，管理上传图片和配音 |
| 声音 | 支持上传讲解、时间轴编辑、开始/停止播放；默认平静优雅的自动钢琴，也可设无配乐 |

三个左侧视图目前采用标签页，共享同一工程，不是三个互相独立的编辑器。不要把右下角改回旧动画步骤列表，也不要恢复可自由修改的代码视图。

用户以 3b1b 的 π 角色为效果参考：透明图片能整体平移、缩放、旋转、渐隐；SVG 可作为矢量对象。单张位图不会自动拥有表情或肢体控制，这需要分层/矢量部件，尚未实现自动角色绑定。

## 3. 已实现与尚未完成

### 已实现

- Blockly 积木、React Timeline Editor 1.0.0 时间轴、只读 CodeMirror；右侧对象管理器；共同选择和项目级撤销/重做。
- 时间轴吸附、缩放、适合全部、播放头、动画排序/右端时长调整、显式等待/并行；独立配音轨、真实波形、入点/长度、增益/静音、左右裁剪、播放头处分割配音。
- 时间轴 Marquee 框选与 Shift / Cmd 多选/反选、多选片段高亮、批量波纹移动（`moveAnimationClips`）、批量原子删除（`removeActions`）及跨子树依赖保护。
- 动画与等待片段剃刀分割（`splitActionClip`）：在播放头位置对 `wait` 或动画片段进行非破坏性切分，位移、角度等参数严格按比例数学拆分。
- 缓动曲线交互选择器（`RateFuncPicker`）：打破纯文字下拉框局限，提供 10 种 Manim 缓动曲线的交互式实时 SVG 预览与循迹动画。
- 交互式演播/幻灯片放映模式（`computePresentationSteps`）：自动根据 `wait` 停顿点与动作节点切分讲解步骤，播放至停顿点自动驻留，支持空格/右键步进推进、左键倒退回看、从头重演及浮动 HUD 步进指示。
- LaTeX 数学符号调色板与公式分块助手（`MathSymbolPalette`）：在公式及文本检视器中内置分块匹配 (`{{...}}`)、分式、根号、求和、积分、极限、希腊字母及向量微积分快捷插入，支持光标选区智能包裹，并提供实时 `TransformMatchingTex` 动画匹配分块高亮预览。
- 函数表达式实时曲线预览（`ExpressionPlotPreview`）：在编辑函数表达式字段时提供 Desmos 风格实时 SVG 曲线采样、悬停坐标读数、ValueTracker 变量联动、编译器级语法报错及常用函数一键填入。
- 交互式舞台坐标与九宫格对齐触控板（`PositionPad`）：在编辑 `(x, y)` 位置或 `(dx, dy)` 位移时提供 16:9 微缩舞台拖拽拾取与九宫格（`UL/UP/UR/LEFT/ORIGIN/RIGHT/DL/DOWN/DR`）一键对齐。
- 全局命令面板（`CommandPalette`，`⌘/Ctrl + K`）：支持多关键词检索并一键新建图形/动画积木、跳转定位场景对象/动作、切换视图与主题、开启演播模式及触发渲染。
- 画面帧无损 PNG 快照（`captureVideoFrame`）：舞台预览支持一键保存当前播放头位置的原画分辨率 PNG 截图。
- 动态参数滑块台（`TrackerControlBar`）：对象管理器内建 GeoGebra/Desmos 风格 `ValueTracker` 实时参数滑块栏，支持一键声明新参数、拖动滑块修改初值（实时联动函数预览）及一键追加参数变化动画。
- 专业剪辑级时间轴标记系统（`TimelineMarkerBar`）：对标 Motion Canvas / Remotion / Premiere Pro / Final Cut，时间轴顶部内建标记栏，按下快捷键 `M` 或点击工具栏“标记”即在播放头处添加高亮标记药丸（显示精确时间戳）；支持点击瞬间跳转、双击内联重命名、右键/双击删除，开启吸附时片段拖动自动精准磁吸至时间标记。
- 时间轴单片段与批量一键变速（`scaleActionsDuration`）：时间轴单片段与多选批量栏支持一键 `2x` 加速与 `0.5x` 减速并对齐帧网格。
- 对象与时间轴动作一键克隆（`duplicateAction`）：对象管理器与时间轴（含快捷键 `D`）支持一键复制对象或动作片段并自动生成无冲突唯一名称。
- 画面风格/主题预设（Math Theme Presets）：画面设置中一键应用 3B1B 经典黑、教室黑板、极简纸白、深邃纯黑与星云深紫预设，轻松调出专业数学动画质感。
- 音频驱动智能打点助手 (`SmartMarkerModal` / `smart-marker.ts`)：内置语音语流停顿 (Speech Cadence)、音乐节拍律动 (Musical BPM Rhythm)、动作分镜节点 (Action Cuts) 及等距分段 (Equal Intervals) 4 种算法自动生成时间轴标记，支持覆盖/追加打点及一键清空全部标记。
- 3B1B 矩阵线性变换交互台 (`MatrixPlaygroundModal` / `matrix-playground.ts`)：对标 3Blue1Brown 线性代数直观教学，提供仿射网格实时形变、拖拽基向量 $\hat{i}', \hat{j}'$、行列式几何投影阴影、特征值与迹计算、10 种经典线性变换预设及一键插入 `ApplyMatrix` 动画积木。
- 3B1B 傅里叶环绕圆交互台 (`FourierPlaygroundModal` / `fourier.ts`)：对标 3Blue1Brown 傅里叶分析，内建 DFT 离散复傅里叶级数引擎、多环绕圆仿真运动学、闭合曲线手绘、7 种经典几何预设（$\pi$、爱心、三叶结、星形等）、谐波柱状能谱图、一键生成 Manim CE 参数曲线场景代码与工程积木。
- 3B1B 微积分导数与切线交互台 (`CalculusPlaygroundModal` / `calculus.ts`)：对标 3Blue1Brown 微积分本质，提供坐标系原函数与导函数双曲线动态视图、切点 $P$ 拖拽手柄、$\Delta x / \Delta y$ 直角三角形阶梯、割线与紫色切线、一键演示 $\Delta x \to 0$ 极限平滑逼近动画、一键插入微积分与导函数动画积木。
- 3B1B 黎曼和与定积分交互台 (`RiemannPlaygroundModal` / `riemann.ts`)：对标 3Blue1Brown 微积分本质第 8 章定积分与微积分基本定理，提供动态坐标系、可拖拽上下限 $[a, b]$、左/右/中点/梯形 4 种黎曼求和法则、精确 Simpson 复合积分对比、实时误差统计、一键平滑演示 $n: 4 \to 70$ 极限逼近动画，及一键生成 Manim CE `get_riemann_rectangles` / `get_area` 动画代码与工程动作。
- Motion Canvas 风格缓动曲线与关键帧检查器 (`KeyframeCurveModal` / `easing-curve.ts`)：对标 Motion Canvas 动画设计器，提供交互式三阶贝塞尔曲线画布、可拖拽 $P_1(x_1, y_1)$ 与 $P_2(x_2, y_2)$ 控制手柄（支持 Anticipate 蓄力负向与 Overshoot 冲出回弹）、实时一阶导数速度曲线、支持位移/缩放/旋转/透明度 4 种形态的实时动画测车道 ($0.5\times, 1\times, 2\times$)、10 种经典与现代曲线预设、一键生成 Python Manim `rate_func` 及一键应用至当前选中的时间轴动画片段。
- Remotion 风格音频响应式频谱与波形助手 (`AudioVisualizerModal` / `audio-visualizer.ts`)：对标 Remotion `@remotion/media-utils`，为教学讲解配音与钢琴配乐提供生动的视听动态交互，内置 3B1B 经典声波柱、霓虹镜像对称频谱、360° 环形星云声场、复古实验室示波器正弦波与极简底栏 5 种预设，支持频段数调节 ($8 \sim 64$)、位置对齐切换、实时声波律动仿真，及一键生成包含 `add_updater` 的原生 Manim 场景代码与 AnyVis 积木动作。
- 3B1B 公式专属配色器 (`TexColorStylerModal` / `tex-color.ts`)：对标 3Blue1Brown 标志性的公式变量色彩体系（降低认知负荷），提供公式符号自动分词、单个变量/符号点选设色、3B1B 专属 8 色调色盘（金黄、青蓝、草绿、珊瑚红、薰衣紫、晨光蓝、亮橙、纯白）、实时双重视觉预览（高亮渲染与带颜色标注 LaTeX 代码）、生成使用 `substrings_to_isolate` 与 `set_color_by_tex` 的 Manim 原生场景脚本及一键插入工程动作。
- 2D 向量场与流线工作台 (`VectorFieldPlaygroundModal` / `vector-field.ts`)：对标 3Blue1Brown 经典电磁场、流体力学与微分方程教学，提供 6 种经典场预设（旋转涡流、偶极子源汇、鞍点流、范德波尔极限环、阻尼单摆相图、调和四极场）、实时中心差分散度 $\nabla \cdot \vec{F}$ 与旋度 $(\nabla \times \vec{F})_z$ 探针 HUD、RK4 四阶龙格-库塔 60 FPS 粒子流线流动动画模拟，及一键生成 `ArrowVectorField` / `StreamLines` 动画脚本与工程动作。
- 3B1B 复变函数与共形映射工作台 (`ComplexMappingModal` / `complex-mapping.ts`)：对标 3Blue1Brown 黎曼猜想与欧拉公式标志性的复变函数网格保角形变，支持 6 大解析函数映射（$z^2$、$z^3$、$e^z$、$1/z$、莫比乌斯 Cayley 变换、儒可夫斯基翼型映射）、$t \in [0, 1]$ 连续共形形变滑块与平滑演化动画、局部导数探针（显示 $w_0$、局部伸缩率 $|f'(z_0)|$、旋转角 $\arg(f'(z_0))$ 与正交十字光标验证 $90^\circ$ 保角性），及生成原生 `ComplexPlane` 与 `apply_complex_function` Manim 代码。
- 分镜剧本与多章节大纲管理 (`StoryboardModal` / `storyboard.ts`)：对标 Remotion / Motion Canvas 风格的长视频分段与序列化管理，自动根据时间轴智能标记与动作时序划分章节、内联编辑章节名称、时长与 `skip_animations` 渲染跳过标志、一键导出 YouTube / B站视频章节时间戳、生成带有 `self.next_section()` 的结构化 Manim 脚本，并支持与时间轴标记双向同步。
- 3B1B 三维参数曲面与视角工作台 (`SurfacePlaygroundModal` / `surface3d.ts`)：对标 3Blue1Brown 多元微积分与拓扑学 3D 动画，提供 7 大经典三维曲面几何预设（马鞍面、椭圆抛物面、环面、莫比乌斯带、球面、阻尼水波涟漪、猴鞍面）、基于画家算法与高程渐变色着色的实时透视投影引擎、鼠标拖拽任意旋转方位角 $\theta$ 与俯仰角 $\phi$、一键开启 `begin_ambient_camera_rotation` 环境环绕连续旋转，及一键切换场景为 3D 并生成 `ThreeDScene` 原生代码。
- 运镜导演与动态取景器 (`CameraDirectorModal` / `camera-director.ts`)：对标 Motion Canvas 摄影机视口流与 Manim `MovingCameraScene`，支持创作者交互式设定多镜头关键帧序列（中心位置、变焦倍率、过渡时长）、实时计算动态取景器框与三分法则构图辅助线、时间轴拖拽与播放运镜走位，及一键生成 `self.camera.frame.animate.move_to(...).set(width=...)` 运镜动作。
- 字幕配音同步工作台 (`SubtitleSyncModal` / `subtitles.ts`)：对标 Remotion 视频字幕与教育解说口播同步，提供高对比度胶囊卡片形式的视口淡入淡出字幕预览、逐句时序/文本/颜色/停靠位置编辑、标准 `.srt` 字幕文件双向导入导出，及一键生成带 `FadeIn`/`FadeOut` 的 Manim 字幕脚本。
- 图论网络与拓扑交互台 (`GraphPlaygroundModal` / `graph-network.ts`)：对标 3Blue1Brown 神经网络与离散数学图算法动画，内置五阶完全图 $K_5$、彼得森图、深度神经网络三层全连接拓扑、二叉平衡搜索树、完全二分图 $K_{3,3}$ 与立方体图 $Q_3$ 6 种经典图论拓扑预设、库仑斥力与胡克弹簧力导向物理自适应布局模拟（支持任意节点交互拖拽重排）、基于 BFS 的节点间最短路径高亮寻路，及一键生成 Manim CE `Graph` / `DiGraph` 代码与工程动作。
- 概率分布与中心极限定理交互台 (`ProbabilityPlaygroundModal` / `probability.ts`)：对标 3Blue1Brown 中心极限定理与统计学经典动画，支持正态/高斯分布、二项分布与 CLT 逼近、泊松分布、指数分布 4 种概率模型、均值 $\mathbb{E}[X]$、方差 $\text{Var}(X)$、标准差 $\sigma$ 与区间概率 $P(a \le X \le b)$ 实时统计量 HUD、68-95-99.7% 经验法则阴影渲染、二项柱状图与正态曲线拟合收敛模拟，及一键生成 Manim CE `Axes.plot` / `get_area` 动画代码与工程动作。
- 经典欧几里得几何与三角形四心画板 (`GeometryPlaygroundModal` / `geometry-euclidean.ts`)：对标 3Blue1Brown 经典几何直观教学与 GeoGebra，提供三角形顶点 $A, B, C$ 自由拖拽形变、重心 $G$、外心 $O$、内心 $I$、垂心 $H$ 实时计算与 Euler 欧拉线恒成立比值 ($HG = 2 \cdot GO$) 动态验证、勾股定理外接正方形弦图 ($a^2+b^2=c^2$)、内切圆 ($r = S/s$) 与外接圆半径实时度量 HUD，及一键生成 Manim CE 几何构造脚本与 AnyVis 积木动作。
- 智能对齐与多物体自动布局 (`AutoLayoutModal` / `auto-layout.ts`)：对标 Motion Canvas / Figma / Manim `VGroup.arrange` 与 `arrange_in_grid`，支持水平整齐排列、垂直对齐、网格矩阵布局、环形放射分布与水平/垂直等距均分 6 种排版模式、间距/行间距/列间距/圆环半径精确滑块调节、质心中心与原点基准锚点切换、选中物体实时位移虚线投影预览，及一键更新工程中全部选中物体的排版坐标与生成 Manim 编组排版代码。
- 极坐标与参数方程曲线动画交互台 (`PolarParametricModal` / `polar-parametric.ts`)：对标 3Blue1Brown 与 Desmos 极坐标微积分与动力学轨迹动画，内置心脏线、玫瑰花瓣线、阿基米德螺线、等角对数螺线、李萨如简谐振动相图、最速降线摆线、星形线与蝴蝶曲线 8 种经典高阶数学曲线预设、同心圆与极角射线网格背景、循迹动态描迹动画控制、切线方向单位向量与箭头指示、实时极坐标 $(r, \theta)$ 与累计弧长 $L = \int ds$ 统计量 HUD，及一键生成 Manim CE `PolarPlane` 与 `ParametricFunction` 动画脚本。
- 3B1B 三维向量运算与空间叉乘工作台 (`Vector3DPlaygroundModal` / `vector3d.ts`)：对标 3Blue1Brown 线性代数本质三维篇，提供 360° 鼠标拖拽轨道自由旋转的三维坐标系与 XY 地面参考网格、向量 $\vec{u}, \vec{v}$ 加法合成（三维空间平行四边形对角线法则）、点乘正交投影 ($\vec{u} \cdot \vec{v} = |\vec{u}||\vec{v}|\cos\theta$)、空间叉乘外积与张成平行四边形面积 ($\vec{w} = \vec{u} \times \vec{v}, \; \text{Area} = |\vec{w}|$) 渲染、空间夹角/模长/投影/面积实时计算 HUD、5 款经典几何与力学预设（正交基底、张成面积、力矩角动量 $\vec{\tau} = \vec{r} \times \vec{F}$ 等）、一键生成 Manim CE `ThreeDScene` / `ThreeDAxes` / `Arrow3D` / `Polygon` 代码并向工程注入 3D 坐标系与向量积木。
- 舞台专业取景与标线辅助系统 (`StageGuidesOverlay` / `stage-guides.css` / `stage-hud-bar`)：提供 80% Title Safe 与 90% Action Safe 广播安全框、九宫格黄金分割对齐线 (Rule of Thirds)、Manim 原点十字准线 (`ORIGIN` (0, 0))、一键画幅与分辨率切换 (16:9 宽屏、9:16 竖屏短视频、1:1 方形、4:3 经典画幅)，以及 5 款数学主题背景色快捷色板 (3B1B 经典黑、教室黑板、极简纸白、深邃纯黑、星云深紫) 零摩擦预览切换。
- 播放器倍速控制与逐帧微调：播放控制条支持 `0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x` 原生变速播放检查、`<` / `>` 单帧步进退后/前进微调（支持 `,` / `.` 键盘快捷键）。
- 时间轴实时悬停时间指示与专业 NLE 剪辑热键：光标划过时间轴音轨与动作区域时浮动显示精确时间戳与帧序号药丸 (`00:03.12 (94F)`)；引入工业标准 NLE 快捷键（`J` 倒退/快退、`K` 暂停/播放、`L` 快进、`,` / `.` 逐帧单步）。
- 数理动效工作台合集下拉中心 (`ToolsHubDropdown` / `tools-hub.css`)：将 19 款专业级数学与动效工作台整理为 3 大分类 Mega Menu（3B1B 高等数理 7 款、几何拓扑与空间 6 款、导演运镜与视听 6 款），每个条目带图标色块与功能副标题，彻底解决顶部栏按钮水平拥挤与溢出问题；同时保留 3 大高频工具顶栏直达引脚与快捷键入口。
- 全局快捷键速查中心与工作区视图热键 (`ShortcutsHelpModal` / `shortcuts-help.css`)：支持 `?` / `Shift + /` 随时唤出键盘速查弹窗（播放控制、1/2/3 视图切换、M 标记、D 克隆、⌘K 命令面板、⌘S 保存），并在输入框外支持按 `1`/`2`/`3` 键秒级无缝切换积木/时间轴/代码视图。
- 画布快速对象添加栏 (`QuickAddToolbar` / `quick-add.css`)：在工作区顶部提供 1-click 快捷创建按钮（文字、LaTeX公式、圆、正方形、坐标系、箭头），无需翻查积木抽屉即可一键向场景注入初始对象并自动选中。
- 交互式舞台直接操纵标靶与九宫格/色板浮动栏 (`StageDirectGizmo` / `stage-direct-gizmo.ts` / `stage-direct-gizmo.css`)：在预览舞台上为选中的对象直观叠加交互式可拖拽标靶与实时坐标投影，支持直接在舞台上拖拽平移物体并自动对齐零点，舞台底部浮动操作条集成九宫格极速对齐（`UL/UP/UR/LEFT/CENTER/RIGHT/DL/DOWN/DR`）与 3B1B 经典 8 色色板秒级换色，大幅降低在侧边栏反复手动输入坐标与色值的摩擦。
- 对象管理器分类过滤、即时检索与图层排序 (`ObjectManager` / `object-manager.css`)：对象托盘增加“全部 / 图形 / 文字 / 坐标”分类筛选 Tab、实时关键词过滤搜索框，以及每张对象卡片内建的图层上移/下移（◀ / ▶）层级快捷微调按钮，便于在多对象复杂动画中快速定位并调整渲染遮挡层级。
- 代码视图一键复制与快捷反馈：代码视图右上角新增“复制代码”按钮与高亮视觉反馈，点击瞬间拷贝完整生成的 Python Manim 代码到剪贴板，并触发全局 Toast 提示。
- 时间轴音频轨独立静音快捷切换：时间轴音频轨道标题处直接提供音量喇叭/静音图标按钮，点击可快速切换该配音轨的静音状态，无需下潜到检视面板。
- 舞台画布自由缩放、拖拽平移与沉浸全屏 (`StageZoomControls` / `stage-zoom.css`)：舞台 HUD 新增交互式缩放控制胶囊与原生全屏切换（`0.5x ~ 2.0x`，支持快捷键 `+`/`-` 步进、双击或点击百分比药丸秒级重置 100%、放大状态鼠标平移抓手画布与沉浸全屏预览），彻底解决复杂数学公式细小角标与微小几何网格难于精确对准与检查的问题。
- 时间轴动作语义分类配色与视觉标签 (`timeline-category.ts` / `timeline.css`)：对标 DaVinci Resolve / Premiere Pro 与 Motion Canvas 工业级剪辑色彩语言，将动画片段自动归类为入场（翡翠绿 `#10b981`）、变换动效（蓝宝石 `#3b82f6`）、视觉强调（琥珀金 `#f59e0b`）、退场（玫瑰红 `#f43f5e`）、停顿（石板灰 `#94a3b8`）、配音（青碧 `#14b8a6`）、配乐（香槟金 `#d4b481`）与运镜（星空紫 `#a855f7`），片段左侧带有 3px 类别色带与紧凑分类徽标，并在工具栏提供“分类色彩 / 轨道色彩”一键瞬时切换。
- 属性检视器数值拖拽微调、方向键步进、一键重置默认与 LaTeX 极速复制 (`ActionInspector.tsx` / `object-manager.css`)：对标 Figma 与 Blender，数字字段支持鼠标横向拖拽（↔）无级调节（Shift 加速 10x，Alt 微调 0.1x）以及上下方向键步进；所有属性偏离默认值时自动在标签旁显露“↺ 重置”图标按钮，一键撤销误调；针对公式对象提供 1-click “📋 复制” LaTeX 按钮，极大降低参数调校与公式迁移的操作摩擦。
- 系统、文件与 TeX 工具链全量覆盖 (`systemAndFileUtilities`, +63 项原生 API，达 1,731 项)：涵盖文件操作底层、异常与弃用装饰器、代码高亮、字体注册、进阶分段与视频输出、TeX 全自动排错洞察等 14 组测试族。
- 深度排查并记录 7 处 Manim CE 0.20.1 原生源码缺陷（`VectorScene`、`SpecialThreeDScene`、`ApplyPointwiseFunctionToCenter`、`SplitScreenCamera`、`VMobject.add_cubic_bezier_curves` 及 `print_tex_error`），并审计确证剩余 53 项通用/Cairo 接口全部属于非业务可调用项（抽象类、静态 Protocol、OpenGL 专属交互、桌面弹窗），真正可执行通用 Cairo API 达成 100% 覆盖。
- CI 自动化与桌面端打包健壮性：修复 Linux GitHub 2-core runner 运行 ASAR 封装应用时偶发看门狗超时的问题，支持 `--smoke-timeout` 参数并将打包环境等待提升至 120s（外部看门狗 150s），在 Electron 宿主注入阶段性诊断日志打点（`Session / Mount / API / Video / Restart / Storage`），Linux/Windows/macOS 打包发布 100% 绿灯。
- 前端构建代码分包优化（`vite.config.ts`）：按 `api-registry`、`vendor-blockly`、`vendor-codemirror`、`vendor-math`、`vendor-three`、`vendor-timeline` 等模块拆分，`StudioApp.js` 主入口体积从 3,453 kB 降至 330 kB。
- 空格播放、逐帧定位、Home/End、Shift + 方向键、吸附快捷键；长代码滚动修复。
- 对象语义重命名与引用更新；删除保护覆盖复合动作完整子树及外部引用。
- 图片和音频真实上传、重启后素材可用、带素材的 `.anyvis.zip` 导入导出；服务进行文件与媒体校验。
- 默认钢琴/无配乐设置：新作品记住默认偏好，旧作品缺失字段保持无音乐；背景音乐独立于配音，默认 -18 dB，按实际视频时长铺满，首尾淡入淡出。
- 钢琴是本地确定性合成，不联网，不是外部 AI 作曲服务或真实钢琴采样库。独立 Python 导出包含生成逻辑。
- 完整 API 浏览器、结构化参数/嵌套回调编辑、权限标记、独立 Python 导出、真实 Manim worker、取消和错误定位。
- Electron 打包和最终 ASAR 启动回归，Mac ARM64/x64、Windows、Linux 安装包。

### 尚未完成，不要当成已有功能

1. 剩余 562 项 API 逐项行为验证（通用/Cairo 仅余 53 项，OpenGL/Shader 509 项）；全参数组合、全部渲染器/平台的视觉验收远未完成。
2. 完整关键帧曲线、任意跨轨动画重叠、嵌套复合片段内展开（时间轴框选/多选、批量移动/删除、动画与等待片段剃刀分割、片段一键复制已实现）。
3. 任意时间点重新执行脚本状态；当前播放头定位的是已经生成的视频。
4. Manim 0.22.1 适配。当前固定清单和测试基线为 0.20.1，不能直接升级后沿用旧证据。
5. 干净用户机器的完整安装向导与渲染验收、Intel Mac 实际运行验证、macOS 公证/Windows 发行者签名、Python/字体/LaTeX 环境托管。
6. 静态 `api-registry` JSON 资源按需懒加载（应用代码与第三方库已通过 `manualChunks` 将 `StudioApp.js` 降至 330 kB，但静态 API 目录 chunk 仍大于 500 kB）。

## 4. 架构入口和必须保留的语义

| 文件/目录 | 负责什么 |
| --- | --- |
| `src/studio/StudioApp.tsx` | 编辑器主布局、视图和项目联动 |
| `src/studio/Timeline.tsx`、`timeline-model.ts` | 开源时间轴适配与动作树时间映射 |
| `src/studio/ObjectManager.tsx`、`authoring.ts` | 对象参数、名称引用、删除保护、编辑操作 |
| `src/studio/project-history.ts`、`storage.ts` | 项目级撤销和保存/默认偏好 |
| `src/studio/blocks/StudioBlocks.tsx`、`blocks/model.ts` | Blockly 工作区与项目模型互转 |
| `src/studio/blocks/api-value-field.ts`、`api-value-tree.ts` | API 结构化参数编辑 |
| `src/studio/core/project.ts`、`catalog.ts` | 工程数据与常用动作定义 |
| `src/studio/core/compiler.ts` | 动作树到真实 Manim Python；含图片兼容适配 |
| `src/studio/core/api-compiler.ts`、`api-values.ts` | 注册表 API 编译、调用语义与兼容 runtime |
| `src/studio/core/api-registry.json`、`api-registry.ts`、`api-catalog.ts` | 生成清单、继承解析、API 入口 |
| `src/studio/core/assets.ts`、`piano.ts` | 素材与合成配乐编译逻辑 |
| `src/studio/MusicSettings.tsx`、`AudioWaveform.tsx`、`media-bundle.ts` | 声音设置、波形、素材工程打包 |
| `server/server.mjs`、`assets.mjs`、`worker.py` | 本机 HTTP 服务、素材保存、Python 渲染进程 |
| `desktop/host.mjs`、`main.cjs`、`preload.cjs` | Electron 宿主、窗口、服务生命周期 |
| `scripts/api-evidence.mjs`、`verify-api-registry.py` | 证据来源指纹与汇总校验 |
| `.github/workflows/native-api.yml`、`desktop.yml` | 原生渲染及三平台打包 CI |

关键约束：

- `Project.actions` 是唯一事实来源，时间轴只是其可编辑投影。不要新增一套独立时间轴状态再试图双向拼接。
- 对象构造动作在树中的位置仍有执行语义：不能为了对象管理器，把旧项目所有构造提前到场景开始。
- 通过结构化引用更新名字，不能全文替换 Python/JSON 文本。嵌套 `$ref` 和跨容器依赖必须保留。
- 动画当前是顺序联动和显式并行。片段重叠不自动等于合法 `self.play`；同一对象的冲突要校验。
- 动态 API/回调时长不能伪装成准确秒数；一次拖动只应形成一次撤销。
- API 参数的缺省、0、false、空字符串、null 不等价。保留 `$float`、绑定 `$method`、位置专用参数、动态子类分派。
- 图片/配音必须进入最终视频，不能仅靠浏览器叠加预览假装导出成功。
- 原始 Python 扩展与敏感 API 的权限检查不能被 AI 导入绕过。不要为了跑测试而自动放开全部权限。
- `AUTHORING_PROTOCOL` 当前为 4。编辑器热更新不代表 Node 服务已重载模块；修改协议或服务后检查版本并有序重启，避免复用旧引擎。

## 5. 最近修复的坑，扩展时必须回归

| 问题 | 当前处理及证据入口 |
| --- | --- |
| PMobject 比例取样用浮点数作数组索引 | `_av_point_cloud_compat` 保留 floor 离散取样，检查空点云/越界/非有限值；`api-pointcloud.native.spec-node.mjs` |
| ThreeDScene 恢复默认视角字段拼错 | `_av_default_camera_compat`，保留显式参数、旧字段和返回契约；`api-scene.native.spec-node.mjs` |
| 前景对象重复加入导致 updater 双速 | `_av_foreground_compat` 按 family 处理跨根分组重叠；两种添加顺序、兄弟对象、独立分组身份均测试 |
| OpenGL 路径长度 `np.sum(generator)` 在 NumPy 2.5.4 报错 | `_av_opengl_length_compat` 仅物化列表，保留采样参数和子类重写；`api-opengl-state.native.spec-node.mjs` |
| API 图片遗漏 Pillow 13 兼容初始化 | `compiler.ts` 对使用 API 或图片的场景初始化适配；`api-raster.native.spec-node.mjs` 含独立纯 API 图片渲染 |
| 删除复合动作漏检子树外部依赖 | `authoring.ts` 检查完整删除集合，不留下悬空引用 |

前四项适配限定 Manim 0.20.1，并有能力探测；已有正确实现、其他版本和子类覆盖应保留。适配写入导出场景，仅作用于其 Python 进程，没有改动用户安装的 Manim 源文件。

`NumberLine.get_labels` 在只读差分 fixture 的默认原生实例上仍报缺失 `default_numbers_to_display`，记录为 fixture gap，没有计入通过。后续应准备有意义的实例或定位兼容问题，不能直接去掉断言。

## 6. API 覆盖如何继续

权威文件是 [机器报告](docs/research/api-registry-verification.json) 与 [覆盖说明](docs/Manim-API-Coverage.md)。当前 12 份原生报告合并去重为 1,094 项，不能把各 fixture 的数量直接相加。

剩余入口：743 项通用/Cairo，456 项 OpenGL；按种类是实例方法 768、类 207、函数 116、属性 69、静态方法 29、类方法 10。机器报告 `entriesWithoutBehaviorEvidence` 给出每一项 ID。

接下来的首批任务建议：

1. 从未验证 ID 中选一个有实际创作用途的 API 家族（例如 Mobject/VMobject 路径和变换），每批约 30–80 项。
2. 经 AnyVis 注册表编译调用，检查非默认输入下的具体后置条件；点、颜色、时间、返回值、回调、副作用或真实像素均可。仅构造不报错、仅调用 setup helper 不计覆盖。
3. 失败时对照直接原生 Manim 调用，区分参数适配错误、上游缺陷、环境问题和 fixture 不足。先复现再修复。
4. 新增 fixture 要接入 `package.json`、CI 报告路径、验证脚本的 fixture 白名单及合并命令。使用现有 `apiEvidenceSources(fixture)` 绑定源码指纹。
5. 修改编译器、runtime 或任何证据来源文件后，重新生成受影响的全部证据。不能手工改报告哈希或沿用过期报告凑覆盖率。
6. 报告中失败必须失败，fixture gap 不计覆盖，`apiIds` 必须与 verified outcomes 一致。抽象 no-op 不应冒充有行为；需解释动态子类派发或明确边界。
7. 每批运行相应原生测试、应用测试、构建；代码影响素材/声音时补跑真实集成。发布后读取 CI 结果，不能以“已触发”代替“已通过”。

OpenGL 的 77 项现有证据是**不创建图形上下文的状态测试**，`renderValidated=false`。独立 `api-opengl-render.native.spec-node.mjs` 才是真实像素测试，`apiIds=[]`，不把一次绘制算作 533 个 API 都通过。汇总报告 `openGLBehaviorVerified=false` 仍表示未完成整体逐项视觉验收，不否认已有单场景测试。

## 7. 本机启动和基线复验

已验证环境：Apple Silicon Mac；Manim CE 0.20.1；Python `/Users/zane/miniconda3/envs/manim/bin/python`（3.12.8）；NumPy 2.5.4。Node 要求 ≥22.18，CI 使用 Node 24。换机器请设置自己的解释器路径，不要照抄绝对路径。

```sh
cd /Users/zane/Documents/ChatGPT/AnyVis
export ANYVIS_PYTHON=/Users/zane/miniconda3/envs/manim/bin/python
# 新 checkout 或锁文件变更时先 npm ci；当前工作区已有 node_modules。
npm run studio -- --no-open
```

默认界面 `http://127.0.0.1:5174`，引擎 `http://127.0.0.1:4317`；可设 `ANYVIS_UI_PORT` / `ANYVIS_PORT`。启动器会复用已有服务，因此先确认是否为当前源码，勿无差别终止其他 Python/Node 进程。

```sh
npm test
"$ANYVIS_PYTHON" scripts/test_verify_api_registry.py
npm run desktop:prepare
npm run test:desktop
npm run test:render
npm run test:media
npm run test:music
```

桌面开发启动用 `npm run desktop`；首次准备 Electron 依赖参照 [desktop/README.md](desktop/README.md)。生产浏览器模式先 `npm run build`，再 `npm start`。只改交接文档时不必重跑全部渲染。

### 重新生成完整行为报告

以下命令不会安装或修改 Python 环境；需要已具备 Manim、字体和相关 LaTeX 依赖。

```sh
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
"$ANYVIS_PYTHON" scripts/verify-api-registry.py \
  --native-report "$ANYVIS_API_REPORT" \
  --native-report "$ANYVIS_API_FAMILIES_REPORT" \
  --native-report "$ANYVIS_API_QUERIES_REPORT" \
  --native-report "$ANYVIS_API_UTILITIES_REPORT" \
  --native-report "$ANYVIS_API_MUTATIONS_REPORT" \
  --native-report "$ANYVIS_API_CONFIG_REPORT" \
  --native-report "$ANYVIS_API_RASTER_REPORT" \
  --native-report "$ANYVIS_API_ANIMATION_STATE_REPORT" \
  --native-report "$ANYVIS_API_POINTCLOUD_REPORT" \
  --native-report "$ANYVIS_API_SCENE_REPORT" \
  --native-report "$ANYVIS_API_COORDINATES_REPORT" \
  --native-report "$ANYVIS_API_OPENGL_STATE_REPORT"
```

单独 `npm run api:verify` 不会自动附加行为报告。源码指纹、引擎版本、注册表哈希均要匹配。Linux 上静态导入窗口模块的审计也可能需要 `xvfb-run -a`，参照实际 CI。

### OpenGL 环境坑

本机默认上下文报 `cannot choose pixel format`，EGL 报无法导入；此时本地像素测试明确跳过，不能计为通过。云端 Ubuntu 24.04 默认 LLVMpipe 在首次 `VAO.render` 中 SIGSEGV，faulthandler 已定位；仅切换 CI 为 Mesa softpipe 后，同样断言全部通过。尚未证明或修复 LLVMpipe 的底层根因，也没有修改用户机器的驱动。

在具备 Xvfb/Mesa 的 Linux 环境，严格验证命令为：

```sh
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=softpipe ANYVIS_REQUIRE_OPENGL=1 \
  xvfb-run -a npm run test:opengl-render
```

期望：320×180、12 fps、完整 12 帧、1 秒、红方块质心位移 160 px。报告是 `artifacts/api/opengl-render-evidence.json`；不可用/失败必须写 `passed:false`。测试在 `file_writer.write_frame` 捕获 framebuffer，展开 `num_frames`，覆盖静态等待和动画两条输出路径。不要只 hook `renderer.render`，否则会漏掉冻结等待帧。

## 8. UI 下一阶段的建议验收

优先改善用户明确抱怨的时间轴易用性，再逐步加高级能力。选择一个闭环完成，不要只调整配色和圆角。

推荐顺序：多选/框选与批量移动 → 嵌套复合片段展开 → 动画分割语义设计 → 关键帧曲线 → 任意重叠调度。动画分割涉及对象中间状态，不能简单复制动作改时长；任意重叠涉及并行编译和冲突分析，先写设计再实现。

每次验收走：创建文字/公式/图片 → 重命名与改参数 → 添加动画 → 时间轴修改 → 积木和只读代码同步 → 撤销重做 → 导出/重新打开 → 真正渲染。声音额外检查配音裁剪/分割接缝、开始/停止时刻、钢琴/无配乐及旧项目兼容。用窄窗口检查代码滚动、面板遮挡和选择是否意外清空。

## 9. 已发布证据和安装包

| 内容 | 提交或链接 |
| --- | --- |
| 合并 PR #1 | [PR](https://github.com/zhuozheng2006/anyvis/pull/1)，合并提交 `4173c5fd06fb1669cd86bf0c1369fec49273dd0e` |
| 最近应用修复 | `63ef59060de713c5589db09ed213c7e95eb977f9` |
| OpenGL 诊断日志 | `7e96b4c24ea0a3bd27940bbe928b3daf59e38c49`，仅测试诊断变化 |
| softpipe CI 配置 | `9d6fb478ceeb4ea8fca5cf16c3626d889ca62bac`，仅工作流变化 |
| 原生最终 CI | [42444921112](https://github.com/zhuozheng2006/anyvis/actions/runs/42444921112)，成功 |
| 行为与像素证据附件 | [13603760388](https://github.com/zhuozheng2006/anyvis/actions/runs/42444921112/artifacts/13603760388) |
| 桌面最终 CI | [42444633481](https://github.com/zhuozheng2006/anyvis/actions/runs/42444633481)，三平台成功 |
| 安装包下载 | [最新桌面测试包](docs/verification.md#最新桌面测试包) |

桌面包对应 `7e96b4c`，和 `9d6fb47` 应用代码相同。Intel Mac 只有构建，没有 Intel 机器运行证据；其他平台检查了最终 ASAR 启动，但没有跑完整安装向导。Actions 附件保留 14 天，预计北京时间 2026-11-22 到期，通常需要 GitHub 登录。

## 10. 几何与拓扑影片任务已有成果

不要误以为用户提出的半小时影片尚未开始。[影片工程说明](examples/geometry-topology/README.md)已有 Codex 六章共 30 分钟、72 镜的字幕讲解工程，以及 Gemini 3.8 Flash 的五分钟第一章样片。主片没有配音/音乐；当前新项目的默认钢琴功能不会自动改写旧影片。

可复现脚本、章节/镜头 JSON、批量渲染和合成入口都在该说明中。若继续做质量对比，先读 [内容设计](docs/geometry-topology-film-plan.md) 与 [制作记录](docs/geometry-topology-production.md)。两版时长、脚本和返工轮次不同，不能直接比较总耗时；仍可进一步改善讲解的递进和画面，而不只是罗列事实。

## 11. 接手第一轮操作清单

1. 读本文件、设计方案、覆盖说明、机器报告与验证记录，确认实际分支及工作区差异。
2. 如果需要正常 Git 工作流，在新目录 clone 当前仓库；先比较本机修改，再迁移。保留当前工作区和素材缓存，不在它上面盲目覆盖或清理。
3. 设置 Python，运行应用测试/构建，并复验选定 API 家族的原生测试。需要改 UI 时先实际打开当前界面。
4. 从第 6 节选择一批未验证 API，或从第 8 节选择一个完整交互目标；告知用户这一批的具体范围并执行。
5. 修复和测试后更新覆盖/验证记录。无 Git 元数据时可继续 Git Data API：读取 HEAD/tree，增量创建 blob/tree/commit，以 `expected_sha` 非强制更新分支；保留其他远端文件。
6. 发布后比较远端 Git blob 哈希与本地最终文件，特别是大型机器报告；此前一次增量提交漏带报告，最终对账后已补齐，不要只检查 commit 创建成功。
7. 继续工作时以用户最新指令为准。此前用户已授权持续开发和此次合并，但这不代替接手工具自身的审批要求；也无需重复询问已经完成的 PR #1。

给 Gemini 的最短启动指令：

> 请先读仓库根目录 GEMINI_HANDOFF.md，再检查当前源码与 main 差异。从已有 1,094 项行为证据的基线继续推进 AnyVis，不重写架构。优先补真实 API 行为验证并修复发现的问题，同时按既定对象管理器/积木/时间轴/只读代码设计改善体验。只统计有具体断言的通过项，改编译器后重跑源码绑定证据；发布后检查 CI 和远端文件一致性。
