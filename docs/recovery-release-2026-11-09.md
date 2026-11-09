# 第六轮：作品恢复与 v0.5.1 发布

基线为 `976a2c7`。用户要求继续改进，并同步更新 GitHub Release；所有变更继续进入 `main`。

## 修复

首次保存会先写作品库，再写当前作品记录。若第二次写入因配额失败，旧恢复逻辑在没有当前记录时直接返回空值，启动时显示模板；当前记录损坏时也有相同问题。现在优先保留有效当前作品的选择，在当前记录缺失或无效时恢复作品库中第一份有效工程，不修改原始保存内容。

重新打开相同 ID 的 JSON/ZIP 备份原先被当作普通编辑，导入前后的撤销记录混在一起。现在显式打开作品会重置撤销与重做；打开后的新编辑仍可正常撤销。普通跨视图编辑与积木布局同步的行为不变。

新增回归在修复前有 3 项失败，修复后全部通过：[失败记录](review-evidence/2026-11-09/round6-before.txt)。

## 本地验证

| 项目 | 结果 |
| --- | --- |
| 应用测试 | [106 文件、641 项通过](review-evidence/2026-11-09/round6-unit.txt) |
| 类型检查、生产构建、桌面准备 | [通过](review-evidence/2026-11-09/round6-build.txt)，仍有大分块警告 |
| 桌面生命周期与隔离打包资源 | [11 项通过](review-evidence/2026-11-09/round6-desktop.txt) |
| 发布计划校验 | `node --test scripts/release-plan.test.mjs`，2 项通过；覆盖错误分支、失败/运行中的构建、不同提交、错误工作流以及安装包缺失、重复、版本不匹配 |

## 发布方式

应用版本由根 `package.json` 和锁文件同步为 **0.5.1**；桌面打包沿用该版本。`desktop/package.json` 的版本属于构建工具自身，不是安装包版本。

新增手动触发的 `Publish tested desktop release` 工作流，输入成功的桌面构建 run ID。它验证构建来自本仓库 `main` 的 push，并验证同一 SHA 的原生 Manim 工作流成功；随后下载该次构建的原始安装包，不重新打包。

发布前要求两个 macOS 架构各有 DMG/ZIP、Windows 有 EXE、Linux 有 AppImage/DEB，共七份，逐一生成 SHA-256。先创建草稿，全部附件上传并核对后才公开；已发布版本不覆盖，不同提交的同名标签/草稿会被拒绝。普通 main push 不自动发布。

[v0.5.1 发布说明](releases/v0.5.1.md)明确安装依赖、签名状态和功能边界。有效 API 行为证据仍为 1,538 / 2,293，未验证 755；本轮不增加该数字。

首次发布运行在附件完整性校验处拦截：electron-builder 对 Linux 目标分别使用 `x86_64.AppImage` 与 `amd64.deb` 命名，初版脚本误用 `x64`。已按真实构建日志修正并加入独立文件名 fixture；没有绕过附件检查，也没有公开缺失附件的版本。发布工具和说明取自触发提交，安装包及应用版本仍取自验证通过的指定构建。

第二次发布已通过安装包与校验和检查，但因目标旧提交与默认分支存在工作流差异，GitHub 在创建 Release 时返回 403。后续发布改为当前 main 的已验证构建，不扩大令牌权限。此限制参考 [GitHub Release API](https://docs.github.com/en/rest/releases/releases#create-a-release)；使用该流程时优先选择当前 main 的成功构建。

## 最终发布结果

北京时间 2026-11-09，[v0.5.1](https://github.com/zhuozheng2006/anyvis/releases/tag/v0.5.1) 已公开并设为 Latest，标签对应 `8a790ebace3070bf1ed54ea4179e4642a3820872`。七份安装包与 `SHA256SUMS.txt` 共八份附件齐全；源码 ZIP/TAR 为 GitHub 另外生成的附件。文件大小、SHA-256 和下载地址保存在[发布证据](review-evidence/2026-11-09/round6-release.json)。

- [三平台桌面构建 42644038028](https://github.com/zhuozheng2006/anyvis/actions/runs/42644038028)：全部成功。
- [原生 Manim 回归 42644038093](https://github.com/zhuozheng2006/anyvis/actions/runs/42644038093)：成功。
- [正式发布 42645096926](https://github.com/zhuozheng2006/anyvis/actions/runs/42645096926)：成功。

发布后的文档整理提交只更新下载入口和证据，不改变安装包所含应用代码。没有保留待合并 PR。
