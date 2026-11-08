# AnyVis → Gemini 开发交接

更新：2026-11-08（北京时间）。本文件是接手入口；历史验证过程见 [验证记录](docs/verification.md)，产品交互约定见 [编辑器设计](docs/editor-timeline-design.md)。本次交接仅整理文档，没有新增应用功能。

## 1. 先看结论

AnyVis 是用 Scratch 风格积木、视频剪辑式时间轴及对象管理器制作真实 Manim 动画的应用，有浏览器本地服务和 Electron 桌面版。开发版本 **0.4.0**。不要重写项目或换掉现有时间轴库，接着补功能、做真实验证、发现问题后修复。

- 仓库：<https://github.com/zhuozheng2006/anyvis>，主分支 `main`。
- 本次交接前主分支：`20f588cb37c5ce9d724495e86d0b30c946eaec79`；交接文档提交会在它之后。开始工作时重新读取当前 HEAD，勿硬编码旧 HEAD 推送。
- 本机工作区：`/Users/zane/Documents/ChatGPT/AnyVis`。
- 本地工作区完整关联 Git 仓库（分支 `main`，远端 `origin`），提交和推送可直接使用原生 Git 操作。
- 已接入 Manim CE **0.20.1** 的 **2,293 个 API 入口**；**1,253 个**有原生行为证据，**1,040 个**尚无逐项行为证据。入口可生成调用不等于行为、参数组合或视觉结果全部正确。
- 345 项应用测试、22 项原生测试入口、6 项证据校验、11 项桌面检查通过。原生 worker、上传图片/配音、钢琴/无声真实视频回归通过。
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
- 空格播放、逐帧定位、Home/End、Shift + 方向键、吸附快捷键；长代码滚动修复。
- 对象语义重命名与引用更新；删除保护覆盖复合动作完整子树及外部引用。
- 图片和音频真实上传、重启后素材可用、带素材的 `.anyvis.zip` 导入导出；服务进行文件与媒体校验。
- 默认钢琴/无配乐设置：新作品记住默认偏好，旧作品缺失字段保持无音乐；背景音乐独立于配音，默认 -18 dB，按实际视频时长铺满，首尾淡入淡出。
- 钢琴是本地确定性合成，不联网，不是外部 AI 作曲服务或真实钢琴采样库。独立 Python 导出包含生成逻辑。
- 完整 API 浏览器、结构化参数/嵌套回调编辑、权限标记、独立 Python 导出、真实 Manim worker、取消和错误定位。
- Electron 打包和最终 ASAR 启动回归，Mac ARM64/x64、Windows、Linux 安装包。

### 尚未完成，不要当成已有功能

1. 剩余 1,040 项 API 逐项行为验证；全参数组合、全部渲染器/平台的视觉验收远未完成。
2. 完整关键帧曲线、任意跨轨动画重叠、嵌套复合片段内展开（时间轴框选/多选、批量移动/删除、动画与等待片段剃刀分割已实现）。
3. 任意时间点重新执行脚本状态；当前播放头定位的是已经生成的视频。
4. Manim 0.22.1 适配。当前固定清单和测试基线为 0.20.1，不能直接升级后沿用旧证据。
5. 干净用户机器的完整安装向导与渲染验收、Intel Mac 实际运行验证、macOS 公证/Windows 发行者签名、Python/字体/LaTeX 环境托管。
6. 大前端分块优化。生产构建通过但仍有大于 500 kB 的分块警告；没有宣称启动性能已优化完毕。

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
