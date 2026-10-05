// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { en as common } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { en } from '../src/client/locales.ts'
import { ProjectSettings } from '../src/client/ProjectSettings.tsx'

afterEach(cleanup)
function fixture() {
  return {
    workspaceId: WorkspaceId('project'), title: 'Project', path: '/project', t: makeTranslate(en, common), onClose: vi.fn(),
    readProjectContext: vi.fn().mockResolvedValue({ maxDocumentBytes: 30 * 1024 * 1024, instructions: 'Existing instructions', files: [{ name: 'policy.txt', bytes: 42 }] }),
    saveProjectInstructions: vi.fn().mockResolvedValue({ maxDocumentBytes: 30 * 1024 * 1024, instructions: 'Updated instructions', files: [] }),
    uploadProjectDocument: vi.fn(),
    removeProjectDocument: vi.fn().mockResolvedValue({ maxDocumentBytes: 30 * 1024 * 1024, instructions: 'Existing instructions', files: [] }),
    renameWorkspace: vi.fn().mockResolvedValue(undefined),
  }
}
it('loads saved instructions and persists edits from the dialog', async () => {
  const props = fixture()
  render(<ProjectSettings {...props} />)
  const instructions = await screen.findByDisplayValue('Existing instructions')
  fireEvent.change(instructions, { target: { value: 'Updated instructions' } })
  fireEvent.change(screen.getByDisplayValue('Project'), { target: { value: 'Renamed project' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>{  expect(props.onClose).toHaveBeenCalledOnce() })
  expect(props.renameWorkspace).toHaveBeenCalledWith(props.workspaceId, 'Renamed project')
  expect(props.saveProjectInstructions).toHaveBeenCalledWith(props.workspaceId, 'Updated instructions')
})
it('requires confirmation before removing an uploaded copy', async () => {
  const props = fixture()
  render(<ProjectSettings {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Remove policy.txt' }))
  expect(props.removeProjectDocument).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }))
  await waitFor(() =>{  expect(props.removeProjectDocument).toHaveBeenCalledWith(props.workspaceId, 'policy.txt') })
  await waitFor(() =>{  expect(screen.queryByText('policy.txt')).toBeNull() })
})
it('keeps instructions available when saving fails', async () => {
  const props = fixture()
  props.saveProjectInstructions.mockRejectedValue(new Error('Write failed'))
  render(<ProjectSettings {...props} />)
  await screen.findByDisplayValue('Existing instructions')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Write failed')
  expect(props.onClose).not.toHaveBeenCalled()
})
