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

## Native accounting runs

The engine's planning agent runs in this app: the chat agent that calls `fiscalcfdi_procesar` becomes the accounting agent and posts the month in the conversation, on the model and key selected in the Models settings. The engine's accounting is unchanged: its instructions, eleven planning tools, audits and importable export run in Python as before.

When a bridge call claims a month (`procesar`, or `responder` once every question is answered) it returns `lanzar`, and `AccountingRunner` (`src/runner.ts`) starts the engine's `worker.py` with `FISCALCFDI_AGENT_HOST=app`. The worker prepares the month (sources, SQL history, catalog) and sends the planning agent on fd 4: instructions, opening message, settings and the JSON schemas of its tools. For a call made by a chat agent, the runner registers those tools on that agent and the tool result carries `agente_contable` (instructions, task, tool names); each tool call goes to the worker on fd 3 and runs there exactly as with the engine's own client, traced into `agent-trace.json`. `ask_operator` records the question and its proposal; the result tells the model to ask it with `ask_user_question` and send the answer with `fiscalcfdi_responder`, which ends the attempt (the worker records `waiting`) and starts the next one on the same chat. An exported importable ends the attempt at once, so the month is `completed` for the rest of the turn; otherwise the attempt ends with the turn. The step budget (`ACCOUNTING_AGENT_MAX_TURNS`, 120 by default) bounds the planning tool calls of one attempt, and a waiting `fiscalcfdi_estado` never waits on a run its own chat hosts. Months claimed without a chat (Remote `process` or `answer`) run on a background Session titled «Contabilidad · empresa · periodo · intento N». Closing the app ends a run; the month records the stop and keeps its files and last saved plan for a retry.

Without `FISCALCFDI_AGENT_HOST`, the engine keeps running the agent with its own OpenRouter client (`motor-independiente-2026-10-26` tags that state in both repositories).

Months follow their chats. Each read of the Remote `months` first drops the bindings of Sessions no workspace lists any more (a deleted chat or project; archived chats still count) and asks the engine to archive every month left without a bound chat: `archivar_mes` moves the month's folder, attempts and importables to the engine's `data/archivo` and removes it from the active list, never touching a month being posted. `monthSession` returns the chat bound to a month most recently, so the start page opens that chat.

The Remote `sqlConnection`, `checkSql` and `refreshCompanies` methods serve the CONTPAQi settings page; the password reaches the engine on `checkSql` only and is never returned.

`fiscalcfdi_estado` with `esperar: true` re-reads a running month in the Host, without model turns, and returns once it stops running, asks a question, or `waitMs` passes; the model makes one call per wait instead of polling.

Every bridge call runs with `FISCALCFDI_AGENT_HOST=app`, so the engine makes no model calls of its own: the app's model and key (the Models settings page) do all of the reasoning, and the engine needs no API key.

The `@deepseek-ai/dsh-fiscalcfdi-app` bundle mounts it with `FISCALCFDI_ENGINE_PYTHON` and `FISCALCFDI_ENGINE_BRIDGE`.
