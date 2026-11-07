# 形状不只一种看法：几何与拓扑

30分钟字幕讲解影片，1280×720、24fps。六章各5分钟，每章12镜，每镜25秒。无配音或音乐。内容由一条问题线组织：究竟允许什么变化，才把两种形状视为相同？

| 时间 | 章节 |
| --- | --- |
| 00:00–05:00 | 先约定，什么才算“同一种形状”？ |
| 05:00–10:00 | 距离和角度，怎样把形状约束住？ |
| 10:00–15:00 | 从连续对应到同胚，动画能证明多少？ |
| 15:00–20:00 | 点、边与面，为什么总有一个2？ |
| 20:00–25:00 | 把手、边界和定向，为什么不能只数洞？ |
| 25:00–30:00 | 带着边界使用工具，重新回答开场问题 |

## 在 AnyVis 中编辑

打开“我的作品 → 打开项目文件”，选择 `codex/chapter-01.anyvis.json` 至 `chapter-06.anyvis.json` 中任一文件。各章节都是原生积木，按镜头命名的段落默认折叠；点击右侧子步骤即可展开并定位。也可以打开任一 `shot-XX-YY.anyvis.json`，单独调整或渲染25秒镜头。

使用这些项目的版本应包含文字 `maxWidth` 和段落 `label` 字段。生成器不会保留编辑器中的人工改动；修改后请导出为另一个项目文件，避免重新生成覆盖。

## 复现主片

从仓库根目录执行，Python 路径换成安装了 Manim 的解释器。合成脚本需要该环境中的 PyAV（Manim使用的媒体依赖）。

```sh
npm ci
node examples/geometry-topology/codex/generate.mjs
node examples/geometry-topology/codex/chapters.mjs
node scripts/render-projects.mjs --manifest examples/geometry-topology/codex/manifest.json --python /path/to/python --output artifacts/geometry-topology/final-shots --jobs 2
/path/to/python scripts/assemble-project-video.py --report artifacts/geometry-topology/final-shots/render-report.json --output artifacts/geometry-topology/AnyVis-Geometry-Topology-30min.mp4
```

批量入口先校验全部项目，拒绝需要执行任意Python的项目，再调用与应用一致的编译器和worker。它支持1–4个并发作业、失败定位及缓存复用。项目、编译器或worker变化会失效缓存；更换Manim、字体或外部渲染环境时请加 `--force`。`--check` 只校验不渲染。运行结果、日志与来源映射保存在输出目录。

合成器核对镜头尺寸、帧率、编码与时长；只容许Manim结尾一帧的舍入误差，按著作时长截断该额外帧。最终逐帧解码并检查时间戳、帧数与SHA256。视频不是单张图片延长30分钟，所有动画来自各镜头的原生编排。

## Gemini 样片

`gemini/chapter-01.anyvis.json` 为Gemini 3.8 Flash通过原生积木制作的五分钟版本，可以同样导入。其生成器、真实返工记录见同目录。

```sh
node scripts/render-projects.mjs --manifest examples/geometry-topology/gemini/manifest.json --python /path/to/python --output artifacts/geometry-topology/gemini --jobs 1
```

该样片与主片主题相近但脚本、长度和审阅轮次不同，不适合直接比较总耗时。主片采用AI通过项目API编排积木，并非逐块人工拖拽；两种路径均没有手写Manim Scene或使用代码扩展积木。

详见[内容方案](../../docs/geometry-topology-film-plan.md)、[制作验收记录](../../docs/geometry-topology-production.md)。
