---
kind: upgrade-guide
description: "已安装的 EQIDIS Desktop 使用独立数据目录，不再导入 DeepSeek Harness 账户、设置或会话。"
---
# 独立的 EQIDIS Desktop 数据

[English](guide.md) | 中文

## 变更

已安装的 EQIDIS Desktop 使用 `~/.eqidis-ai`，而非共享的 Harness 主目录。继承的 `DSH_HOME` 不再选择安装版本的数据目录；`EQIDIS_AI_HOME` 是显式覆盖选项。开发版本保留其临时 `DSH_HOME`。不会导入原有账户、模型目录或会话，EQIDIS 套件禁用 DeepSeek 账户界面。

## 迁移

1. 安装更新后的 EQIDIS 包。原有 DeepSeek Harness 数据保持不变。
2. 在设置 → 模型中输入每个团队的 OpenRouter 密钥。安装包不包含密钥。
3. 确认新会话显示 Flash，提供 Flash 和 Pro，且没有推理力度选择器或 DeepSeek 账户菜单。推理遵循 Harness 原生选择，预设保持标准模式。
4. 要迁移安装版本的 EQIDIS 数据，在启动应用前将 `EQIDIS_AI_HOME` 设置为独立目录。不要选择其他产品的主目录。
