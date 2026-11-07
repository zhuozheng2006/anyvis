# AnyVis 开发接续记录

更新：2026-11-08（北京时间）。仓库：[zhuozheng2006/anyvis](https://github.com/zhuozheng2006/anyvis)，分支 `main`。

当前开发版本 v0.4.0：开源 React Timeline Editor、对象管理、图片/音频上传与真实混音、素材 ZIP、三视图同步与共享撤销已实现。最新测试范围见 [验证记录](verification.md#v040-时间轴对象与素材2026-11-08)。当前本地没有 Git 元数据，使用 GitHub Git Data API 基于远端树增量提交。

## 发布状态

用户已于 2026-11-08 明确授权将本轮 67 个项目文件提交到 `zhuozheng2006/anyvis` 的 main 并运行三平台 CI。基线为 `2f405b7388694383c88949d99594f7111e5382d3`；发布采用基于现有树的增量提交并使用 expected_sha，保留远端其他文件。当前本地验收通过，独立 CI 的最终结果另记于验证记录。第三方许可说明在 public 中，随桌面资源打包。

## v0.4.0 接续检查点

五份原生证据共 599 个不同 API，新增 utilities 与 mutations fixture。运行 `npm run test:api-native` 前设置五个 `ANYVIS_API_*REPORT` 路径，再将五份报告都传给 verify-api-registry.py；完整命令见 API 覆盖文档。当前 authoringProtocol=3，331 项 Vitest、媒体真实集成及桌面资源准备通过。

UI 已用 React Timeline Editor 1.0.0；动画顺序联动、音频独立时间位置与入点。框选、剃刀、关键帧曲线和任意动画重叠尚未实现。库交互不能直接代替 Manim 调度，继续以 Project.actions 为唯一事实来源。素材真实文件位于本地服务缓存，工程通过 ZIP 携带它们；测试输入和生成输出不提交。

## v0.3.1 接续检查点

本轮另修复 npm 审计发现的 4 项依赖告警：mathjs 15.2.0、Vitest 5.1.0，升级后审计为 0，287 项应用测试及原生/媒体/桌面构建复验通过。证据绑定 package-lock.json。首次 Ubuntu 原生审计缺少显示环境，已通过 Xvfb 修复（仅模块导入验证，不能算 OpenGL 渲染）。

本轮扩展原生测试到 419 个不同 API：`api.native.spec-node.mjs`、`api-families.native.spec-node.mjs`、`api-queries.native.spec-node.mjs`。对应三份报告位于 `artifacts/api/`，合并审计为 `docs/research/api-registry-verification.json`；报告绑定注册表、编译器和 fixture 哈希，改动运行时后必须重新执行，不能复用旧报告。六组家族共 544 次调用断言；200 项只读差分中 199 项通过，NumberLine.get_labels 的默认原生实例报错被明确列为 gap。

新增 `$float`、`$method` 参数；嵌套调用改为接收对象动态方法分派，修复 RGB 类型与子类 override 问题。UI 少字段积木所有参数现在可见。authoringProtocol 升为 2，旧 Node 后端需重启。递归参数树和弹窗改进由主代理实现并经 Gemini 3.8 Flash High 协作审查；模型第一次提交的草稿回退/observer 清理/视口定位仍存在问题，已回修，并由主代理补充结构化值默认进入可视树、畸形回调参数名无损保存回归；287 项 Vitest、生产构建与桌面资源准备通过。Chrome 768×819 视口中正文滚动、操作栏可见；最终验证结果见 verification.md。

新增 `examples/api/typed-values.anyvis.json`（17 块、13.17 秒）与生成/渲染脚本。输出视频 316 帧已全部解码并查看关键帧，未加入仓库媒体附件；可按 examples/api/README.md 复现。新增 Native Manim API regression CI；最终桌面构建结果见验证记录。

仍未完成：1,874 个入口逐项行为证据、533 个 OpenGL 专属入口真实渲染、Manim 0.22.1 适配及目标机器安装验收。**已有 2,293 项入口全接入，不代表这些工作已完成。** 本机 OpenGL 默认上下文 cannot choose pixel format，EGL 无法导入；不能将其计为通过。

## 本轮接续

中断时 v0.3.0 的 47 个新增或修改文件仅保存在本地，GitHub 主分支仍为 `c3f43b0`。已比对 Git blob 哈希，保留远端全部现有文件，并提交 API 扩展、参数曲线示例和桌面验证改进：`b01b38e3f1d7a0a1b07fe0c6d4fc3e2e27cfe3c9`。

[对应桌面工作流](https://github.com/zhuozheng2006/anyvis/actions/runs/42379201910)。时序修复提交 `c31aa313aec4a505c639ec0077ac41f87360847b` 的[后续构建](https://github.com/zhuozheng2006/anyvis/actions/runs/42379483960)覆盖相同应用代码。最终结果与下载入口以 [验证记录](verification.md#最新桌面测试包) 为准。

本地工作目录当前没有 `.git` 元数据；上传通过 GitHub Git Data API 完成。再次接续时先读取远端 `main` 与递归 tree，用 Git blob 哈希比对本地内容；不要从本目录 `git status` 的失败推断源码丢失，也不要用旧临时目录覆盖当前源码。暂存目录和旧发布清单只用于历史比对。

## 已复验

- 252 项 Vitest 测试、10 项桌面宿主/独立 bundle 测试、6 项服务测试通过。
- 真实 Manim API 测试通过：27 个不同 API，含几何、属性、返回值、回调、updater、动画组合和上下文恢复。
- 服务到真实 Manim 的集成测试通过：媒体输出、错误定位与取消。
- 2,293 个 API 入口、2,765 项常量解析通过，2,117 项可检查签名一致；生成器 `--check` 通过。
- 10 项旧覆盖审计测试、离线调度/扩展检查、72 个 TS/TSX 文件语法检查通过。
- TypeScript/Vite 生产构建与桌面资源准备通过。大分块警告仍存在。

桌面 smoke 新增真实 API 搜索/添加操作；CI 在构建安装包后启动 `release/` 中的最终应用，验证 `app.isPackaged`、`app.asar` 路径和外置 worker，并重复视频/Range/重启存储检查。它仍不等同于运行安装向导，也不等同于在没有 Python 的 CI 上完成 Manim 渲染。

## 后续重点

1. 完成目标用户机器的安装、Python 环境选择与真实渲染验收；Mac Intel 架构需要实际运行验证。
2. 扩充按 API 家族分类的真实行为和视觉测试；2,293 项入口覆盖不等于全部参数组合都正确。
3. 为 533 项 OpenGL 专属入口建立可用后端的真实渲染验证；当前本机 glcontext 缺少 EGL。
4. 改善复杂嵌套回调的可视编辑，以及 API 搜索、参数输入和大目录加载体验。
5. 审核并纳入 CI 实际生成的桌面依赖锁文件，再将工具安装切换为 `npm ci --prefix desktop`。

当前验证基线固定 Manim CE 0.20.1 / Python 3.12 / Cairo；0.22.1 尚未安装验证。已有 30 分钟几何与拓扑影片及其可编辑工程继续保留，见 [影片记录](geometry-topology-production.md)。

## 本轮发现并修复的 CI 问题

第一轮 macOS CI 在多行代码撤销测试失败：固定等待 15 ms 早于 Blockly 的 requestAnimationFrame + setTimeout 事件派发。六组字段/引用测试改为共享的 `flushBlocklyEvents`，等待真实调度边界；多行代码测试加入 40 ms 慢帧，验证撤销/重做仍正确。未通过关闭断言或简单重跑掩盖问题。

## 最终交付状态

修复后的[构建42379483960](https://github.com/zhuozheng2006/anyvis/actions/runs/42379483960)三平台全部成功，安装包及检查报告均已上传；本地 292 个已跟踪文件逐项哈希核对，仅文档收尾存在预期差异。应用源提交为 `c31aa313aec4a505c639ec0077ac41f87360847b`，后续文档提交不改变已验证应用代码；当前工作流的 desktop/** 过滤也包含桌面文档，因此可能额外触发相同应用代码的构建。新版下载入口已统一更新为 v0.3.0。
