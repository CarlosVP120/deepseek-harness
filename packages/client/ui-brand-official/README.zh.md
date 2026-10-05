---
description: "面向侧栏和对话界面的 EQIDIS AI 品牌填充；供替换公司图形的维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

[English](README.md) | 中文

此 EQIDIS AI 分支在所有构建配置中，将公司的珊瑚色/紫色标志和随主题变化的矢量字标注册到侧栏及对话首页。桌面应用图标和浏览器图标采用相同标志。为保持组合兼容性，上游包名保持不变。

## 概述

本包在侧栏显示 EQIDIS 标志与字标，在对话首屏显示标志。所有构建配置都会注册品牌；本包不保留运行时状态，也不影响模型请求。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 EQIDIS 部署中，将本插件挂载到浏览器插件名单。

### 选择 profile

品牌注册独立于 `DSH_CLIENT_BUILD_PROFILE`；本地和官方构建都显示 EQIDIS 图形。

### 替换品牌

替换品牌需要替换侧栏与对话首屏 slot 的填充。本包不提供运行时品牌配置。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

三个填充在侧栏及对话首屏 slot 声明后一起注册。嵌套的 `ctx.slots.inject()` 调用会在声明消失时撤回注册。浏览器入口是 [`src/client/index.ts`](src/client/index.ts)；Node 入口不执行操作。浏览器标题由 slot 系统以外的 `DSH_CLIENT_TITLE` 选择。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当品牌面不够用时阅读以下页面。它们从本包占据的 slot 进入渲染这些 slot 的外壳。

- [ui-sidebar](../ui-sidebar/README.zh.md)——声明 `sidebar.brand.mark` 与 `sidebar.brand.name` 并渲染其回退。
- [ui-conversation](../ui-conversation/README.zh.md)——在首屏声明 `conversation.hero.brand.mark`。
- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md)——浏览器插件行如何加载并注册 slot。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了品牌呈现的供给方式。它们是当前包约束，不是品牌设计对比或任务积压。

- **只有一组填充**——替代呈现属于占据相同 slot 的另一个 Cordis 包。
- **浏览器标题独立**——`DSH_CLIENT_TITLE` 在构建时选择标题文本，而非通过 UI slot。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
