/**
 * The user's own Claude Code installation: where its executable is, the
 * environment it runs with, and its native sign-in. The app never handles the
 * Claude account's credentials: `claude auth login` completes the sign-in in
 * Anthropic's own flow and stores it where Claude Code keeps it.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { ClaudeCodeStatus } from '../types.ts'

const WINDOWS = process.platform === 'win32'
const EXECUTABLE = WINDOWS ? 'claude.exe' : 'claude'

/**
 * Find the Claude Code executable: the official installer's location first, then `PATH`.
 * @param explicit - a configured path, which wins when it exists.
 * @returns the executable, or undefined when Claude Code is not installed.
 */
export function locateClaude(explicit?: string): string | undefined {
  if (explicit !== undefined && explicit !== '') return existsSync(explicit) ? explicit : undefined
  const home = homedir()
  const known = [join(home, '.local', 'bin', EXECUTABLE), join(home, '.claude', 'local', EXECUTABLE)]
  if (!WINDOWS) known.push('/opt/homebrew/bin/claude', '/usr/local/bin/claude')
  const onPath = (process.env.PATH ?? '').split(delimiter).filter(dir => dir !== '').map(dir => join(dir, EXECUTABLE))
  return [...known, ...onPath].find(path => existsSync(path))
}

/**
 * The environment Claude Code runs with: this process's, without the variables that would make it bill an
 * API key or another provider instead of the signed-in subscription, and with no time limit on tool calls,
 * which can wait for the user.
 * @returns the child environment.
 */
export function claudeEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(ANTHROPIC_|CLAUDE_CODE_USE_|CLAUDE_CODE_OAUTH_TOKEN|AWS_BEARER_TOKEN_BEDROCK)/.test(key)) continue
    env[key] = value
  }
  return {
    ...env,
    // A tool call may wait for the user: no overall or idle limit, and it never moves to the background.
    MCP_TOOL_TIMEOUT: String(7 * 24 * 3600 * 1000), CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: '0', CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '0',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', DISABLE_TELEMETRY: '1',
  }
}

/** Run one short Claude Code command; resolves with its exit code and output. */
function run(
  executable: string, args: string[], timeoutMs = 30000, env: NodeJS.ProcessEnv = claudeEnvironment(),
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    const timer = setTimeout(() => { child.kill() }, timeoutMs)
    child.once('error', (error) => { clearTimeout(timer); resolve({ code: null, stdout, stderr: String(error) }) })
    child.once('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
}

/**
 * Whether Claude Code is installed and signed in, and with which plan.
 * @param explicit - a configured executable path.
 * @returns the installation and sign-in state; the email and plan only when signed in.
 */
export async function claudeStatus(explicit?: string): Promise<ClaudeCodeStatus> {
  const path = locateClaude(explicit)
  const none: ClaudeCodeStatus = {
    installed: false, path: null, version: null, loggedIn: false, connected: false, method: null, email: null, plan: null, active: null,
  }
  if (path === undefined) return none
  const [version, auth] = await Promise.all([run(path, ['--version']), run(path, ['auth', 'status', '--json'])])
  const status: ClaudeCodeStatus = { ...none, installed: true, path, version: version.stdout.trim().split(' ')[0] || null }
  try {
    const parsed = JSON.parse(auth.stdout) as Record<string, unknown>
    const text = (value: unknown) => typeof value === 'string' && value !== '' ? value : null
    return {
      ...status, loggedIn: parsed.loggedIn === true, method: text(parsed.authMethod),
      email: text(parsed.email), plan: text(parsed.subscriptionType),
    }
  } catch {
    // An older Claude Code without `auth status --json` reports nothing parseable; treat it as signed out.
    return status
  }
}

/**
 * One `claude auth login` attempt. Claude Code opens the browser itself; when the page shows a code instead
 * of returning to Claude Code, the user pastes it and {@link submit} hands it to the waiting command.
 */
export class ClaudeLogin {
  private readonly child: ChildProcess
  private output = ''
  /** Settles with the command's exit code once the sign-in finishes or fails. */
  readonly done: Promise<number | null>
  /** Settles with the sign-in page address once Claude Code prints it, or null if it never does. */
  readonly url: Promise<string | null>

  /** @param executable - the Claude Code executable. */
  constructor(executable: string) {
    this.child = spawn(executable, ['auth', 'login', '--claudeai'], { env: claudeEnvironment(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    const url = Promise.withResolvers<string | null>()
    this.url = url.promise
    const read = (chunk: Buffer) => {
      this.output += chunk.toString('utf8')
      const match = /https:\/\/\S+oauth\S+/.exec(this.output)
      if (match !== null) url.resolve(match[0])
    }
    this.child.stdout?.on('data', read)
    this.child.stderr?.on('data', read)
    this.done = new Promise((resolve) => {
      this.child.once('error', () => { url.resolve(null); resolve(null) })
      this.child.once('close', (code) => { url.resolve(null); resolve(code) })
    })
  }

  /** @param code - the code the sign-in page showed. */
  submit(code: string): void {
    this.child.stdin?.write(`${code.trim()}\n`)
  }

  /** Abandon the attempt. */
  cancel(): void {
    this.child.kill()
  }
}

/**
 * Install Claude Code with Anthropic's official installer for this platform.
 * @returns the installed executable.
 */
export async function installClaude(): Promise<string> {
  // Windows PowerShell rebuilds its module path when PSModulePath is unset; one inherited from PowerShell 7
  // hides its built-in commands, which the installer uses.
  const { PSModulePath: _modules, ...windowsEnv } = claudeEnvironment()
  const result = WINDOWS
    ? await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex'], 600000, windowsEnv)
    : await run('/bin/bash', ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'], 600000)
  const path = locateClaude()
  if (path === undefined) throw new Error(`No se pudo instalar Claude Code: ${(result.stderr || result.stdout).trim().slice(-400)}`)
  return path
}
