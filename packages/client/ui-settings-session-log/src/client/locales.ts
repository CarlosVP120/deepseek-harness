/** Copy for the API Session-log upload preference. */
export const en = {
  title: 'Upload Session Log when using the official model API',
  description: 'Help improve DeepSeek models and products.',
  saved: 'Preference saved',
  failed: 'Could not save preference',
}

/** Chinese preference copy. */
export const zh: Record<keyof typeof en, string> = {
  title: '在使用官方模型 API 时上传 Session Log',
  description: '帮助改进 DeepSeek 模型与产品',
  saved: '设置已保存',
  failed: '无法保存设置',
}

/** Spanish dictionary, checked against the English key set. */
export const es = {
  'title': 'Cargue el registro de sesión cuando utilice la API del modelo oficial',
  'description': 'Ayude a mejorar los modelos y productos de DeepSeek.',
  'saved': 'Preferencia guardada',
  'failed': 'No se pudo guardar la preferencia',
} satisfies Record<keyof typeof en, string>
