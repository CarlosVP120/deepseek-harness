/**
 * The writable-root derivation shared by every enforcement dialect that
 * expresses a mode as a canonical allow-list: `workspace-write` means "the
 * workspace root plus the platform temp areas", and this module is that
 * meaning's one home. The Seatbelt profile
 * (`@deepseek-ai/dsh-sandbox-local`) and the in-process filesystem fence
 * (`@deepseek-ai/dsh-fs-sandbox`) both derive their allow-list here, so "the
 * write tool cannot write /tmp but bash can" asymmetries cannot arise between
 * them. The bwrap and Landlock dialects keep their own grant spellings (an
 * ephemeral `/tmp` mount, launcher-owned flags) — the honest per-runner
 * differences recorded in the sandbox RFC — with parity pinned by test.
 *
 * @module dsh-sandbox/roots
 */

import { readdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import type { SandboxExecutionPolicy } from './index.ts'

/**
 * Resolve a granted root to the path the enforcement layer actually compares:
 * canonical (symlinks resolved), because both Seatbelt filters and the fs
 * fence's containment check match resolved paths — `/tmp` IS `/private/tmp`
 * on darwin, and an as-spelled grant would match nothing.
 * @param path - the root as configured or platform-reported.
 * @returns the canonical path, or the spelling as-is when resolution fails
 *   (a missing root matches nothing until it exists — the conservative
 *   outcome; inventing a fallback would grant a path the caller never named).
 */
export function canonicalPath(path: string): string {
  try {
    // Node's JavaScript realpath implementation lexically collapses `..`
    // before resolving a preceding symlink on some platforms. The native
    // implementation follows the filesystem's component-by-component lookup,
    // matching chdir/spawn and the enforcement layers this identity feeds.
    return realpathSync.native(path)
  } catch {
    // realpathSync.native failed: the path (or a prefix) is missing or unreadable.
    return path
  }
}

/**
 * The roots one confined execution may WRITE under — the mode's meaning as a
 * canonical, deduplicated allow-list. `read-only` allows nothing;
 * `workspace-write` allows the policy's workspace root, the host `/tmp`, and
 * the per-user platform temp dir (`os.tmpdir()` — the real temp area for
 * mkstemp-family tools; omitting it would deny what the mode promises).
 * @param policy - the file-effect policy to derive the allow-list from.
 * @returns the canonical writable roots; empty exactly under `read-only`.
 */
export function writableRoots(policy: SandboxExecutionPolicy): string[] {
  if (policy.mode !== 'workspace-write') return []
  return [...new Set([policy.workspaceRoot, '/tmp', tmpdir()].map(canonicalPath))]
}

function under(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep)
}

/**
 * Whether a confined execution is refused an access to a path because of the
 * policy's {@link SandboxExecutionPolicy.hiddenRoots}. The workspace root stays
 * fully reachable; a {@link SandboxExecutionPolicy.fileRoots} entry admits only
 * reading a file by name.
 * @param policy - the file-effect policy carrying the hidden and file roots.
 * @param path - canonical absolute path being accessed.
 * @param access - `read` opens a file; `list` reads a directory's entries or searches beneath it.
 * @returns true when the policy hides the path for that access.
 */
export function hiddenAccess(policy: SandboxExecutionPolicy, path: string, access: 'read' | 'list'): boolean {
  const hidden = policy.hiddenRoots ?? []
  if (hidden.length === 0 || under(path, canonicalPath(policy.workspaceRoot))) return false
  // A search rooted above a hidden root would descend into it.
  if (access === 'list' && hidden.some(root => under(root, path))) return true
  if (!hidden.some(root => under(path, root))) return false
  return !(access === 'read' && (policy.fileRoots ?? []).some(root => under(path, root)))
}

/**
 * The directories a confined execution may read beneath when the policy hides
 * roots: every directory reachable from the filesystem root that is neither a
 * hidden root nor an ancestor of one, found by listing only the ancestors of
 * hidden roots. The workspace and file roots are granted separately.
 * @param policy - the file-effect policy carrying the hidden roots.
 * @returns `['/']` without hidden roots, else the readable siblings of every hidden root's ancestors.
 */
export function visibleRoots(policy: SandboxExecutionPolicy): string[] {
  const hidden = (policy.hiddenRoots ?? []).map(canonicalPath)
  if (hidden.length === 0) return ['/']
  const out: string[] = []
  const walk = (directory: string): void => {
    let names: string[]
    try {
      names = readdirSync(directory)
    } catch {
      // An unreadable ancestor grants nothing beneath it, the conservative outcome.
      return
    }
    for (const name of names) {
      const child = join(directory, name)
      if (hidden.includes(child)) continue
      if (hidden.some(root => under(root, child))) walk(child)
      else out.push(child)
    }
  }
  walk('/')
  return out
}

/**
 * The mode an enforcing capability applies: a policy that hides roots never
 * runs unconfined, so `danger-full-access` (from a session override or an
 * approved escalation) applies as `workspace-write`.
 * @param policy - the resolved per-call policy.
 * @returns the mode to enforce.
 */
export function effectiveMode(policy: SandboxExecutionPolicy): SandboxExecutionPolicy['mode'] {
  return policy.mode === 'danger-full-access' && (policy.hiddenRoots ?? []).length > 0 ? 'workspace-write' : policy.mode
}
