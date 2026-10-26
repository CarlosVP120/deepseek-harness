---
description: "FiscalCFDI AI accounting tools over the FiscalCFDI AI engine bridge, for maintainers composing the FiscalCFDI AI product."
kind: "package-reference"
---

# @deepseek-ai/dsh-fiscalcfdi-tools

Registers the `fiscalcfdi_*` tools: list CONTPAQi companies, open a company month, upload its files, read its state and the agent's questions, answer them, start the autonomous accounting run and fetch the audited CONTPAQi importable. Each call runs `bridge.py` from the FiscalCFDI AI engine (`contpaqi-agent/harness/fiscalcfdi-plugin/bridge.py`) with one JSON object on stdin; accounting logic, SQL access and audits stay in the engine.

| Field | Default | Meaning |
|---|---|---|
| `python` | required | Python interpreter of the engine environment |
| `bridge` | required | Absolute path to the engine's `bridge.py` |
| `timeoutMs` | `120000` | Milliseconds one bridge call may run; the accounting run itself is detached |
| `waitMs` | `600000` | Longest a `fiscalcfdi_estado` call with `esperar: true` follows a running month before it returns |
| `waitPollMs` | `10000` | Milliseconds between engine reads while such a call waits |
| `apiKeyRef` | `OPENROUTER_API_KEY` | Credential the bridge receives as `OPENROUTER_API_KEY`, so the engine's agents run on the chat's OpenRouter key |

`fiscalcfdi_estado` with `esperar: true` re-reads a running month in the Host, without model turns, and returns once it stops running, asks a question, or `waitMs` passes; the model makes one call per wait instead of polling.

Every bridge call receives the resolved `apiKeyRef` credential (the Models settings page, then the environment) as `OPENROUTER_API_KEY`, which the engine prefers over its own `.env`; without a credential the engine keeps its `.env` key.

The `@deepseek-ai/dsh-fiscalcfdi-app` bundle mounts it with `FISCALCFDI_ENGINE_PYTHON` and `FISCALCFDI_ENGINE_BRIDGE`.
