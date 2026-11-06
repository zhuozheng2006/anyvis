# AnyVis 启动与可选桌面宿主

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

`desktop/main.cjs` 是可选 Electron 宿主。它只打开本地服务，关闭 Node integration、启用 context isolation 和 sandbox；不会给网页提供任意文件或进程 IPC。安装 Electron 后：

```sh
npm install --save-dev electron
node scripts/start-studio.mjs --production --desktop
```

本次环境无法解析 npm registry，Electron 未安装，**桌面宿主尚未实际运行验证**。当前交付入口是浏览器加本地真实 Manim 服务。启动器语法检查与命令帮助已通过，但本次工具环境在监听新本地端口时返回 EPERM，因此没有在该受限环境中完成启动器的 HTTP 联调。应在允许本地监听的终端运行上述启动命令验收。此目录不代表已经完成独立安装包、Python/字体/LaTeX 打包、签名、公证或跨平台发行。

## AI 接口

前端 `src/studio/ai/project-assistant.ts` 提供：

- `buildPrompt(project, request)`：根据实际积木目录构造提示词，可复制给外部 AI。
- `parseAIProject(text, current?)`：读取 JSON 或一个 JSON 代码围栏，检查项目结构和编译诊断；拒绝代码扩展，清除过期工作区坐标，保留当前项目 ID。

`desktop/ai-proxy.mjs` 导出 `generateProject(body, {signal?})`，供服务端 `POST /api/ai` 调用。请求体 `{endpoint, model, key, prompt, project}` 中 `prompt` 是用户的自然语言需求。返回 `{project, summary, usage?}`。

模型服务地址可填 HTTPS 基础地址（例如 `https://api.openai.com/v1`）或本机 HTTP 服务；模块使用 Chat Completions 兼容接口。密钥只存在于本次请求内存，不写日志、项目或本地存储。不会自行读取环境密钥，也不会自动重试付费调用。请求最多两分钟、输出最多 12,000 token；超过上限或验证失败时保持原作品。未配置密钥仍可使用复制提示词与粘贴项目的流程。

OpenAI 请求字段依据官方 [Chat Completions API 文档](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。兼容服务的接口差异仍需实际服务验收；本次不使用用户密钥或代替用户发送付费模型请求。

## 本次验证

- 启动器、Electron 宿主及 AI 代理 JavaScript 语法检查通过；`--help` 正常。
- AI helper 及核心依赖图的 TypeScript strict / unused 检查通过。
- `vitest run src/studio/ai/project-assistant.test.ts desktop/ai-proxy.test.mjs`：9 项通过。覆盖 JSON 导入、代码拒绝、对象引用校验、项目身份、请求次数、失败与截断响应。
- 模型接口使用 mock 测试，没有借用用户密钥发出付费请求。Electron 缺少依赖，HTTP 启动受到本次环境 EPERM 限制，均不记为已通过的界面验收。
