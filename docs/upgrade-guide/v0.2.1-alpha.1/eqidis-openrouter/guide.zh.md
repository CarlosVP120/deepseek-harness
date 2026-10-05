---
kind: upgrade-guide
description: "EQIDIS AI 将默认的 DeepSeek 账户引导和推理路由替换为直接进入工作区和 OpenRouter。"
---
# EQIDIS AI 使用 OpenRouter

[English](guide.md) | 中文

## 变更

EQIDIS AI 分支直接打开桌面工作区，不显示 DeepSeek 登录或介绍。新的默认模型选择通过 OpenRouter 使用 `deepseek/deepseek-v4.1-flash`，并提供 `deepseek/deepseek-v4-pro`。两个模型均明确配置了 OpenRouter 目录中的显示名称、上下文限制、输出限制和支持的输入类型。官方 DeepSeek 和账户推理适配器已禁用，仅保留 OpenRouter 模型提供方。现有配置覆盖和会话模型选择仍然优先。

## 迁移

1. 在模型设置中将 OpenRouter 密钥保存至 `OPENROUTER_API_KEY` 凭据引用，或提供同名环境变量。不要提交密钥，也不要在 DeepSeek 欢迎表单中输入该密钥。
2. 如果配置已覆盖 `agent-default-model`，请在该配置的 `cordis.patch.yml` 中将 `provider` 设为 `openrouter`，将 `model` 设为 `deepseek/deepseek-v4.1-flash`。
3. 如果配置已覆盖 `llm-pi-ai`，请将 `providers.openrouter.apiKeyEnv` 设为 `OPENROUTER_API_KEY`，并在 `providers.openrouter.models` 中包含两个模型标识符。
4. 重启桌面应用。确认无需登录即可进入工作区，并且两个 OpenRouter 模型均可选择。推理需要有效的 OpenRouter 密钥，打开工作区则不需要。
