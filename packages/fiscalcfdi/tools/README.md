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

The `@deepseek-ai/dsh-fiscalcfdi-app` bundle mounts it with `FISCALCFDI_ENGINE_PYTHON` and `FISCALCFDI_ENGINE_BRIDGE`.
