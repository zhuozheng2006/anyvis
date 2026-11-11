# AnyVis 启动与桌面宿主

开发版本需要已经安装 Node.js 22.18+ 和 Manim Python 环境。启动器不会修改已有 Conda 环境。

```sh
npm ci
node scripts/start-studio.mjs
```

启动器同时运行本地 Manim 服务（默认 4317）和编辑器（默认 5174），就绪后打开浏览器。它不会停止已有的旧版 5173 服务。按 Ctrl+C 只关闭本次启动的子进程。macOS 可双击 `scripts/start-studio.command`；Windows 可运行 `scripts/start-studio.ps1`。

生产构建使用：

```sh
npm run build
node scripts/start-studio.mjs --production
```

可配置 `ANYVIS_PYTHON`、`ANYVIS_PORT`、`ANYVIS_UI_PORT`。`--no-open` 只启动服务而不打开浏览器。

## Electron

`desktop/main.cjs` 现在自行启动和关闭本地引擎，无需先运行终端服务。主进程使用随机空闲端口，编辑器始终加载 `anyvis://studio/`，因此端口变化不会改变项目存储地址。渲染缓存位于 Electron 的用户数据目录；退出时取消工作进程并关闭服务。

首次准备桌面开发环境：

```sh
npm ci
npm run desktop:install
npm run install:runtime --prefix desktop
npm run desktop
```

`desktop:install` 安装独立的 Electron / electron-builder 工具，不改变浏览器版的依赖锁。`desktop:prepare` 先构建页面，再把 Node 引擎和 TypeScript 编译器打包成不依赖外部源码或 npm 包的 ESM 文件。已准备后可用 `node scripts/launch-desktop.mjs` 直接启动。旧的 `start-studio.mjs --desktop` 会转交给该独立宿主，不再启动另一份服务器。

在“文件 → 运行环境”中可选择已安装 Manim 的 Python，可保存后重新连接或留空恢复自动检测。设置持久化为用户数据目录下的 `desktop-settings.json`；不修改 Conda 环境。引擎启动失败会显示中文诊断和重试按钮。应用安装包包含页面、Node 引擎和 Python worker；**Python / Manim、LaTeX 和字体仍使用外部环境**。

浏览器和桌面是不同的项目存储空间。已有浏览器作品需先保存项目，再在桌面导入；带素材的作品使用包含素材的 ZIP 备份。桌面编辑器不启用 Node integration，保留 context isolation、sandbox 和 CSP，禁用外部页面导航。只有设置窗口有经过来源校验的窄 IPC；剪贴板仅对可信界面允许文字写入，禁止读取权限。

安装包命令、三平台 CI 和发行边界见 [PACKAGING.md](./PACKAGING.md)。当前公开版本为 [v0.5.2](https://github.com/zhuozheng2006/anyvis/releases/tag/v0.5.2)，Mac M 系列芯片选择 ARM64，Intel 芯片选择 x64。[检查范围](../docs/verification.md#最新桌面测试包)区分了构建、最终应用启动与真实安装验收。

## AI 接口

前端 `src/studio/ai/project-assistant.ts` 提供：

- `buildPrompt(project, request)`：根据实际积木目录构造提示词，可复制给外部 AI。
- `parseAIProject(text, current?)`：读取 JSON 或一个 JSON 代码围栏，检查项目结构和编译诊断；拒绝代码扩展，清除过期工作区坐标，保留当前项目 ID。

`desktop/ai-proxy.mjs` 导出 `generateProject(body, {signal?})`，供服务端 `POST /api/ai` 调用。请求体 `{endpoint, model, key, prompt, project}` 中 `prompt` 是用户的自然语言需求。返回 `{project, summary, usage?}`。

模型服务地址可填 HTTPS 基础地址（例如 `https://api.openai.com/v1`）或本机 HTTP 服务；模块使用 Chat Completions 兼容接口。密钥只存在于本次请求内存，不写日志、项目或本地存储。不会自行读取环境密钥，也不会自动重试付费调用。请求最多两分钟、输出最多 12,000 token；超过上限或验证失败时保持原作品。未配置密钥仍可使用复制提示词与粘贴项目的流程。

OpenAI 请求字段依据官方 [Chat Completions API 文档](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。兼容服务的接口差异仍需实际服务验收；本次不使用用户密钥或代替用户发送付费模型请求。
