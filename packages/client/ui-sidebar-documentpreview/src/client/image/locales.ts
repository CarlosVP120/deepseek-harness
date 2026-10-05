import { zoomEn, zoomZh } from '../zoom/locales.ts'

/** Locale-owned image renderer labels and status text. */
export const zh = {
  ...zoomZh,
  title: '图片',
  preview: '图片预览：{name}',
  loading: '文档渲染中...',
  failed: '无法显示这张图片',
  unsupported: '图片预览需要完整文件内容',
} satisfies Record<string, string>

/** Image renderer dictionary keys. */
export type ImagePreviewKey = keyof typeof zh

/** English dictionary with the same keys as the Chinese dictionary. */
export const en = {
  ...zoomEn,
  title: 'Image',
  preview: 'Image preview: {name}',
  loading: 'Rendering document...',
  failed: 'This image could not be displayed.',
  unsupported: 'Image preview requires the complete file contents.',
} satisfies Record<ImagePreviewKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Image preview selection, accessible name, and status text. */
    sidebarImage: ImagePreviewKey
  }
}

/** Spanish dictionary, checked against the English key set. */
export const es = {
  'zoomControls': 'Controles de zoom',
  'zoomMenu': 'Elige zoom',
  'zoomOut': 'alejar',
  'zoomIn': 'Acercar',
  'zoomFitWidth': 'Ancho de ajuste',
  'zoomValue': '{percent}%',
  'title': 'Imagen',
  'preview': 'Vista previa de imagen: {name}',
  'loading': 'Representando documento...',
  'failed': 'Esta imagen no se pudo mostrar.',
  'unsupported': 'La vista previa de la imagen requiere el contenido completo del archivo.',
} satisfies Record<keyof typeof en, string>
