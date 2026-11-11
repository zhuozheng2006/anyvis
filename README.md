# AnyVis

**用积木制作数学动画。**

AnyVis 是基于 Manim 的可视化动画编辑器。添加图形、文字或公式，拼接移动、旋转、变形等动作，再预览并导出视频。适合制作课堂演示、课程作业和数学科普视频；常用操作无需编写 Python。

[下载桌面版](https://github.com/zhuozheng2006/anyvis/releases/latest) · [从源码运行](#从源码运行) · [示例工程](examples/geometry-topology/README.md)

## 有什么特点

- **像搭积木一样编排动画**：支持顺序、同时和重复执行，也能用时间轴调整动作时长与先后关系。
- **面向数学表达**：图形、LaTeX 公式、函数图像、矩阵和三维场景；提供线性变换、微积分等创作工具。
- **真实 Manim 渲染**：预览与成片使用同一套动画逻辑，可导出视频和 Python 源码。
- **作品可以继续修改**：积木、时间轴与只读代码视图同步，支持图片、配音、配乐和项目文件保存；也可借助 AI 生成项目草稿。

## 做出第一段动画

1. **打开示例**：从“示例库”选择一个作品，先播放看看效果。
2. **添加与修改对象**：用快捷按钮或“添加对象”创建图形，在右侧调整名称、颜色、大小和位置。
3. **安排动作**：在积木中选择目标对象，接上移动、旋转等动作；也可以切到时间轴调整时长。
4. **预览与导出**：点击“更新预览”，确认效果后导出视频。用“保存”下载项目备份，以便换设备或继续编辑。

作品会自动保存在当前浏览器或桌面应用中，两者的作品库独立；换设备前请保存项目文件。

## 安装与启动

**桌面版**：在 [Releases](https://github.com/zhuozheng2006/anyvis/releases/latest) 下载适合系统的安装包，支持 macOS、Windows 和 Linux。Mac 的 M 系列芯片选 ARM64，Intel 芯片选 x64。

渲染需要另行安装 **Python 和 Manim**；使用数学公式还需要 **LaTeX**。桌面应用可在“文件 → 运行环境”中选择已安装 Manim 的 Python。[详细环境配置](desktop/README.md)

### 从源码运行

需要 Node.js 22.18+、npm 和已安装 Manim 的 Python 环境。

```sh
git clone https://github.com/zhuozheng2006/anyvis.git
cd anyvis
npm ci
npm run studio
```

启动器会打开浏览器，并同时启动编辑器和本地渲染服务。自动检测不到 Python 时，可通过 `ANYVIS_PYTHON` 指定路径，具体见[启动说明](desktop/README.md)。

项目仍在持续开发，部分高级功能和 Manim API 尚未完整验证。[功能范围与限制](docs/Manim-API-Coverage.md) · [开发文档](docs/README.md)
