---
description: "FiscalCFDI AI accounting views for the Web client: month and bank-coverage cards in the chat and the start-page accounting months panel."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-fiscalcfdi

Browser views for the FiscalCFDI AI product, mounted by `@deepseek-ai/dsh-fiscalcfdi-app`:

- **Month card** — `tool.call.toolview` for `fiscalcfdi_estado` and `fiscalcfdi_procesar`: state, the engine's six steps, live bank coverage and, once audited, journals and VAT.
- **Bank-coverage card** — `tool.call.toolview` for `fiscalcfdi_cobertura`: totals per statement and every movement with the journal and accounts that recorded it, with filters and search.
- **Turn cards** — the Turn's latest month and coverage results repeat in `conversation.chat.turnTail`, beneath the closing reply, so they stay visible when the Tool group is collapsed.
- **Accounting months panel** — `conversation.home.panels` on the start page, read from the Host's `fiscalcfdi` Remote namespace (`months`), which this plugin mounts itself. Choosing a month sends a request to open it in the blank Session.

Cards read the tools' presentation metadata and fall back to the JSON result text for calls recorded before it existed. No configuration.
