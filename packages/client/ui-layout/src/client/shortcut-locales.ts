/** Layout command labels. */
export const zh = { toggle: '展开／收起左侧栏' }
/** English labels for the same layout commands. */
export const en: Record<keyof typeof zh, string> = { toggle: 'Toggle left sidebar' }

/** Spanish dictionary, checked against the English key set. */
export const es = {
  'toggle': 'Alternar barra lateral izquierda',
} satisfies Record<keyof typeof en, string>
