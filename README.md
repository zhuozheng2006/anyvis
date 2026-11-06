# AnyVis

**用 Scratch 风格的积木制作真正的 Manim 动画，并让 AI 帮助生成和修改可编辑的作品。**

项目正在从 v0.1 交互课件原型转向积木动画创作工具。完整产品与技术方案见 [AnyVis v0.2 设计方案](docs/AnyVis-Design-v0.2.md)。方案先于新架构实现，文档里的目标不等于当前已支持。

## 产品方向

- 积木是默认入口：创建对象、播放动画、顺序 / 同时执行、参数变化、函数关系和可复用组件。
- 预览和视频使用真实 Manim，避免另外模拟一套动画效果。
- 正式成品优先 Electron 桌面版，管理 Python、Manim、字体与公式工具链；浏览器保留为开发入口。
- 时间轴和高级节点图编辑同一项目模型，按需展开。
- AI 修改结构化项目，结果仍可通过积木调整。
- 删除观众交互暂停机制，保留作品中的普通等待与参数动画。
- 逐项登记并验证 Manim 公共创作 API；代码扩展不算原生积木覆盖。

## 当前代码状态

`src/` 仍是 **v0.1 历史原型**：React、Blockly、React Flow、SVG / Three.js，尚未接入 Manim。它用于保存可运行基线，仍包含即将移除的交互暂停；新版不会继续以这套播放语义为基础。详细历史说明见 [v0.1 README](docs/archive/v0.1-README.md)。

新版本的阶段、验收门槛、迁移方式、桌面 / 网页取舍与研究来源均在设计文档中。API 清单是只读研究库存，不是已实现功能列表。

## 运行现有原型

需要 Node.js 22.12+ 与 npm：

```sh
npm ci
npm run dev
```

浏览器打开终端显示的本地地址。macOS 也可以双击 `start-anyvis.command`。现有草稿保存在浏览器中；更换版本前先导出需要保留的项目。

```sh
npm test
npm run build
```

验证结果及尚未完成的界面验收见 [验证记录](docs/verification.md)。

## 研究与协作

- [完整设计方案](docs/AnyVis-Design-v0.2.md)
- [Manim 0.20.1 API 清单](docs/research/manim-ce-0.20.1-inventory.json)
- [可复现的 API 扫描脚本](docs/research/inventory_manim.py)

正式引擎目标为 Manim CE 0.22.1；本机 0.20.1 仅用于前期调研和 P0 验证。各阶段按可验证成果及时提交，记录改变及验证状态，不等全部完工才上传。

主要复用方向：Manim、Blockly、React、Electron、CodeMirror、React Flow。ManimWire 用作架构研究参考；其 LICENSE 含 Commons Clause，当前不复制其实现。
