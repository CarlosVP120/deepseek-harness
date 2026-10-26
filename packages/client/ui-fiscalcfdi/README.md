---
description: "FiscalCFDI AI accounting views for the Web client: month and bank-coverage cards in the chat and the start-page accounting months panel."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-fiscalcfdi

Browser views for the FiscalCFDI AI product, mounted by `@deepseek-ai/dsh-fiscalcfdi-app`:

- **Month card** — `tool.call.toolview` for `fiscalcfdi_estado` and `fiscalcfdi_procesar`: state, the engine's six steps, live bank coverage and, once audited, journals and VAT.
- **Bank-coverage card** — `tool.call.toolview` for `fiscalcfdi_cobertura`: totals per statement and every movement with the journal and accounts that recorded it, with filters and search.
- **Turn cards** — the Turn's latest month and coverage results repeat in `conversation.chat.turnTail`, beneath the closing reply, so they stay visible when the Tool group is collapsed.
- **Guided start** — a `conversation.composer` contribution that replaces the open composer in a blank Session: step 1 picks the company and month, then three drop zones take CFDI Excel listings, bank statements, and supporting files (PDT, prior pólizas, IMSS). The engine's file role decides the final zone; a file dropped in the wrong zone moves and the start shows a notice. The engine's confirmation question is answered inline, and Contabilizar sends the opening prompt so the run continues in the chat. A small question field still reaches the chat directly.
- **Plain start page** — occupies `conversation.home.backdrop` with an empty spacer, so no landscape banner draws above the headline.
- **Accounting months panel** — `conversation.home.panels` on the start page, read from the Host's `fiscalcfdi` Remote namespace (`months`), which this plugin mounts itself. Choosing a month sends a request to open it in the blank Session.

Cards read the tools' presentation metadata and fall back to the JSON result text for calls recorded before it existed. No configuration.
