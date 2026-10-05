---
kind: upgrade-guide
description: "EQIDIS AI replaces the default DeepSeek account onboarding and inference route with direct workspace access and OpenRouter."
---
# EQIDIS AI uses OpenRouter

English | [中文](guide.zh.md)

## Change

The EQIDIS AI fork opens Desktop directly without the DeepSeek login or introduction. New default model selections use OpenRouter with `deepseek/deepseek-v4.1-flash`; `deepseek/deepseek-v4-pro` is also available. Both models include explicit display names, context limits, output limits, and supported input types from the OpenRouter catalog. The official DeepSeek and account inference adapters are disabled, leaving OpenRouter as the only model provider. Existing profile overrides and session model selections remain authoritative.

## Migration

1. Open the Models settings and store the OpenRouter key under the configured `OPENROUTER_API_KEY` credential reference, or supply that environment variable. Do not commit the key or place it in the DeepSeek welcome form.
2. If a profile already overrides `agent-default-model`, set its `provider` to `openrouter` and its `model` to `deepseek/deepseek-v4.1-flash` in that profile's `cordis.patch.yml`.
3. If a profile overrides `llm-pi-ai`, configure `providers.openrouter.apiKeyEnv` as `OPENROUTER_API_KEY` and include both model ids in `providers.openrouter.models`.
4. Restart Desktop. Confirm that the workspace opens without login and that both OpenRouter models are available. Inference requires a valid OpenRouter key; opening the workspace does not.
