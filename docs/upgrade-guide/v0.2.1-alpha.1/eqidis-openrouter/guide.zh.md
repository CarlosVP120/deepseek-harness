---
kind: upgrade-guide
description: "EQIDIS AI 将默认的 DeepSeek 账户引导和推理路由替换为直接进入工作区和 OpenRouter。"
---
# EQIDIS AI 使用 OpenRouter

[English](guide.md) | 中文

## 变更

EQIDIS AI 分支直接打开桌面工作区，不显示 DeepSeek 登录或介绍。新的默认模型选择通过 OpenRouter 使用 `deepseek/deepseek-v4.1-flash`，并提供 `deepseek/deepseek-v4-pro`。两个模型均明确配置了 OpenRouter 目录中的显示名称、上下文限制和支持的输入类型。官方 DeepSeek 和账户推理适配器已禁用，仅保留 OpenRouter 模型提供方。现有配置覆盖和会话模型选择仍然优先。

推理、上下文压缩、重试、推理强度选择和子代理执行使用 Harness 原生实现。EQIDIS 不强制推理级别。新安装将 Flash 和 Pro 的上下文窗口设为 1,048,576 个 token，每次请求的输出上限设为 64,000 个 token，包含推理，而非预留模型目录的输出容量。输入框隐藏 Flash 和 Pro 的推理强度控件，只简化界面，不限制后端推理。

## 迁移

1. 在模型设置中将 OpenRouter 密钥保存至 `OPENROUTER_API_KEY` 凭据引用，或提供同名环境变量。不要提交密钥，也不要在 DeepSeek 欢迎表单中输入该密钥。
2. 如果配置已覆盖 `agent-default-model`，请在该配置的 `cordis.patch.yml` 中将 `provider` 设为 `openrouter`，将 `model` 设为 `deepseek/deepseek-v4.1-flash`。
3. 如果配置已覆盖 `llm-pi-ai`，请将 `providers.openrouter.apiKeyEnv` 设为 `OPENROUTER_API_KEY`，并在 `providers.openrouter.models` 中包含两个模型标识符。
4. 重启桌面应用。确认无需登录即可进入工作区，并且两个 OpenRouter 模型均可选择。推理需要有效的 OpenRouter 密钥，打开工作区则不需要。

5. 从 `providers.openrouter` 中移除为 EQIDIS 添加的 `fixedReasoning`、`requestMaxTokens`、`timeoutMs` 和 `streamIdleTimeoutMs` 覆盖，并移除强制默认 `reasoningEffort`。如果现有配置覆盖了随应用交付的模型设置，请将两个模型的 `contextWindow` 设为 `1048576`，将 `maxTokens` 设为 `64000`。新建会话，确认请求头没有预留 943,718 个输出 token。按照 Harness 原生行为，现有显式调用限制仍然优先。
