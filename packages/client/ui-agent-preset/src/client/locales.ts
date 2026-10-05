/** Locale bundles for the agent-preset hero chip, header label, and management section. */

import { guideEn, guideZh, type PresetGuideKey  } from './guide-locales.ts'

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | PresetGuideKey
  | 'builtInGroup'
  | 'customGroup'
  | 'seatHint'
  | 'headerHint'
  | 'nav'
  | 'sectionIntro'
  | 'setDefault'
  | 'view'
  | 'presetStandardName'
  | 'presetStandardDescription'
  | 'presetPtcName'
  | 'presetPtcDescription'
  | 'presetMinimalName'
  | 'presetMinimalDescription'
  | 'presetCordisName'
  | 'presetCordisDescription'
  | 'inUse'
  | 'noDescription'
  | 'brokenBadge'
  | 'switchRefused'
  | 'standardUnavailable'
  | 'close'
  | 'creatorDraft'
  | 'createPlugin'
  | 'createPluginDescription'
  | 'createPluginChecking'
  | 'createPluginUnavailable'
  | 'createPluginMissing'

/** English copy. */
export const en: Record<AgentPresetSettingsKey, string> = {
  ...guideEn,
  builtInGroup: 'Built-in', customGroup: 'Custom',
  sectionIntro: 'Choose the agent’s tools and how it works. Use Standard mode for everyday tasks, or Creator mode to add capabilities to DSH.',

  seatHint: 'Choose the agent preset for your new task',
  headerHint: 'The agent preset chosen when this task started',
  nav: 'Agent presets',

  setDefault: 'Set as new task default',
  view: 'View configuration',

  presetStandardName: 'Standard mode',
  presetStandardDescription:
    'Work with code, files, and information. Suitable for most tasks, with search, editing, terminal commands, and other tools available as needed.',
  presetPtcName: 'PTC mode',
  presetPtcDescription:
    'Includes all Standard mode capabilities. Better suited to tasks that call tools in batches and then filter, organize, deduplicate, count, or summarize the results.',
  presetMinimalName: 'Minimal mode',
  presetMinimalDescription:
    'The agent works using only a terminal tool. Useful for testing and comparing its basic performance.',
  presetCordisName: 'Creator mode',
  presetCordisDescription:
    'Customize DSH through conversation. Let the agent write plugins that add features or UI, or combine tools and prompts to create your own mode.',

  inUse: 'New task default',

  noDescription: 'No description.',
  brokenBadge: 'Failed to load',

  switchRefused: 'Could not switch to {name}: {reason}',
  standardUnavailable: 'Standard mode is unavailable. Restore it or choose another available mode.',

  close: 'Close',

  creatorDraft: 'Let the agent help me create a preset',
  createPlugin: 'Let the agent create a plugin',
  createPluginDescription: 'Enter Creator mode and make your own DSH plugin',
  createPluginChecking: 'Checking whether Creator mode is available',
  createPluginUnavailable: 'Temporarily unavailable. Reopen this menu to retry',
  createPluginMissing: 'Creator mode is not included in this configuration',

}

