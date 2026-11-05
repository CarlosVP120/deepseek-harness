/**
 * Tests for the writable-root derivation: the mode's meaning as a canonical
 * allow-list. Pinned here so the fs fence and the Seatbelt profile — both
 * deriving from `writableRoots` — cannot drift.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalPath, effectiveMode, hiddenAccess, visibleRoots, writableRoots } from '@deepseek-ai/dsh-sandbox'

/** Every temp root created by this file, removed after each test. */
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('canonicalPath', () => {
  it('resolves symlinks (an existing path realpaths)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-roots-'))
    roots.push(dir)
    expect(canonicalPath(dir)).toBe(realpathSync.native(dir))
  })

  it('returns the spelling as-is when the path cannot be resolved (conservative — matches nothing until it exists)', () => {
    expect(canonicalPath('/does/not/exist/anywhere-xyz')).toBe('/does/not/exist/anywhere-xyz')
  })
})

describe('writableRoots', () => {
  it('read-only grants nothing', () => {
    expect(writableRoots({ mode: 'read-only', workspaceRoot: process.cwd() })).toEqual([])
  })

  it('workspace-write grants the workspace root plus the platform temp areas, canonical and deduplicated', () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-ws-'))
    roots.push(ws)
    const writable = writableRoots({ mode: 'workspace-write', workspaceRoot: ws })
    expect(writable).toContain(realpathSync.native(ws))
    expect(writable).toContain(canonicalPath('/tmp'))
    expect(writable).toContain(realpathSync.native(tmpdir()))
    // Deduplicated after canonicalization (/tmp and os.tmpdir() may coincide).
    expect(new Set(writable).size).toBe(writable.length)
  })
})

describe('hidden roots', () => {
  const policy = {
    mode: 'workspace-write' as const,
    workspaceRoot: '/srv/people/ana/p',
    hiddenRoots: ['/srv/people', '/srv/home'],
    fileRoots: ['/srv/home/files'],
  }

  it('hides other folders and the home, keeping the workspace and files opened by name', () => {
    expect(hiddenAccess(policy, '/srv/people/ana/p/a.xlsx', 'read')).toBe(false)
    expect(hiddenAccess(policy, '/srv/people/ana/p', 'list')).toBe(false)
    expect(hiddenAccess(policy, '/srv/people/juan/q/b.xlsx', 'read')).toBe(true)
    expect(hiddenAccess(policy, '/srv/people/ana/other', 'read')).toBe(true)
    expect(hiddenAccess(policy, '/srv/home/accounts.json', 'read')).toBe(true)
    expect(hiddenAccess(policy, '/srv/home/files/v1/x.pdf', 'read')).toBe(false)
    expect(hiddenAccess(policy, '/srv/home/files/v1', 'list')).toBe(true)
    // Searching above a hidden root would descend into it.
    expect(hiddenAccess(policy, '/srv', 'list')).toBe(true)
    expect(hiddenAccess(policy, '/etc/hosts', 'read')).toBe(false)
    expect(hiddenAccess({ mode: 'read-only', workspaceRoot: '/' }, '/srv/people/juan', 'read')).toBe(false)
  })

  it('grants every directory except the hidden roots and the ancestors that lead to them', () => {
    const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-hidden-')))
    roots.push(base)
    for (const dir of ['people/ana', 'people/juan', 'home', 'shared']) mkdirSync(join(base, dir), { recursive: true })
    const granted = visibleRoots({ mode: 'read-only', workspaceRoot: base, hiddenRoots: [join(base, 'people'), join(base, 'home')] })
    expect(granted).toContain(join(base, 'shared'))
    expect(granted.filter(path => path.startsWith(base + '/'))).toEqual([join(base, 'shared')])
    expect(granted).not.toContain('/')
    expect(visibleRoots({ mode: 'read-only', workspaceRoot: base })).toEqual(['/'])
  })

  it('never runs unconfined while roots are hidden', () => {
    expect(effectiveMode({ ...policy, mode: 'danger-full-access' })).toBe('workspace-write')
    expect(effectiveMode({ mode: 'danger-full-access', workspaceRoot: '/ws' })).toBe('danger-full-access')
    expect(effectiveMode({ ...policy, mode: 'read-only' })).toBe('read-only')
  })
})
