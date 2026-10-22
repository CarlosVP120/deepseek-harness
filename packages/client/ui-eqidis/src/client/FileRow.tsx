import { IconPaperclipOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectFileEntry } from '@deepseek-ai/dsh-api-workspace-controller/types'
import type { NS } from './locales.ts'
import css from './eqidis.module.css'

/** What a file row can do with a project file of the conversation's project. */
export interface FileActions {
  /** Show a file in the app's document preview. */
  readonly preview: (sessionId: string, file: string) => void
  /** Open a file in its default application, or show it in Finder / Explorer. */
  readonly open: (sessionId: string, absolute: string, reveal: boolean) => Promise<void>
  /** Save a copy of a file wherever the user chooses. */
  readonly download: (sessionId: string, file: string) => Promise<void>
}

/** Human-readable file size. */
export function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

type Props = PropsLocale<typeof NS> & {
  readonly file: ProjectFileEntry
  /** The project folder, to open the file on the desktop. */
  readonly root: string
  readonly sessionId: string
  readonly actions: FileActions
  readonly disabled: boolean
  /** Run an action, reporting progress and failure where the row is shown. */
  readonly act: (label: string, run: () => Promise<void>) => void
}

/** One project file: its name previews it inside the app; Abrir, Finder and Descargar act on the desktop copy. */
export function FileRow({ file, root, sessionId, actions, disabled, act, t }: Props) {
  const absolute = `${root.replace(/[\\/]+$/u, '')}/${file.path}`
  return <li className={css.fileRow}>
    <IconPaperclipOutlineRegular size={14} className={css.fileIcon} />
    <button type="button" className={css.fileOpen} title={file.path} onClick={() => { actions.preview(sessionId, file.path) }}>
      <span className={css.fileName}>{file.name}</span>
      <span className={css.muted}>{fileSize(file.bytes)}</span>
    </button>
    <span className={css.fileActions}>
      <button type="button" className={css.fileAction} disabled={disabled}
        onClick={() => { act(file.path, () => actions.open(sessionId, absolute, false)) }}>{t('files.open')}</button>
      <button type="button" className={css.fileAction} disabled={disabled}
        onClick={() => { act(file.path, () => actions.open(sessionId, absolute, true)) }}>{t('files.reveal')}</button>
      <button type="button" className={css.fileAction} disabled={disabled}
        onClick={() => { act(file.path, () => actions.download(sessionId, file.path)) }}>{t('files.download')}</button>
    </span>
  </li>
}
