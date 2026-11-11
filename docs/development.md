# AnyVis 开发指南

AnyVis 使用对象管理器、积木和时间轴编辑同一份 Manim 动画工程，代码视图只读。面向非程序员的常用流程应使用明确的中文动作与参数；高级 API 按需展开。

## 启动

需要 Node.js 22.18+，渲染基线为 Manim CE 0.20.1。安装与 Python 路径配置见[启动说明](../desktop/README.md)。

```sh
npm ci
npm run studio
```

启动器默认打开 `http://127.0.0.1:5174`，引擎使用端口 4317；`--no-open` 可禁止自动打开浏览器。修改服务或编译协议后应重启相关服务，避免前端热更新配上旧引擎。

## 代码入口

| 目录或文件 | 职责 |
| --- | --- |
| `src/studio/StudioApp.tsx` | 主布局、项目状态、预览与视图联动 |
| `src/studio/ObjectManager.tsx`、`authoring.ts` | 对象管理、引用重命名与编辑操作 |
| `src/studio/blocks/` | Blockly 工作区、动作映射、结构化参数编辑 |
| `src/studio/Timeline.tsx`、`timeline-model.ts` | 时间轴组件适配与动作树投影 |
| `src/studio/core/` | 项目类型、积木目录、Manim 编译器、API 注册表 |
| `src/studio/storage.ts`、`project-history.ts` | 保存、恢复及项目级撤销 |
| `src/studio/media-bundle.ts`、`core/assets.ts` | 素材引用与工程打包 |
| `server/` | 本地服务、上传素材、Python 渲染 worker |
| `desktop/` | Electron 宿主、进程生命周期与打包配置 |
| `scripts/` | 启动、构建、API 证据校验和发布工具 |
| `examples/`、`experiments/` | 示例工程、影片制作和原生 Manim 实验 |

`src/App.tsx`、`src/core/` 等保留旧原型兼容入口，`src/main.tsx` 仍可通过 `?legacy` 访问；它们不是无人引用的废文件。新功能在 `src/studio/` 开发。

## 修改时保留的语义

- `Project.actions` 是唯一动画模型。积木、时间轴和代码是它的不同视图，不能另存一套独立动画状态。
- 对象构造的树中位置有执行时机含义，不能统一提前到场景开头。对象名称通过结构化引用更新；删除要检查整个子树的外部依赖。
- 顺序与显式并行有不同语义；时间轴的视觉重叠不等于合法并行动画。动态 API 或回调的未知时长不能伪装成准确秒数。
- 一次拖动形成一次撤销。切分动画必须保持结果；当前不支持的缩放、回弹等切分应明确拒绝，不能重复执行完整动作。
- API 参数的缺省、0、false、空字符串与 null 不等价；保留位置参数、嵌套引用和动态派发。兼容补丁应限定版本并检测能力，不覆盖已修复实现或子类方法。
- 图片、配音和音乐必须进入最终视频。生成的视频过期时必须提示；播放头定位视频，不承诺任意时刻重新执行 Python。
- 项目导入与 AI 生成走相同结构校验；原始代码及敏感 API 权限不能绕过。引入第三方实现前检查许可证。

## 验证与继续开发

提交前按[验证说明](verification.md)执行相关检查。API 的有效行为证据基线为 **1,538 / 2,293**，未验证 **755**；详细分类和机器报告统一放在[覆盖说明](Manim-API-Coverage.md)。新增入口接入或一次成功渲染都不等于完整功能验证。

当前仍需完善：高级 API 的中文引导、复杂工程导航、任意跨轨重叠和复合片段展开、完整关键帧编辑，以及干净机器的安装与 Python/字体/LaTeX 环境配置。Intel Mac 安装包已构建，但缺少对应机器运行验收；发行签名、公证与自动更新尚未完成。

源码成果提交到 `main`，不留待合并 PR。提交前核对远端最新状态，保留已有改动；发布安装包另按[打包说明](../desktop/PACKAGING.md)核对版本、构建提交与附件。发布基线仍为 [v0.5.2](https://github.com/zhuozheng2006/anyvis/releases/tag/v0.5.2)，`main` 可能包含后续改进。
