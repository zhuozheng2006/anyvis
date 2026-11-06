# P0：真实 Manim 最小实验

本实验验证本机现有 Manim 的真实动画语义、中文文字、渲染和媒体检查。它不是 AnyVis 正式 P1，不验证积木编译、编辑器、时间轴或应用预览，也没有修改这些功能。

## 实测结论

主场景与独立公式场景都已完成 Cairo 原生渲染，关键帧已人工查看。主场景可得到可播放的 H.264 MP4，但本机**原生 MP4 直接导出没有通过**：PyAV 缺少 Manim 0.20.1 所需的 `libx264` 编码器，实际使用原生 WebM 加转码的兼容路径。

| 项目 | 本次实际结果 |
| --- | --- |
| Manim Community | 0.20.1 |
| Python | 3.12.8 |
| 渲染器 | Cairo |
| PyAV / manimpango / pycairo | 18.0.0 / 0.6.1 / 1.29.2 |
| NumPy | 2.5.4 |
| 中文字体 | PingFang SC |
| Manim 原生输出 | VP9 WebM |
| 最终检查的视频 | H.264 MP4，由现有 `libopenh264` 编码 |
| 尺寸 / 帧率 | 960 × 540 / 30 fps |
| 时长 / 实际解码帧数 | 5.0 秒 / 150 帧 |
| 原生 MP4 失败原因 | `UnknownCodecError: libx264` |

AnyVis 设计中的正式目标是 **Manim Community 0.22.1**。本实验只证明上述 **0.20.1** 环境中的行为；不能据此宣称 0.22.1、OpenGL、跨平台打包或正式默认 MP4 导出已经通过。发布环境需要重新验证编码器、字体、LaTeX 和相应版本 API。

## 场景内容与检查

`native_smoke.py` 使用普通 `Scene.construct()` 和标准 Manim API，不替换渲染器，不通过其他绘图库模拟动画。

| 时间 | 原生操作 | 检查 |
| --- | --- | --- |
| 0–1 秒 | `Create(Circle(...))` | 0.50 秒关键帧显示部分圆弧 |
| 1–2 秒 | `Transform(shape, Square(...))` | 1.50 秒出现中间形状；保留源对象身份，目标对象没有额外加入场景 |
| 2–3 秒 | `Write(Text("让形状动起来", ...))` | 2.50 秒显示书写过程，最终汉字可辨认 |
| 3–4.5 秒 | 同一个 `play` 中，形状 `.animate.shift(...).rotate(...)`，标题 `.animate.set_color(...)` | 3.73 秒显示并行变化；终态形状中心为 `(-1.8, 0, 0)`，旋转后的宽度为 `2√2` |
| 4.5–5 秒 | `self.wait(0.5)` | 4.80 秒显示稳定终态 |

这里的 `wait` 是视频中的正常停留时长，不是等待观众操作的暂停节点。位移与旋转遵循 Manim `.animate` 的目标状态插值语义；本实验没有自行定义另一套运动算法。

检查脚本读取并解码最终 MP4，断言尺寸、帧率、H.264 编码、总帧数和时长，并截取五张关键帧，合成一张便于人工查看的图片。中文字体按明确的候选列表寻找，找不到时明确报错，不把缺字方框视为成功。

## 复现主实验

在仓库根目录、已有 Manim 0.20.1 的环境中运行：

```sh
conda activate manim
python experiments/native-manim/run_experiment.py
```

也可以不激活环境：

```sh
conda run -n manim python experiments/native-manim/run_experiment.py
```

脚本使用当前 Python 启动 Manim，并检查版本必须为 0.20.1。除 Manim 自身依赖外，检查用到了已有的 PyAV 与 Pillow；不自动下载或安装依赖，不修改系统字体或 Conda 环境。

如果当前 PyAV 提供 `libx264`，脚本直接使用 Manim 的 MP4 输出。如果没有，它会明确报告采用 WebM，再用 `libopenh264` 转为 MP4；第二种路径要求这两个现有编码器可用。此转码只处理 Manim 已渲染好的帧，不改变场景语义。它是实验的环境兼容措施，不是已决定的 AnyVis 产品实现。

文件都写入本目录的 `output/`：

| 文件 | 用途 |
| --- | --- |
| `output/result.json` | 当前运行的版本、导出路径、MP4 元数据与断言结果 |
| `output/scene-state.json` | 场景语义与终态检查结果 |
| `output/render.log` | 原生渲染日志 |
| `output/media/videos/native_smoke/540p30/native-smoke.webm` | 本次环境的 Manim 原生视频 |
| `output/native-smoke.mp4` | 本次环境经过转码的最终 MP4 |
| `output/contact-sheet.png` | 五个检查时间点的合成图 |
| `output/create-0.50s.png` 等 | 各个检查时间点的完整分辨率图片 |

如果环境支持原生 MP4，视频在 `output/media/videos/native_smoke/540p30/native-smoke.mp4`，具体以 `result.json` 为准。渲染日志可能含运行机器的绝对路径，所有输出均被本目录 `.gitignore` 排除，不提交到仓库。

## 独立 MathTex 实验

本机 `latex` 与 `dvisvgm` 可用。`formula_smoke.py` 已成功用 `MathTex(r"x^2+y^2=1")`、`Write` 和 `wait` 渲染出可辨认的公式，原生 VP9 WebM 为 960 × 540、30 fps、1.5 秒、45 帧。已解码全部帧并人工检查最后一帧。

复现命令：

```sh
conda activate manim
cd experiments/native-manim
python -m manim render --renderer cairo --format webm --fps 30 -r 960,540 \
  --media_dir output/formula-media --disable_caching --progress_bar none \
  -o formula-smoke.webm formula_smoke.py FormulaSmoke
```

本次公式视频位于 `output/formula-media/videos/formula_smoke/540p30/formula-smoke.webm`。主实验不依赖 LaTeX；独立公式实验需要在 `PATH` 中找到 LaTeX 与 dvisvgm。

## 本实验的边界

这是一份可复现的真实渲染证据和环境问题记录。它没有证明 Manim 全 API 覆盖、任意脚本反向生成积木、实时低延迟预览、不同帧率下 updater 一致性或新手易用性；这些需要各自的后续验证。字体、平台和编码器差异也意味着截图不应被当作跨机器逐像素一致的基准。
