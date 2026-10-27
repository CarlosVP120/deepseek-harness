/**
 * Smoke check of the `claude-code` route on this machine: find (or, with `--install`, install) Claude Code,
 * start one conversation with a test tool and send one message. Signed in, the model must call the tool and
 * answer with its result; signed out, the run must end with the AUTH failure the Settings page explains.
 * Usage: pnpm exec tsx packages/fiscalcfdi/tools/scripts/claude-code-smoke.ts [--install]
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeStatus, installClaude, locateClaude } from '../src/claude-code/cli.ts'
import { ClaudeConversation } from '../src/claude-code/conversation.ts'
import { ToolGateway } from '../src/claude-code/gateway.ts'

const say = (text: string) => { process.stdout.write(`claude-code-smoke: ${text}\n`) }
if (locateClaude() === undefined && process.argv.includes('--install')) say(`installed ${await installClaude()}`)
const status = await claudeStatus()
say(JSON.stringify({ ...status, email: status.email === null ? null : '(set)' }))
const executable = locateClaude()
if (executable === undefined) throw new Error('Claude Code is not installed')

const gateway = new ToolGateway()
const conversation = new ClaudeConversation({
  executable, cwd: join(tmpdir(), 'claude-code-smoke'), model: 'haiku', effort: undefined, gateway,
  system: 'Prueba técnica. Cuando te pidan el código secreto, llama la herramienta eco y responde solo con lo que devuelva.',
})
conversation.setTools([{ name: 'eco', description: 'Devuelve el código secreto', parameters: { type: 'object', properties: {} } }])
await conversation.start()
conversation.send('Dame el código secreto.')
let outcome = ''
for await (const chunk of conversation.stretch(undefined)) {
  if (chunk.type === 'block-end' && chunk.block.type === 'tool-call') conversation.answer(chunk.block.id, { text: 'PEPINO-42', isError: false })
  if (chunk.type === 'finish') outcome = JSON.stringify(chunk.reason)
}
say(`first stretch: ${outcome}`)
let text = ''
if (outcome.includes('tool-calls')) {
  for await (const chunk of conversation.stretch(undefined)) {
    if (chunk.type === 'text-delta') text += chunk.text
    if (chunk.type === 'finish') outcome = JSON.stringify(chunk.reason)
  }
  say(`second stretch: ${outcome} ${JSON.stringify(text)}`)
}
conversation.dispose()
await gateway.dispose()
const passed = status.loggedIn ? text.includes('PEPINO-42') : outcome.includes('"AUTH"')
say(passed ? 'PASS' : 'FAIL')
process.exit(passed ? 0 : 1)
