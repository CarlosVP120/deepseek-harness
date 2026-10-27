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
| `claudeCode` | `''` | Claude Code executable for the `claude-code` route; empty finds the official install |

## Native accounting runs

The engine's planning agent runs in this app: the chat agent that calls `fiscalcfdi_procesar` becomes the accounting agent and posts the month in the conversation, on the model and key selected in the Models settings. The engine's accounting is unchanged: its instructions, eleven planning tools, audits and importable export run in Python as before.

When a bridge call claims a month (`procesar`, or `responder` once every question is answered) it returns `lanzar`, and `AccountingRunner` (`src/runner.ts`) starts the engine's `worker.py` with `FISCALCFDI_AGENT_HOST=app`. The worker prepares the month (sources, SQL history, catalog) and sends the planning agent on fd 4: instructions, opening message, settings and the JSON schemas of its tools. For a call made by a chat agent, the runner registers those tools on that agent and the tool result carries `agente_contable` (instructions, task, tool names); each tool call goes to the worker on fd 3 and runs there exactly as with the engine's own client, traced into `agent-trace.json`. `ask_operator` records the question and its proposal; the result tells the model to ask it with `ask_user_question` and send the answer with `fiscalcfdi_responder`, which ends the attempt (the worker records `waiting`) and starts the next one on the same chat. An exported importable ends the attempt at once, so the month is `completed` for the rest of the turn; otherwise the attempt ends with the turn. The step budget (`ACCOUNTING_AGENT_MAX_TURNS`, 120 by default) bounds the planning tool calls of one attempt, and a waiting `fiscalcfdi_estado` never waits on a run its own chat hosts. Months claimed without a chat (Remote `process` or `answer`) run on a background Session titled «Contabilidad · empresa · periodo · intento N». Closing the app ends a run; the month records the stop and keeps its files and last saved plan for a retry.

Without `FISCALCFDI_AGENT_HOST`, the engine keeps running the agent with its own OpenRouter client (`motor-independiente-2026-10-26` tags that state in both repositories).

Months follow their chats. Each read of the Remote `months` first drops the bindings of Sessions no workspace lists any more (a deleted chat or project; archived chats still count) and asks the engine to archive every month left without a bound chat: `archivar_mes` moves the month's folder, attempts and importables to the engine's `data/archivo` and removes it from the active list, never touching a month being posted. `monthSession` returns the chat bound to a month most recently, so the start page opens that chat.

The Remote `sqlConnection`, `checkSql`, `refreshCompanies`, `findSqlServers`, `sqlReaderScript` and `createSqlReader` methods serve the CONTPAQi settings page. `findSqlServers` asks SQL Server Browser on this computer, the local network and the online Windows machines of the user's Tailscale network, then checks each TCP port. `createSqlReader` runs the engine's read-only login script (`fiscalcfdi_lectura`, `db_datareader` on every `ct*` database) with an administrator login that is used once and never saved, then tests and saves the new login; `sqlReaderScript` returns the same script with a new password for SQL Server Management Studio. Passwords reach the engine through private files and are never returned, except the new password of a script the user asked for.

`fiscalcfdi_estado` with `esperar: true` re-reads a running month in the Host, without model turns, and returns once it stops running, asks a question, or `waitMs` passes; the model makes one call per wait instead of polling.

Every bridge call runs with `FISCALCFDI_AGENT_HOST=app`, so the engine makes no model calls of its own: the app's model and key (the Models settings page) do all of the reasoning, and the engine needs no API key.

The `@deepseek-ai/dsh-fiscalcfdi-app` bundle mounts it with `FISCALCFDI_ENGINE_PYTHON` and `FISCALCFDI_ENGINE_BRIDGE`.

## Claude subscription

The service also registers the `claude-code` model route (`src/claude-code/`), so a chat can run on the user's own Claude plan instead of an API key, the way other desktop apps do: through the official Claude Code program installed on this computer, signed in with Anthropic's own flow (`claude auth login`). The app never handles the account's credentials. The Remote `claudeStatus`, `claudeInstall`, `claudeLogin`, `claudeLoginCode`, `claudeDisconnect` and `claudeUse` methods serve the Claude card on the Models settings page (`settings.models.cards`). As in other desktop apps that use Claude Code, the user decides when to connect: Connect always runs `claude auth login`, which opens Claude's authorization page even when Claude Code is already signed in, and only a completed sign-in connects this app (recorded in `fiscalcfdi/claude.json` in the data home). Disconnect forgets that connection and leaves Claude Code signed in for the user's other programs. Connecting makes a Claude model (`opus`, `sonnet`, `haiku`) the chats' default and disconnecting restores the previous one. The route offers its models to the chat's model picker, and accepts requests, only while Claude is connected in this app and Claude Code is signed in with a Claude subscription (checked at most every 30 seconds).

The harness keeps its agent loop. Each chat Session has one live `claude -p` process in stream-json mode with Claude Code's own tools disabled and the harness system prompt in place of its own; every model request is one stretch of Claude Code's turn, from the new input to its next tool calls or the end of the turn. The request's tools reach Claude Code as MCP tools through a loopback endpoint (`ToolGateway`) that announces tool changes with `list_changed`; a call stays open, as an event stream with keep-alive comments, until the next request carries the harness result, so approvals and questions to the user can take as long as they need. The process is told to drop its MCP time limits (`CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=0`). A live process continues from the request's last assistant message when it matches its own last reply, so harness compaction never restarts it; a changed model, effort or system prompt, a restart of the app, or 20 idle minutes start a new process from a text transcript. The route declares a 1,000,000-token window because Claude Code compacts its own context. Titles and summaries run a one-shot `claude -p` without tools. Variables that would make Claude Code bill an API key or another provider are removed from its environment. On Windows the official installer puts `claude.exe` in `%USERPROFILE%\.local\bin`; Git for Windows is not needed because Claude Code's own tools are off. `scripts/claude-code-smoke.ts [--install]` checks the route on a machine: signed in, the model must call a test tool; signed out, the run must end with the AUTH failure.
