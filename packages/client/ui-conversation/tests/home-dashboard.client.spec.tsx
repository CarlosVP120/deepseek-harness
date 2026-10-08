// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { es as commonEs } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { HomeDashboard } from '../src/client/skeleton/HomeDashboard.tsx'
import { es } from '../src/client/locales.ts'

const t = makeTranslate(es, commonEs)
const project = 'project' as WorkspaceId
const sid = SessionId('visible')
const row: SessionSummary = {
  id: sid, displayTitle: 'Conciliación de agosto', running: false, blank: false,
  updatedAt: Date.UTC(2026, 9, 6), retainedBy: {},
}
const workspaces: WorkspaceSnapshot = {
  items: [{ workspaceId: project, path: '/local/project', title: 'Contabilidad', sessionIds: [sid], createdAt: '2026-10-06', updatedAt: '2026-10-06' }],
  archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
}
afterEach(cleanup)

describe('Scenic home catalog', () => {
  it('opens actual recent Sessions and projects through existing navigation', () => {
    const open = vi.fn()
    const select = vi.fn(async () => {})
    const view = render(<HomeDashboard sessions={[row]} workspaces={workspaces} t={t}
      selectWorkspace={select} openRecentSession={open} />)
    fireEvent.click(view.getByRole('button', { name: /Conciliación de agosto/ }))
    expect(open).toHaveBeenCalledWith(sid)
    fireEvent.click(view.getByRole('button', { name: /Contabilidad.*1 conversación/ }))
    expect(select).toHaveBeenCalledWith(project)
  })

  it('excludes archived, blank and subagent Sessions from recent and running work', () => {
    const archived = SessionId('archived')
    const view = render(<HomeDashboard sessions={[
      row,
      { ...row, id: archived, displayTitle: 'Archivada', running: true },
      { ...row, id: SessionId('blank'), displayTitle: 'Vacía', blank: true },
      { ...row, id: SessionId('child'), displayTitle: 'Subagente', origin: 'subagent', running: true },
    ]} workspaces={{ ...workspaces, archivedSessionIds: [archived] }} t={t}
    selectWorkspace={vi.fn(async () => {})} openRecentSession={vi.fn()} />)
    expect(view.queryByText('Archivada')).toBeNull()
    expect(view.queryByText('Vacía')).toBeNull()
    expect(view.queryByText('Subagente')).toBeNull()
    expect(view.getByText('No hay tareas en curso.')).toBeTruthy()
    expect(view.getByText('Conversaciones recientes')).toBeTruthy()
  })

  it('reports a project-open failure and lets the user retry', async () => {
    const select = vi.fn(async () => { throw new Error('unavailable') })
    const view = render(<HomeDashboard sessions={[row]} workspaces={workspaces} t={t}
      selectWorkspace={select} openRecentSession={vi.fn()} />)
    fireEvent.click(view.getByRole('button', { name: /Contabilidad.*1 conversación/ }))
    await waitFor(() => { expect(view.getByRole('alert').textContent).toContain('No se pudo abrir') })
    expect(view.getByRole('button', { name: /Contabilidad.*1 conversación/ }).hasAttribute('disabled')).toBe(false)
  })
})
