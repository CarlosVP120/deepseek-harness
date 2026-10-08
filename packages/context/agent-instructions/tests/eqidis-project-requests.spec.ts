import { appendFile, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as AgentInstructions from '@deepseek-ai/dsh-agent-instructions'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { ProjectContextFiles } from '../../../api/workspace-controller/src/project-context.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'

const instructions = 'EQIDIS_FISCAL_INSTRUCTIONS: Actúa como contador fiscal especializado en México. Concilia CFDI, REP y bancos; calcula IVA flujo, ISR y fluctuación cambiaria. Genera doce hojas de trabajo y marca partidas pendientes. No asumir información faltante.'
const documentMarker = 'EQIDIS_DOCUMENT_CONTENT_NOT_AUTOMATICALLY_INJECTED'

for (const withProject of [false, true]) {
  it(`records five requests without instruction accumulation, project=${withProject}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'eqidis-project-requests-'))
    const home = await mkdtemp(join(tmpdir(), 'eqidis-project-home-'))
    const ctx = new Context()
    try {
      await mkdir(join(root, '.git'))
      await mountAgentLoopTestDependencies(ctx)
      await ctx.plugin(LocalFileSystem, { cwd: '/' })
      await ctx.plugin(AgentInstructions, { dshHome: home, maxBytes: 65536 })
      const loop = await mountAgentLoopTestHarness(ctx)
      const high = ReasoningEffortId('high')
      const adapter = new MockAdapter(Array.from({ length: 5 }, () => textResponse('ok')), {
        efforts: [{ id: high, name: 'High' }], defaultEffort: high,
      }, 943718)
      ctx.llm.registerAdapter(['mock'], adapter)
      const files = new ProjectContextFiles()
      const auditInstructions = process.env.EQIDIS_AUDIT_INSTRUCTIONS
        ? await readFile(process.env.EQIDIS_AUDIT_INSTRUCTIONS, 'utf8')
        : instructions
      if (withProject) {
        for (let i = 0; i < 5; i++) await files.save(root, auditInstructions)
        const excel = process.env.EQIDIS_AUDIT_XLSX
          ? await readFile(process.env.EQIDIS_AUDIT_XLSX)
          : Buffer.from(documentMarker.repeat(1000))
        await files.upload(root, 'audit.xlsx', excel.toString('base64'))
        await files.upload(root, 'reference.txt', Buffer.from(documentMarker.repeat(1000)).toString('base64'))
        for (let i = 0; i < 5; i++) await files.read(root)
      }
      expect(adapter.requests).toHaveLength(0)
      const agent = await loop.create(SessionId('project-cost-audit'), {
        provider: 'mock', model: 'mock', reasoningEffort: high,
      }, { cwd: root })
      expect(adapter.requests).toHaveLength(0)
      for (let i = 0; i < 5; i++) {
        agent.followup(createUserMessage({ content: [{ type: 'text', text: `Audit message ${i}` }], source: { kind: 'user' } }))
        await agent.whenIdle()
        expect(adapter.requests).toHaveLength(i + 1)
      }
      const sizes: number[] = []
      for (const request of adapter.requests) {
        expect(request.maxTokens).toBe(943718)
        expect(request.reasoningEffort).toBe('high')
        const text = request.messages.flatMap(message => message.content)
          .filter(block => block.type === 'text').map(block => block.text).join('\n')
        sizes.push(Buffer.byteLength(text))
        expect(text.split(auditInstructions).length - 1).toBe(withProject ? 1 : 0)
        expect(text).not.toContain(documentMarker)
        expect(text).not.toContain('UEsDB')
        expect(text.includes('.eqidis-context/"audit.xlsx"')).toBe(withProject)
      }
      const report = {
        project: withProject, requests: adapter.requests.length,
        requestTextBytes: sizes, instructionBytes: Buffer.byteLength(auditInstructions),
      }
      console.info(JSON.stringify(report))
      if (process.env.EQIDIS_AUDIT_REPORT) await appendFile(process.env.EQIDIS_AUDIT_REPORT, `${JSON.stringify(report)}\n`)
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })
}

it('retains project instructions once across tool continuations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'eqidis-project-tools-'))
  const home = await mkdtemp(join(tmpdir(), 'eqidis-project-home-'))
  const ctx = new Context()
  try {
    await mkdir(join(root, '.git'))
    const files = new ProjectContextFiles()
    await files.save(root, instructions)
    await files.upload(root, 'reference.txt', Buffer.from(documentMarker).toString('base64'))
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(LocalFileSystem, { cwd: '/' })
    await ctx.plugin(ToolFs)
    await ctx.plugin(AgentInstructions, { dshHome: home, maxBytes: 65536 })
    const loop = await mountAgentLoopTestHarness(ctx)
    const adapter = new MockAdapter([
      toolCallResponse('read-first', 'read', { file_path: '.eqidis-context/reference.txt' }),
      toolCallResponse('read-second', 'read', { file_path: '.eqidis-context/reference.txt' }),
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = await loop.create(SessionId('project-tool-audit'), { provider: 'mock', model: 'mock' }, { cwd: root })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Consult reference.txt' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    expect(adapter.requests).toHaveLength(3)
    for (const request of adapter.requests) {
      const text = JSON.stringify(request.messages)
      expect(text.split(instructions).length - 1).toBe(1)
    }
    expect(JSON.stringify(adapter.requests[0]?.messages)).not.toContain(documentMarker)
    expect(JSON.stringify(adapter.requests[1]?.messages)).toContain(documentMarker)
    expect(JSON.stringify(adapter.requests[2]?.messages).split(documentMarker).length - 1).toBe(2)
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})