/** Simplified Chinese copy. */
export const zh: Record<AgentPresetSettingsKey, string> = {
  ...guideZh,
  builtInGroup: '内置', customGroup: '自定义',
  sectionIntro: '选择 Agent 的工具和工作方式。日常任务用「标准模式」，扩展 DSH 的能力用「创造模式」。',

  seatHint: '选择新任务使用的 Agent 预设',
  headerHint: '本任务的 Agent 预设，在任务开始时确定',
  nav: 'Agent 预设',

  setDefault: '设为新任务默认',
  view: '查看配置',

  presetStandardName: '标准模式',
  presetStandardDescription: '处理代码、文件和资料，适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。',
  presetPtcName: 'PTC 模式',
  presetPtcDescription: '包含标准模式的所有能力，更适合批量调用工具，并对结果进行筛选、整理、去重、统计或汇总的任务。',
  presetMinimalName: '极简模式',
  presetMinimalDescription: 'Agent 仅使用终端工具完成任务，适合测试和对比其基础表现。',
  presetCordisName: '创造模式',
  presetCordisDescription: '用对话定制 DSH：让 Agent 编写插件，添加新功能或界面；也能组合工具和提示词，创建自己的模式。',

  inUse: '新任务默认',

  noDescription: '暂无描述。',
  brokenBadge: '加载失败',

  switchRefused: '无法切换到「{name}」：{reason}',
  standardUnavailable: '标准模式不可用，请恢复该模式或选择其他可用模式。',

  close: '关闭',

  creatorDraft: '让 Agent 帮我创建预设模式',
  createPlugin: '让 Agent 创建插件',
  createPluginDescription: '进入创造模式，制作属于你的 DSH 插件',
  createPluginChecking: '正在确认创造模式是否可用',
  createPluginUnavailable: '暂时不可用，请重新打开菜单重试',
  createPluginMissing: '当前配置未提供创造模式',

}

