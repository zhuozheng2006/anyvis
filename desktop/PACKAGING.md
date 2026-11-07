# 桌面安装包构建与验收

这套配置把编辑器、Electron 宿主和本地服务打包为 AnyVis 桌面应用。桌面进程负责启动和关闭自己的服务，不需要用户另外打开终端。Manim 的 Python 环境仍是外部依赖，可在桌面菜单中选择 Python 解释器路径并持久保存；当前安装包不包含 Python、Manim、LaTeX 或额外中文字体。

**v0.3.0 状态：三平台构建与最终 ASAR 应用启动已通过。** [构建42379483960](https://github.com/zhuozheng2006/anyvis/actions/runs/42379483960) 对应 `c31aa313aec4a505c639ec0077ac41f87360847b`，最终应用启动覆盖 Mac ARM64、Windows x64、Linux x64，另生成 Intel Mac 安装包。[下载与检查报告](../docs/verification.md#最新桌面测试包)。本机仍未完成安装包安装与外部 Manim 渲染验收；首次正式发行前需完成本文末尾清单。

2026-11-06，[构建 42295108033](https://github.com/zhuozheng2006/anyvis/actions/runs/42295108033) 已成功完成三平台真实 Electron 启动检查和安装包构建。对应提交为 `5b7e5545f9475e9dad62f530be1ba089b59fbfe2`：

| 平台 | 本次生成的附件 |
| --- | --- |
| macOS | [旧构建的合并附件](https://github.com/zhuozheng2006/anyvis/actions/runs/42295108033/artifacts/13540949516)；后续构建已改为按 ARM64 / x64 分开提供，见下方下载说明 |
| Windows | [x64 NSIS 安装程序](https://github.com/zhuozheng2006/anyvis/actions/runs/42295108033/artifacts/13540989138) |
| Linux | [x64 AppImage 与 DEB](https://github.com/zhuozheng2006/anyvis/actions/runs/42295108033/artifacts/13540979175) |

这些 Actions 附件保存至 2026-11-20，下载需要 GitHub 登录；未发布为 GitHub Release。以后提交生成的附件应按其提交 SHA 核对。此结果证明该提交能构建安装包和运行准备后的桌面应用，尚不能替代实际安装、最终 ASAR 路径和外部 Manim 环境的验收。

## 固定工具版本

`desktop/package.json` 只保存构建工具的 `devDependencies`，不会成为应用内的依赖目录：

| 工具 | 固定版本 | 官方来源 |
| --- | --- | --- |
| Electron | 45.2.3 | [Electron 发布记录](https://releases.electronjs.org/release/v45.2.3) |
| electron-builder | 26.18.1 | [electron-builder 发布记录](https://github.com/electron-userland/electron-builder/releases/tag/electron-builder%4026.18.1) |

以上版本于 2026-11-06 核对。构建用 Node.js 24，项目要求至少 22.18。根目录应用依赖使用现有 `package-lock.json` 和 `npm ci`。本机尚未安装桌面工具，因此没有手工编造 `desktop/package-lock.json`；CI 首次用 `npm install --prefix desktop` 解析工具依赖，并将实际生成的锁文件上传到检查附件。顶层工具版本已固定，但在锁文件纳入版本管理前，间接依赖仍可能变化。网络恢复后应审核并提交真实生成的锁文件，再把桌面工具安装改为 `npm ci --prefix desktop`。

## 本机构建

从仓库根目录运行，在 macOS、Windows、Linux 上分别构建对应平台安装包：

```sh
npm ci
npm install --prefix desktop --no-audit --no-fund
npm run install:runtime --prefix desktop
npm run desktop:prepare
```

Electron 45 将可执行文件下载移到了首次运行时。`install:runtime` 显式调用已固定版本的官方 `install-electron` 入口，确保 CI 在启动和设置 Linux sandbox helper 之前已取得程序文件。它遵循该包的校验和与缓存流程；不用额外镜像，也不跳过校验。参见 [Electron 安装文档](https://www.electronjs.org/docs/latest/tutorial/installation#binary-download-step)。

准备脚本生成 `desktop-build/app/`，其中只包含 `main.cjs`、`host.mjs`、`preload.cjs`、设置页、打包后的 `server.mjs`、应用 `package.json` 和 `dist/`。服务器 JavaScript 依赖已合并到 bundle，无需在安装目录运行 npm。

```sh
# macOS：分别生成 Apple Silicon 和 Intel 安装包
node desktop/node_modules/electron-builder/cli.js --config desktop/builder.config.cjs --publish never --mac --arm64 --x64

# Windows：x64
node desktop/node_modules/electron-builder/cli.js --config desktop/builder.config.cjs --publish never --win --x64

# Linux：x64
node desktop/node_modules/electron-builder/cli.js --config desktop/builder.config.cjs --publish never --linux --x64
```

产物写入 `release/`：macOS 为 DMG 和 ZIP，Windows 为 NSIS EXE，Linux 为 AppImage 和 DEB。文件名包含应用版本、平台和架构。应用代码放入 ASAR；`server/worker.py` 单独进入资源目录的 `runtime/worker.py`，供已配置的外部 Python 执行。构建规则只读取准备目录及这一个 worker，不打包工程源文件、缓存或本机 Python 环境。

Windows 使用可选择安装位置的向导。macOS 使用本地 ad-hoc 签名并关闭 hardened runtime，以兼容 Apple Silicon 启动；它不提供 Developer ID 身份验证，也没有公证。Windows 没有发行者签名。系统可能显示来源验证提示，这些产物暂不应描述为完成正式签名的公开发行版。

## 启动检查与 CI

`.github/workflows/desktop.yml` 可手动运行，也会在相关源码的主分支提交或 PR 时执行三平台任务。每个任务安装依赖、运行应用测试、准备应用、启动实际 Electron 窗口检查，再构建安装包；工作流只有仓库读取权限，配置 `publish: null` 并显式传入 `--publish never`，不会创建 GitHub Release 或发布安装包。

检查调用形式：

```sh
<平台对应的 Electron 可执行文件> desktop-build/app --smoke-test --smoke-result=<绝对路径>/smoke-result.json
```

Electron 路径：

| 平台 | 可执行文件 |
| --- | --- |
| macOS | `desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron` |
| Windows | `desktop/node_modules/electron/dist/electron.exe` |
| Linux | `desktop/node_modules/electron/dist/electron` |

Linux 使用 Xvfb，并为当前 CI 临时环境中的 Chromium sandbox helper 设置官方二进制需要的属主和权限；不会通过 `--no-sandbox` 关闭渲染器沙箱。

检查会启动实际本地服务，等待 Studio 标题栏及 Blockly 工作区出现，打开 API 浏览器、搜索 Circle 并添加积木，再通过固定协议验证会话、携带 token 的 POST、视频 Range 请求和浏览器视频解码。随后重启内部引擎，确认固定地址下的本地存储仍可读取。成功退出 0，失败退出 1，整体有 30 秒超时。

未安装 Manim 时允许壳启动检查通过；环境尚未检测完成时报告 `health.available: false, checking: true`，并不代表确认缺少环境。这项检查不能证明 Manim 渲染成功。CI 还会运行桌面生命周期和隔离 bundle 的 Node 回归测试。v0.3.0 增加第二轮检查：安装包构建后运行 `node scripts/check-packaged-desktop.mjs`，启动 `release/` 下的最终应用，要求 `app.isPackaged` 为真、应用路径为 `app.asar`、外置 worker 存在，并重复上述界面与协议检查。Linux 通过 Xvfb 运行并保留 Chromium sandbox。这可以验证实际 ASAR 资源路径，仍不能代替安装向导或外部 Manim 环境验收。macOS 的启动检查只覆盖 runner 本身的架构，不同时证明另一架构可运行。

成功的安装包保存为以下工作流附件，保留 14 天。macOS 按架构分开上传，避免把四个文件合为一个过大的压缩包：

| 使用的系统 | 选择的附件 |
| --- | --- |
| Apple Silicon Mac（M 系列） | `AnyVis-macOS-arm64-<提交 SHA>`，包含该架构 DMG / ZIP |
| Intel Mac | `AnyVis-macOS-x64-<提交 SHA>`，包含该架构 DMG / ZIP |
| Windows x64 | `AnyVis-Windows-<提交 SHA>` |
| Linux x64 | `AnyVis-Linux-<提交 SHA>` |

准备目录的 `smoke-result.json`、最终 ASAR 的 `packaged-smoke-result.json` 和本次真实解析的桌面工具锁文件另存为 `AnyVis-<平台>-checks-<提交 SHA>`。下载后核对提交 SHA。若构建失败，检查附件可能只含锁文件，应查看失败日志，不能据此判断启动通过。

## 正式发行前的安装验收

1. 在目标平台实际安装并首次启动，确认不需要另开终端，关闭后没有残留服务进程；同时确认第二次启动能恢复作品。
2. 选择有效 Python 路径并重启，确认设置保存；测试缺少或无效 Python 时的明确错误与修复入口。
3. 用本机 Manim 实际渲染二维、公式和三维模板；确认中文字体、LaTeX 和导出文件行为符合文档，而不是仅播放内置预渲染视频。
4. 检查最终安装后的 ASAR 和 worker 路径、用户数据位置、Windows 安装向导、Linux AppImage 与 DEB 启动；macOS 分别验证 ARM64 和 x64。
5. 确定代码及分发依赖的许可证、图标和发行说明，再配置开发者签名、公证及发布渠道。当前配置不提供自动更新。

配置依据：[electron-builder 26.18.1 schema](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.1/packages/app-builder-lib/scheme.json)。
