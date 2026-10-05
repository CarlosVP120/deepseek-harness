/** Locale bundles for the built-in plugins settings section. */

/** Locale keys the section renders. */
export type PluginsSettingsLocaleKey = 'nav' | 'title' | 'intro' | 'tabs' | 'empty'

/** English copy. */
export const en: Record<PluginsSettingsLocaleKey, string> = {
  nav: 'Built-in plugins',
  title: 'Built-in plugins',
  intro: 'Inspect the plugins this deployment ships.',
  tabs: 'Plugin views',
  empty: 'This deployment exposes no plugin views.',
}

/** Simplified Chinese copy. */
export const zh: Record<PluginsSettingsLocaleKey, string> = {
  nav: '内置插件',
  title: '内置插件',
  intro: '查看内置部署的插件列表',
  tabs: '插件视图',
  empty: '本部署没有开放任何插件视图。',
}

/** Spanish dictionary, checked against the English key set. */
export const es = {
  'nav': 'Complementos',
  'title': 'Complementos integrados',
  'intro': 'Inspeccione los complementos que incluye esta implementación.',
  'tabs': 'Vistas de complementos',
  'empty': 'Esta implementación no expone vistas de complementos.',
} satisfies Record<keyof typeof en, string>
