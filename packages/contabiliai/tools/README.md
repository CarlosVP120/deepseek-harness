---
description: "ContabiliAI accounting tools over the ContabiliAI engine bridge, for maintainers composing the ContabiliAI product."
kind: "package-reference"
---

# @deepseek-ai/dsh-contabiliai-tools

Registers the `contabiliai_*` tools: list CONTPAQi companies, open a company month, upload its files, read its state and the agent's questions, answer them, start the autonomous accounting run and fetch the audited CONTPAQi importable. Each call runs `bridge.py` from the ContabiliAI engine (`contpaqi-agent/harness/contabiliai-plugin/bridge.py`) with one JSON object on stdin; accounting logic, SQL access and audits stay in the engine.

| Field | Default | Meaning |
|---|---|---|
| `python` | required | Python interpreter of the engine environment |
| `bridge` | required | Absolute path to the engine's `bridge.py` |
| `timeoutMs` | `120000` | Milliseconds one bridge call may run; the accounting run itself is detached |

The `@deepseek-ai/dsh-contabiliai-app` bundle mounts it with `CONTABILIAI_ENGINE_PYTHON` and `CONTABILIAI_ENGINE_BRIDGE`.
