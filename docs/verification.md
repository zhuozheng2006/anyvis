# 验证说明

每份结果只证明对应提交、环境和测试范围。`main` 的源代码改进与公开安装包的版本应分别核对。

## 2026-11-11 对象窗口与仓库整理

添加对象和全部参数窗口支持自动聚焦、Tab 首尾循环、Esc 关闭与返回原按钮；嵌套参数编辑器和中文输入法保留各自的键盘行为。清理 17 份旧设计、重复交接和旧截图，集中开发文档并检查相对链接。

本地 108 个文件的 658 项应用测试、11 项桌面测试与生产构建通过；新增 6 项窗口交互回归使用 jsdom。本轮没有重新执行浏览器视觉验收或 Manim 渲染，不沿用旧轮次的检查冒充本轮结果。

## 本地检查

```sh
npm test
npm run build
npm run test:desktop
node --test scripts/release-plan.test.mjs
```

应用测试覆盖数据模型、编译、编辑操作及 DOM 交互；生产构建包含 TypeScript 和 bundle 检查。桌面测试检查生命周期和隔离服务，不代替实际安装或浏览器视觉验收。

修改服务或渲染逻辑时，再按影响范围运行 `npm run test:server`、`npm run test:render`、`npm run test:media` 和 `npm run test:music`。渲染检查需要配置已安装 Manim 的 `ANYVIS_PYTHON`，以及相应字体、LaTeX、FFmpeg 依赖。

## API 行为与渲染证据

- `npm run test:api-native`：通过实际 Manim 调用验证几何、状态及返回值。
- `python scripts/test_verify_api_registry.py`：验证证据收集与校验规则。
- `npm run test:opengl-render`：独立像素检查，要求可用图形环境。
- [原生 CI 配置](../.github/workflows/native-api.yml)列出各报告环境变量和完整汇总命令。单独 `npm run api:verify` 不会自动附加行为报告。

当前有效行为基线为 **1,538 / 2,293**。源码、锁文件、注册表及引擎版本指纹必须匹配；失败与 fixture gap 不计通过，不使用弱断言凑覆盖率。[覆盖边界与机器报告](Manim-API-Coverage.md)

OpenGL 的 77 项状态证据不创建图形上下文。Linux Mesa softpipe 的单场景像素检查是另一类证据，不能据此宣称全部 OpenGL API 已通过。Mac 本机图形上下文不可用时应记录跳过，不能记为成功。

## 最新桌面测试包

[下载 v0.5.2](https://github.com/zhuozheng2006/anyvis/releases/tag/v0.5.2)，含 macOS ARM64 / x64 的 DMG、ZIP，Windows x64 EXE，Linux x64 AppImage、DEB，以及 SHA256SUMS.txt。对应提交 `e0e544853a9cd4daf2acc3d26498c8dc9367f03a`。

[桌面构建](https://github.com/zhuozheng2006/anyvis/actions/runs/42661271615)和[原生回归](https://github.com/zhuozheng2006/anyvis/actions/runs/42661271689)通过。macOS ARM64、Windows、Linux 的检查启动了最终 ASAR 应用；Intel Mac 为交叉构建，缺少对应硬件实测。安装向导、外部 Python 环境、签名和公证仍有独立验收边界，见[打包说明](../desktop/PACKAGING.md)。

## 可追溯记录

- [界面与积木设计复核](ux-block-design-v0.5.2.md)：发布版本的窗口尺寸、布局、积木与真实预览检查。
- [对象导航与 README](object-navigation-2026-11-11.md)：后续 main 改进及 DOM 测试范围。
- [恢复与发布](recovery-release-2026-11-09.md) · [素材工作流](media-workflow-2026-11-09.md) · [按需加载](performance-2026-11-09.md)。
- [核心修复复验](fixes-2026-11-09.md) · [独立验收](acceptance-2026-11-09.md)：覆盖口径修正和具体缺陷。

旧原型与重复开发流水账已从当前目录移除；需要历史结果时按 Git 提交查询，不把旧测试数字当成当前状态。
