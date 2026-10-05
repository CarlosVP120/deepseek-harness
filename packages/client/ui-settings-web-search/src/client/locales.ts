/** Locale bundles for the web-search provider's settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type WebSearchSettingsLocaleKey =
  | 'title' | 'description'
  | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset'
  | 'baseUrl' | 'baseUrlHint' | 'maxUses' | 'maxUsesHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidNumber'

/** English copy. */
export const en: Record<WebSearchSettingsLocaleKey, string> = {
  title: 'Web search',
  description: 'Set up the DeepSeek search provider.',
  apiKey: 'API key',
  apiKeyHint: 'Stored outside the settings file. Leave blank to keep the current key.',
  apiKeySet: 'A key is configured.',
  apiKeyUnset: 'No key is configured; only conversations using a DeepSeek Account model can search, through the default endpoint.',
  baseUrl: 'Endpoint',
  baseUrlHint: 'Leave blank to use the provider default.',
  maxUses: 'Max searches per request',
  maxUsesHint: 'How many times one request may search before it must answer.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
}

/** Simplified Chinese copy. */
export const zh: Record<WebSearchSettingsLocaleKey, string> = {
  title: '网页搜索',
  description: '设置 DeepSeek 的搜索提供方。',
  apiKey: 'API Key',
  apiKeyHint: '不写入设置文件。留空表示保持当前密钥。',
  apiKeySet: '已配置密钥。',
  apiKeyUnset: '未配置密钥；仅使用 DeepSeek 账号模型的对话可以通过默认接口地址搜索。',
  baseUrl: '接口地址',
  baseUrlHint: '留空则使用提供方默认地址。',
  maxUses: '单次请求最多搜索次数',
  maxUsesHint: '一次请求在必须作答前最多可以搜索多少次。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  unavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidNumber: '请填数字；留空表示使用默认值。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: WebSearchSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}

/** Spanish dictionary, checked against the English key set. */
export const es = {
  'title': 'búsqueda web',
  'description': 'Configure el proveedor de búsqueda DeepSeek.',
  'apiKey': 'clave API',
  'apiKeyHint': 'Almacenado fuera del archivo de configuración. Déjelo en blanco para conservar la clave actual.',
  'apiKeySet': 'Se configura una clave.',
  'apiKeyUnset': 'No hay ninguna clave configurada; solo se pueden buscar conversaciones que utilicen un modelo de cuenta DeepSeek, a través del punto final predeterminado.',
  'baseUrl': 'Punto final',
  'baseUrlHint': 'Déjelo en blanco para utilizar el proveedor predeterminado.',
  'maxUses': 'Búsquedas máximas por solicitud',
  'maxUsesHint': 'Cuántas veces puede buscarse una solicitud antes de responder.',
  'overridden': 'Anulado',
  'reset': 'Restablecer los valores predeterminados',
  'readOnly': 'Esta implementación almacena configuraciones de solo lectura.',
  'unavailable': 'Este complemento no está cargado, por lo que no se puede configurar en este momento.',
  'save': 'Guardar',
  'saving': 'Guardando…',
  'saveFailed': 'El despliegue no aceptó estos valores; quedaron para que usted los corrigiera.',
  'invalidNumber': 'Ingrese un número o déjelo en blanco para usar el valor predeterminado.',
} satisfies Record<keyof typeof en, string>
