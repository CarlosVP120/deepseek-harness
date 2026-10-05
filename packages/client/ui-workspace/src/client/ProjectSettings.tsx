/** UI for local project instructions and reference documents. */
import { useEffect, useRef, useState } from 'react'
import { Button, IconPlusOutlineRegular, IconTrashOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceId, ProjectContext } from '@deepseek-ai/dsh-api-workspace-controller/types'
import type { WorkspaceBrowserProps } from './contract/slots.ts'
import css from './ProjectSettings.module.css'

type ProjectActions = Pick<WorkspaceBrowserProps, 'readProjectContext' | 'saveProjectInstructions' | 'uploadProjectDocument' | 'removeProjectDocument' | 'renameWorkspace' | 't'>

/**
 * @param props - local project identity and Host operations.
 * @returns project settings dialog.
 */
export function ProjectSettings({
  workspaceId, title, path, onClose, t, readProjectContext, saveProjectInstructions,
  uploadProjectDocument, removeProjectDocument, renameWorkspace,
}: ProjectActions & {
  workspaceId: WorkspaceId
  title: string
  path: string
  onClose: () => void
}) {
  const [name, setName] = useState(title)
  const [instructions, setInstructions] = useState('')
  const [context, setContext] = useState<ProjectContext | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)
  const upload = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let current = true
    readProjectContext(workspaceId).then((value) => {
      if (current) { setContext(value); setInstructions(value.instructions); setBusy(false) }
    }).catch((reason: unknown) => {
      if (current) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) }
    })
    return () => { current = false }
  }, [workspaceId, readProjectContext])

  const run = async (operation: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(true); setError(null)
    try { await operation() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const save = () => run(async () => {
    if (name.trim() !== title) await renameWorkspace(workspaceId, name.trim())
    await saveProjectInstructions(workspaceId, instructions)
    onClose()
  })
  const addFiles = (files: FileList | null) => run(async () => {
    if (files === null) return
    for (const file of Array.from(files)) {
      if (context === null) return
      if (file.size > context.maxDocumentBytes) throw new Error(t('project.fileTooLarge', { limit: String(Math.round(context.maxDocumentBytes / 1024 / 1024)) }))
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result !== 'string') { reject(new Error(t('project.fileReadFailed'))); return }
          resolve(reader.result.split(',')[1] ?? '')
        }
        reader.onerror = () =>{  reject(new Error(t('project.fileReadFailed'))) }
        reader.readAsDataURL(file)
      })
      const updated = await uploadProjectDocument(workspaceId, file.name, base64)
      setContext(updated)
    }
    if (upload.current) upload.current.value = ''
  })
  return (
    <Modal open className={css.dialog ?? ''} contentClassName={css.content ?? ''} onClose={() => { if (!busy) onClose() }} closeLabel={t('close')} title={t('project.settings')}
      footer={<><Button variant="outline" disabled={busy} onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={busy || context === null || !name.trim()} onClick={() => { void save() }}>{t('project.save')}</Button></>}>
      <div className={css.form} aria-busy={busy}>
        <label className={css.field}>{t('field.workspaceName')}<input value={name} disabled={busy} data-modal-autofocus onChange={(event) =>{  setName(event.target.value) }} /></label>
        <p className={css.path}>{path}</p>
        <label className={css.field}>{t('project.instructions')}<textarea rows={7} value={instructions} disabled={busy || context === null} placeholder={t('project.instructionsPlaceholder')} onChange={(event) =>{  setInstructions(event.target.value) }} /></label>
        <p className={css.help}>{t('project.instructionsHelp')}</p>
        <section aria-label={t('project.documents')}>
          <div className={css.heading}><h3>{t('project.documents')}</h3><Button variant="outline" disabled={busy || context === null} onClick={() => upload.current?.click()}><IconPlusOutlineRegular size={16} />{t('project.addFiles')}</Button></div>
          <input ref={upload} className={css.fileInput} type="file" multiple aria-label={t('project.addFiles')} onChange={(event) => { void addFiles(event.target.files) }} />
          <p className={css.help}>{t('project.documentsHelp', { limit: String(Math.round((context?.maxDocumentBytes ?? 30 * 1024 * 1024) / 1024 / 1024)) })}</p>
          {context?.files.length === 0 && <p className={css.empty}>{t('project.empty')}</p>}
          <ul className={css.files}>{context?.files.map(file => <li key={file.name}><span className={css.filename}>{file.name}</span><span className={css.size}>{t('project.fileSize', { size: String(Math.ceil(file.bytes / 1024)) })}</span><Button variant="outline" disabled={busy} aria-label={t('project.removeFile', { name: file.name })} onClick={() =>{  setPendingRemoval(file.name) }}><IconTrashOutlineRegular size={16} /></Button></li>)}</ul>
          {pendingRemoval !== null && <div className={css.removal}><p>{t('project.confirmRemove', { name: pendingRemoval })}</p><Button variant="outline" disabled={busy} onClick={() =>{  setPendingRemoval(null) }}>{t('cancel')}</Button><Button variant="outline" disabled={busy} onClick={() => { void run(async () => { setContext(await removeProjectDocument(workspaceId, pendingRemoval)); setPendingRemoval(null) }) }}>{t('project.remove')}</Button></div>}
        </section>
        {busy && <p role="status" className={css.help}>{t('project.working')}</p>}
        {error !== null && <p role="alert" className={css.error}>{error}</p>}
      </div>
    </Modal>
  )
}