// The resolution itself is the shared fold in `dsh-agent-preset-registry/display`,
// re-exported here so every surface in this plugin reads one path; the
// Settings plugin list inlines the same fold over this plugin's dictionaries.
export { isBuiltInPreset, presetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
export type { PresetDisplaySource, PresetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'

/** Spanish dictionary, checked against the English key set. */
export const es = {
  'modeExplanation': 'Detalles del modo',
  'howToUse': 'como usar',
  'guideSections': 'Secciones de guía',
  'guideExampleTask': 'Tarea de ejemplo',
  'guideCopy': 'Copiar',
  'guideCopied': 'Copiado',
  'guideFootnotes': 'Notas a pie de página',
  'guideStandardIntro': 'Elige el modo Estándar al iniciar una nueva tarea. Describe lo que quieres lograr, señala los archivos relevantes y explica cómo verificar el resultado.',
  'guideStandardExplanation': '### Cómo funciona\n\nEl agente llama a herramientas directamente para leer y editar archivos, buscar y ejecutar comandos de terminal. Incluye habilidades, planificación, objetivos, subagentes, flujos de trabajo y compactación de contexto.\n\n### Cuándo elegirlo\n\nComience aquí para la codificación, el trabajo con archivos y la investigación diaria. El modo estándar también puede escribir scripts y procesar archivos en lotes. PTC cambia la forma en que se organizan las llamadas de herramientas; no es necesario para tareas por lotes.',
  'guideStandardUsage': '### Corregir un error\n\n> Descubra por qué enviar el formulario de búsqueda dos veces hace que los resultados desaparezcan. Arréglalo y ejecuta las pruebas pertinentes. Explique la causa y qué cambió.\n\nResultado esperado: un cambio de código, los resultados de las pruebas relevantes y una explicación de la causa.\n\n### Organizar notas del proyecto\n\n> Lea las notas de Markdown en este proyecto. Resuma las decisiones acordadas y las preguntas abiertas, con enlaces a los archivos fuente.\n\nResultado esperado: un resumen con referencias que puede comparar con las notas originales.',
  'guidePtcIntro': 'Elige el modo PTC al iniciar una nueva tarea. Especifique los archivos de entrada, las reglas de procesamiento y el formato de salida. El agente escribe el código.',
  'guidePtcExplanation': '### Cómo se llaman las herramientas\n\nPTC significa llamada a herramientas programáticas. En este ajuste preestablecido integrado, el agente usa run_code para escribir un programa TypeScript que llama a herramientas a través de un SDK generado. El programa puede utilizar bucles, condiciones, manejo de errores y llamadas simultáneas cuando corresponda.\n\n### Lo que llega al modelo\n\nLos resultados de la herramienta llegan primero al programa, que puede filtrarlos y combinarlos. El modelo recibe lo que el programa imprime o devuelve; Los resultados de la imagen se adjuntan por separado. Las llamadas a herramientas anidadas aún se registran y permanecen sujetas a los permisos de la herramienta.\n\n### Comparado con el modo Estándar\n\nAmbos modos pueden manejar tareas de codificación y por lotes. El modo estándar expone herramientas individuales directamente; PTC organiza las llamadas a herramientas en código. El ajuste preestablecido de PTC actual deja la herramienta de flujo de trabajo deshabilitada. La velocidad y el uso de tokens dependen de la tarea y de cómo el programa maneja sus resultados.',
  'guidePtcUsage': '### Verifique un conjunto de archivos de configuración\n\n> Verifique todos los archivos JSON en configs/. Enumere los campos obligatorios faltantes y los valores no válidos en el archivo Schema.json. Guarde un CSV con una fila por número. Incluya archivos ilegibles en el informe y siga revisando el resto. Deje los archivos originales sin cambios.\n\nResultado esperado: un resumen del problema y un informe CSV. El programa puede repetir las mismas comprobaciones, gestionar fallos individuales y recopilar los resultados.\n\n### Resumir registros de errores\n\n> Analizar los archivos de registro en logs/. Agrupe errores por servicio y tipo de error. Muestra los diez grupos más frecuentes y un ejemplo de cada uno. Guarde los recuentos completos en un CSV.\n\nResultado esperado: los principales grupos de errores y una tabla de recuento completa. Los datos intermedios se pueden agregar en el programa antes de que el resumen llegue al modelo.',
  'guideMinimalIntro': 'Elige el modo mínimo para una nueva tarea. Para realizar una comparación, mantenga constantes el modelo, los permisos, la entrada y el estado inicial del espacio de trabajo en todas las ejecuciones.',
  'guideMinimalExplanation': '### ¿Qué está incluido?\n\nUna herramienta de shell persistente y un indicador de sistema fijo. El ajuste preestablecido integrado no carga habilidades, planificación, compactación de contexto ni el contexto de tiempo de ejecución estándar.\n\n### Cuándo elegirlo\n\nÚselo como base para experimentos y comparaciones. Todavía puede leer archivos y ejecutar scripts mediante comandos de shell, pero ofrece menos formas integradas de gestionar una tarea larga. Menos herramientas no necesariamente lo hace más fácil para un principiante.',
  'guideMinimalUsage': '### Comparar el rendimiento en una pequeña corrección de errores\n\n> Ejecute las pruebas para este proyecto, encuentre la causa del error y realice la solución más pequeña. Ejecute las pruebas pertinentes nuevamente e informe el resultado.\n\nEjecute la misma tarea por separado en los modos Estándar y Mínimo desde el mismo estado inicial. Compare la finalización de tareas, las llamadas a herramientas y los cambios resultantes. El modo mínimo realiza el trabajo a través de comandos de terminal.',
  'guideCordisIntro': 'Elige el modo Creador para una nueva tarea. Describe la capacidad que deseas, dónde debería aparecer y cómo la verificarás.',
  'guideCordisExplanation': '### Lo que puedes crear\n\nEl modo Creador incluye las herramientas de tareas estándar más inspección del tiempo de ejecución, administración persistente de complementos y orientación para crear complementos de Cordis y ajustes preestablecidos de agentes. Puede crear un complemento que agregue una capacidad o interfaz de usuario, o un ajuste preestablecido que combine herramientas e indicaciones para un trabajo en particular.\n\n### Complementos y modos\n\nUn complemento agrega capacidades a DSH, como una herramienta, una conexión de servicio o una entrada de interfaz de usuario. Un modo es un ajuste preestablecido del agente que selecciona herramientas y define cómo trabaja el agente en una tarea. Se puede incluir un complemento en un ajuste preestablecido personalizado.\n\n### Cómo surte efecto el resultado\n\nPídale al agente que instale y verifique el resultado, no solo que genere el código fuente. Un complemento puede cargarse inmediatamente o requerir un reinicio, dependiendo de lo que cambie. Se selecciona un ajuste preestablecido recién creado al iniciar una nueva tarea.',
  'guideCordisUsage': '### Agregar una interfaz de usuario\n\n> Cree un complemento DSH que agregue una entrada de notas del proyecto a la barra lateral. Permítanme explorar los archivos de Markdown en este espacio de trabajo y obtener una vista previa de una nota seleccionada. Instálalo y verifica que se abre la página.\n\nResultado esperado: un complemento instalado con una entrada funcional y una página de vista previa, además de los pasos de activación restantes.\n\n### Agregar una herramienta\n\n> Cree un complemento con una herramienta que lea el informe de prueba de este proyecto y resuma las pruebas fallidas. Regístrelo y verifíquelo con un informe de muestra.\n\nResultado esperado: un complemento con una herramienta invocable y una llamada de muestra verificada.\n\n### Crear mi propio modo\n\n> Cree un modo de “Revisión de código” basado en el modo Estándar. Haga que priorice posibles errores y pruebe las lagunas, cite rutas y líneas de archivos y pregunte antes de modificar archivos. Guárdelo como un ajuste preestablecido seleccionable.\n\nResultado esperado: un ajuste preestablecido personalizado para nuevas tareas. Estas instrucciones de revisión guían al agente; La configuración de permisos determina qué acciones puede ejecutar.',
  'builtInGroup': 'Incorporado',
  'customGroup': 'personalizado',
  'sectionIntro': 'Elige las herramientas del agente y cómo funciona. Utilice el modo Estándar para las tareas diarias o el modo Creador para agregar capacidades a DSH.',
  'seatHint': 'Elige el agente preestablecido para tu nueva tarea',
  'headerHint': 'El agente preestablecido elegido cuando comenzó esta tarea',
  'nav': 'Agentes',
  'setDefault': 'Establecer como nueva tarea predeterminada',
  'view': 'Ver configuración',
  'presetStandardName': 'Modo estándar',
  'presetStandardDescription': 'Trabaje con código, archivos e información. Adecuado para la mayoría de las tareas, con búsqueda, edición, comandos de terminal y otras herramientas disponibles según sea necesario.',
  'presetPtcName': 'modo PTC',
  'presetPtcDescription': 'Incluye todas las capacidades del modo Estándar. Más adecuado para tareas que llaman a herramientas en lotes y luego filtran, organizan, deduplican, cuentan o resumen los resultados.',
  'presetMinimalName': 'modo mínimo',
  'presetMinimalDescription': 'El agente funciona utilizando únicamente una herramienta de terminal. Útil para probar y comparar su rendimiento básico.',
  'presetCordisName': 'Modo creador',
  'presetCordisDescription': 'Personaliza DSH a través de la conversación. Deje que el agente escriba complementos que agreguen funciones o interfaz de usuario, o combine herramientas e indicaciones para crear su propio modo.',
  'inUse': 'Nueva tarea predeterminada',
  'noDescription': 'Sin descripción.',
  'brokenBadge': 'No se pudo cargar',
  'switchRefused': 'No se pudo cambiar a {name}: {reason}',
  'standardUnavailable': 'El modo estándar no está disponible. Restáuralo o elige otro modo disponible.',
  'close': 'Cerrar',
  'creatorDraft': 'Deja que el agente me ayude a crear un preset',
  'createPlugin': 'Deje que el agente cree un complemento',
  'createPluginDescription': 'Ingrese al modo Creador y cree su propio complemento DSH',
  'createPluginChecking': 'Comprobando si el modo Creador está disponible',
  'createPluginUnavailable': 'Temporalmente no disponible. Vuelve a abrir este menú para volver a intentarlo.',
  'createPluginMissing': 'El modo creador no está incluido en esta configuración.',
} satisfies Record<keyof typeof en, string>
