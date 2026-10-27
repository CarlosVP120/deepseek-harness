/**
 * A loopback MCP endpoint (Streamable HTTP, JSON responses) that offers one Claude Code process the tools of
 * one harness request. A `tools/call` stays open until the harness has run that tool and handed its result
 * back, so Claude Code waits for the app's own tool execution, approvals and questions to the user included.
 *
 * Only the subset Claude Code uses is served: `initialize`, `tools/list`, `tools/call`, `ping`, and a GET
 * event stream that carries `notifications/tools/list_changed` when the request's tools change. A tool call is
 * answered as an event stream with periodic comments, so a call that waits for the user is never timed out. Each channel
 * lives under an unguessable path on 127.0.0.1.
 */
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'

/** What a tool call returns to Claude Code. */
export interface GatewayToolResult {
  text: string
  isError: boolean
}

/** One Claude Code process's view of the gateway. */
export interface GatewayChannel {
  /** MCP server configuration naming this channel's endpoint. */
  readonly config: string
  /** Replace the offered tools; Claude Code is told to list them again when they changed. */
  setTools(tools: readonly ToolSchema[]): void
  /** Stop serving this channel. */
  close(): void
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: Record<string, unknown>
}

interface Channel {
  tools: readonly ToolSchema[]
  signature: string
  events: ServerResponse | undefined
  call: (name: string, args: Record<string, unknown>) => Promise<GatewayToolResult>
}

/** The MCP server name Claude Code sees; its tools are named `mcp__<SERVER>__<tool>`. */
export const SERVER = 'h'

/** The loopback MCP server shared by every Claude Code process of this app. */
export class ToolGateway {
  private server: Promise<{ server: Server; port: number }> | undefined
  private readonly channels = new Map<string, Channel>()

  /**
   * Open a channel for one Claude Code process.
   * @param call - runs a tool call and resolves with what Claude Code receives.
   * @returns the channel, with the MCP configuration (JSON) that reaches it.
   */
  async open(call: Channel['call']): Promise<GatewayChannel> {
    const { port } = await (this.server ??= this.listen())
    const token = randomBytes(16).toString('hex')
    const channel: Channel = { tools: [], signature: '', events: undefined, call }
    this.channels.set(token, channel)
    return {
      config: JSON.stringify({ mcpServers: { [SERVER]: { type: 'http', url: `http://127.0.0.1:${port}/mcp/${token}` } } }),
      setTools: (tools) => {
        const signature = JSON.stringify(tools.map(tool => [tool.name, tool.description, tool.parameters]))
        if (signature === channel.signature) return
        const listed = channel.signature !== ''
        channel.tools = tools
        channel.signature = signature
        if (listed) channel.events?.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })}\n\n`)
      },
      close: () => {
        channel.events?.end()
        this.channels.delete(token)
      },
    }
  }

  /** Stop the server and every channel. */
  async dispose(): Promise<void> {
    for (const channel of this.channels.values()) channel.events?.end()
    this.channels.clear()
    const running = this.server
    this.server = undefined
    if (running === undefined) return
    const { server } = await running
    server.closeAllConnections()
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  }

  private async listen(): Promise<{ server: Server; port: number }> {
    const server = createServer((request, response) => {
      this.handle(request, response).catch((error: unknown) => {
        if (!response.headersSent) response.writeHead(500)
        response.end(String(error))
      })
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('claude-code gateway: no TCP address')
    return { server, port: address.port }
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const token = /^\/mcp\/([0-9a-f]{32})$/.exec(request.url ?? '')?.[1]
    const channel = token === undefined ? undefined : this.channels.get(token)
    if (token === undefined || channel === undefined) {
      response.writeHead(404).end()
      return
    }
    const session = { 'mcp-session-id': token }
    if (request.method === 'GET') {
      response.writeHead(200, { ...session, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      response.write(': open\n\n')
      channel.events?.end()
      channel.events = response
      const beat = setInterval(() => { response.write(': beat\n\n') }, 25000)
      response.once('close', () => {
        clearInterval(beat)
        if (channel.events === response) channel.events = undefined
      })
      return
    }
    if (request.method === 'DELETE') {
      response.writeHead(200, session).end()
      return
    }
    if (request.method !== 'POST') {
      response.writeHead(405).end()
      return
    }
    let body = ''
    for await (const chunk of request) body += (chunk as Buffer).toString('utf8')
    const parsed = JSON.parse(body) as JsonRpcRequest | JsonRpcRequest[]
    const messages = Array.isArray(parsed) ? parsed : [parsed]
    // A tool call can wait for the user for a long time: answer it as an event stream whose comments keep
    // Claude Code's HTTP client from timing the request out.
    if (messages.some(message => message.method === 'tools/call')) {
      response.writeHead(200, { ...session, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      response.write(': working\n\n')
      const beat = setInterval(() => { response.write(': working\n\n') }, 20000)
      try {
        for (const answer of await Promise.all(messages.map(message => this.answer(channel, message)))) {
          if (answer !== undefined) response.write(`event: message\ndata: ${JSON.stringify(answer)}\n\n`)
        }
      } finally {
        clearInterval(beat)
        response.end()
      }
      return
    }
    const answers = (await Promise.all(messages.map(message => this.answer(channel, message)))).filter(answer => answer !== undefined)
    if (answers.length === 0) {
      response.writeHead(202, session).end()
      return
    }
    response.writeHead(200, { ...session, 'content-type': 'application/json' })
    response.end(JSON.stringify(Array.isArray(parsed) ? answers : answers[0]))
  }

  private async answer(channel: Channel, message: JsonRpcRequest): Promise<object | undefined> {
    if (message.id === undefined) return undefined
    const reply = (result: object) => ({ jsonrpc: '2.0', id: message.id, result })
    switch (message.method) {
      case 'initialize':
        return reply({
          protocolVersion: typeof message.params?.protocolVersion === 'string' ? message.params.protocolVersion : '2025-06-18',
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: 'fiscalcfdi-ai', version: '1' },
        })
      case 'ping':
        return reply({})
      case 'tools/list':
        return reply({
          tools: channel.tools.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.parameters })),
        })
      case 'tools/call': {
        const name = typeof message.params?.name === 'string' ? message.params.name : ''
        const args = (message.params?.arguments ?? {}) as Record<string, unknown>
        const result = await channel.call(name, args)
        return reply({ content: [{ type: 'text', text: result.text }], isError: result.isError })
      }
      default:
        return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } }
    }
  }
}
