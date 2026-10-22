/**
 * EQIDIS AI workpapers: the agent fills the company's official workpaper for a
 * client and period from whatever trial balance and ledger details the user
 * uploaded. Nothing here assumes a layout: the tools let the agent explore any
 * workbook, write only into a dated copy of the template, recalculate it with the
 * bundled LibreOffice and remember the client's confirmed criteria.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent'
import { calculate, type Calculation, copyTemplate, describe, disposeConverter, find, pasteGrid, readGrid, table, writeCells, writeFormulas, type CellWrite } from './workbook.ts'
import { compareGrids, dependents, ledger, readCompact, sheetBlocks } from './analysis.ts'
import {
  INPUT_DIR, inside, isOutput, OUTPUT_DIR, period, openPendings, periods, readable, readPendings,
  readCriteria, readMaps, recordPendings, resolvePending, saveCriteria, saveMap, shown, storeInput,
  templates, TEMPLATES_DIR,
} from './project.ts'
import type { WorkpaperFigure, WorkpaperResult } from './types.ts'

export type * from './types.ts'

export const name = 'eqidis-workpapers'
export const inject = ['tools']

const RUTA = 'Ruta del archivo relativa al proyecto, o la ruta completa de un archivo adjunto al chat.'

const text = {
  schema: { type: 'string' },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
} as const

function root(exec: ToolExecution): string {
  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined || cwd === '') throw new Error('Esta conversación no pertenece a un proyecto; ábrela dentro de un proyecto.')
  return cwd
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 1)
}

/** Interpret a value the model sends as text: numbers become numbers unless forced to text. */
function cellValue(raw: string | number | null | undefined, asText: boolean | undefined): number | string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return raw
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (asText === true) return raw
  const numeric = trimmed.replaceAll(',', '').replace(/^\$/u, '')
  return /^-?\d+(\.\d+)?$/u.test(numeric) ? Number(numeric) : raw
}

function traceFile(rootDir: string, copy: string): string {
  return join(rootDir, '.eqidis-workpapers', 'trazas', `${basename(copy, extname(copy))}.json`)
}

async function readTrace(path: string): Promise<Record<string, { valor: number | string | null; origen: string }>> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, { valor: number | string | null; origen: string }>
  } catch {
    return {}
  }
}

const resultOutput = {
  ...text,
  presentationMeta: (_args: unknown, value: string) => {
    try {
      return (JSON.parse(value) as { tarjeta: unknown }).tarjeta as never
    } catch {
      return null
    }
  },
} as const

/** The official template a period copy («<plantilla> - <periodo>.xlsx») was made from, if it is still in the project. */
async function templateOf(dir: string, copy: string): Promise<string | undefined> {
  const name = basename(copy, extname(copy))
  const match = (await templates(dir)).filter(file => name.startsWith(`${basename(file, extname(file))} - `))
    .sort((a, b) => b.length - a.length)[0]
  return match === undefined ? undefined : join(dir, TEMPLATES_DIR, match)
}

const baselines = new Map<string, { mtime: number; cells: Set<string> }>()

/** Error cells the official template already has (months not yet worked, unused rows): they are not the agent's doing. */
async function templateErrors(template: string): Promise<Set<string>> {
  const mtime = (await stat(template)).mtimeMs
  const cached = baselines.get(template)
  if (cached?.mtime === mtime) return cached.cells
  const cells = new Set((await calculate(template, [])).errors.map(cell => cell.cell))
  baselines.set(template, { mtime, cells })
  return cells
}

/** Split recalculation errors into those this period introduced and those inherited from the template. */
async function classify(dir: string, copy: string, calc: Calculation): Promise<{ nuevos: string[]; heredados: number }> {
  const template = await templateOf(dir, copy)
  const inherited = template === undefined ? new Set<string>() : await templateErrors(template)
  const fresh = calc.errors.filter(cell => !inherited.has(cell.cell)).map(cell => `${cell.cell} ${String(cell.value)}`)
  return { nuevos: fresh, heredados: calc.errors.length - fresh.length }
}

/** The filled copy of the same template for the latest period before `label`, if any. */
async function previousCopy(dir: string, base: string, label: string): Promise<string | undefined> {
  const folders = await periods(dir)
  for (const folder of folders) {
    if (folder >= label) continue
    const candidate = join(dir, OUTPUT_DIR, folder, `${base} - ${folder}.xlsx`)
    if (await stat(candidate).then(info => info.isFile(), () => false)) return candidate
  }
  return undefined
}

export function apply(ctx: Context): void {
  // The LibreOffice engine is shared by every tool call and stopped with the plugin.
  ctx.effect(() => () => { void disposeConverter() }, 'eqidis-workpapers: spreadsheet engine')

  ctx.tools.register(defineTool({
    name: 'workpaper_overview',
    description: 'Punto de partida de cada cálculo. Devuelve los papeles de trabajo oficiales del proyecto (plantillas de la empresa), el mapa guardado de cada plantilla (cómo se alimenta y dónde están sus resultados), los criterios ya confirmados para este cliente y los periodos ya trabajados. Úsala antes de explorar archivos: si una plantilla tiene un mapa vigente, síguelo en lugar de volver a explorarla.',
    parameters: {},
    output: text,
    execute: async (_args, exec) => {
      const dir = root(exec)
      const criteria = await readCriteria(dir)
      return json({
        plantillas: (await templates(dir)).map(file => `${TEMPLATES_DIR.split('\\').join('/')}/${file}`),
        criterios_del_cliente: criteria === '' ? 'Aún no hay criterios guardados para este cliente.' : criteria,
        periodos_trabajados: await periods(dir),
        pendientes_abiertos: await openPendings(dir),
        mapas_de_plantillas: (await readMaps(dir)).map(map => ({
          plantilla: map.plantilla, vigente: map.vigente,
          contenido: map.vigente ? map.contenido : `La plantilla cambió desde que se hizo este mapa; úsalo solo como guía y vuelve a verificar. ${map.contenido}`,
        })),
        carpeta_de_resultados: OUTPUT_DIR,
        carpeta_de_insumos: INPUT_DIR,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'excel_describe',
    description: 'Describe cualquier libro de Excel (xlsx, xls, ods o csv) del proyecto: hojas, rango usado, cuántas celdas tienen valor o fórmula, cuántas celdas vacías tienen relleno de color (suelen ser celdas de captura) las primeras etiquetas de cada hoja y los bloques de columnas que se repiten (por ejemplo una balanza por mes, con el título de cada bloque). Úsala para entender la estructura de una plantilla, una balanza o un auxiliar antes de leerlos.',
    parameters: { ruta: { type: 'string', required: true, description: RUTA } },
    output: text,
    execute: async (args, exec) => {
      const path = await readable(root(exec), args.ruta)
      return json({ ...await describe(path), bloques_repetidos: await sheetBlocks(path) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'excel_read',
    description: 'Lee un rango de una hoja: cada celda con su valor, su fórmula (si tiene) y su relleno de color; las celdas vacías con relleno se incluyen porque suelen ser de captura. Una fórmula que se repite hacia abajo en una columna llega como una sola entrada con el rango, la fórmula de la primera celda y los valores. Lee rangos acotados (por ejemplo A1:H60); para hojas de datos grandes usa excel_table, excel_compare o excel_dependents en lugar de leerlas completas.',
    parameters: {
      ruta: { type: 'string', required: true, description: RUTA },
      hoja: { type: 'string', required: true, description: 'Nombre exacto de la hoja.' },
      rango: { type: 'string', description: 'Rango A1, por ejemplo A1:H60. Si se omite, todo el rango usado.' },
    },
    output: text,
    execute: async (args, exec) => json(await readCompact(await readable(root(exec), args.ruta), args.hoja, args.rango)),
  }))

  ctx.tools.register(defineTool({
    name: 'excel_find',
    description: 'Busca en todas las hojas las celdas cuyo texto contiene todas las palabras indicadas (sin importar acentos ni mayúsculas) y muestra las celdas a su derecha, donde suele estar la cifra o la celda de captura. Útil para ubicar conceptos como «coeficiente de utilidad» o «IVA acreditable» en una plantilla desconocida.',
    parameters: {
      ruta: { type: 'string', required: true, description: RUTA },
      texto: { type: 'string', required: true, description: 'Palabras a buscar.' },
    },
    output: text,
    execute: async (args, exec) => json(await find(await readable(root(exec), args.ruta), args.texto)),
  }))

  ctx.tools.register(defineTool({
    name: 'excel_table',
    description: 'Lee una hoja con forma de tabla (balanza de comprobación, auxiliares, listados): detecta la fila de encabezados, filtra filas que contengan un texto en cualquier columna (por ejemplo un número de cuenta o un prefijo como «401-») y devuelve los totales exactos de cada columna numérica de las filas filtradas. Las filas de totales del propio archivo («Sumas iguales», «Total») no se suman: se devuelven aparte en summaryRows para cotejar. Usa los totales que devuelve en lugar de sumar tú.',
    parameters: {
      ruta: { type: 'string', required: true, description: RUTA },
      hoja: { type: 'string', description: 'Nombre de la hoja; por omisión la primera.' },
      filtro: { type: 'string', description: 'Texto que debe aparecer en alguna columna de la fila.' },
      fila_encabezado: { type: 'number', description: 'Número de fila de los encabezados, si la detección automática falla.' },
      desde: { type: 'number', description: 'Filas a omitir del resultado (para paginar).' },
      limite: { type: 'number', description: 'Máximo de filas a devolver (por omisión 200).' },
    },
    output: text,
    execute: async (args, exec) => json(await table(await readable(root(exec), args.ruta), args.hoja, {
      contains: args.filtro, headerRow: args.fila_encabezado, offset: args.desde, limit: args.limite,
    })),
  }))

  ctx.tools.register(defineTool({
    name: 'excel_compare',
    description: 'Compara dos bloques de filas (por ejemplo la balanza nueva contra el bloque del mismo mes que ya trae el papel, o el mes actual contra el anterior) y devuelve solo las diferencias: filas iguales, filas con diferencias (columna, valor A y valor B), y claves que solo están en uno. Empareja las filas por una columna clave, como el número de cuenta. Úsala en lugar de leer los dos bloques completos.',
    parameters: {
      ruta_a: { type: 'string', required: true, description: RUTA },
      hoja_a: { type: 'string', description: 'Hoja del bloque A; por omisión la primera.' },
      rango_a: { type: 'string', description: 'Rango del bloque A, por ejemplo BU1:CB279; por omisión toda la hoja.' },
      ruta_b: { type: 'string', required: true, description: RUTA },
      hoja_b: { type: 'string', description: 'Hoja del bloque B; por omisión la primera.' },
      rango_b: { type: 'string', description: 'Rango del bloque B; por omisión toda la hoja.' },
      columna_clave: { type: 'number', description: 'Número de columna dentro de cada rango (1 = la primera) que identifica la fila, por ejemplo la del número de cuenta. Si se omite, se compara por posición.' },
    },
    output: text,
    execute: async (args, exec) => {
      const dir = root(exec)
      const a = await readGrid(await readable(dir, args.ruta_a), args.hoja_a, args.rango_a)
      const b = await readGrid(await readable(dir, args.ruta_b), args.hoja_b, args.rango_b)
      return json({ a: `${a.sheet}!${a.range}`, b: `${b.sheet}!${b.range}`, ...compareGrids(a, b, args.columna_clave) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'excel_ledger',
    description: 'Lee un reporte agrupado por cuenta (auxiliares o movimientos del catálogo como los imprime el sistema contable: una fila con la cuenta y debajo sus movimientos) y devuelve solo las secciones de las cuentas que empiezan con el número indicado, con sus movimientos y la suma exacta de cada columna numérica. Úsala para obtener el detalle de una cuenta en lugar de leer el reporte completo.',
    parameters: {
      ruta: { type: 'string', required: true, description: RUTA },
      cuenta: { type: 'string', required: true, description: 'Número de cuenta o su inicio, por ejemplo 2170-001 o 1195.' },
      hoja: { type: 'string', description: 'Hoja; por omisión la primera.' },
    },
    output: text,
    execute: async (args, exec) => json(await ledger(await readable(root(exec), args.ruta), args.hoja, args.cuenta)),
  }))

  ctx.tools.register(defineTool({
    name: 'excel_dependents',
    description: 'Encuentra las fórmulas de todo el libro que leen un área, agrupadas por hoja (las fórmulas repetidas hacia abajo llegan como un solo patrón). Úsala para saber qué alimenta un bloque, por ejemplo qué hojas y celdas leen la balanza de septiembre en TB!BU:CB, sin leer cada hoja.',
    parameters: {
      ruta: { type: 'string', required: true, description: RUTA },
      referencia: { type: 'string', required: true, description: 'Área como Hoja!A1, Hoja!A1:H40 o columnas completas Hoja!BU:CB.' },
    },
    output: text,
    execute: async (args, exec) => json(await dependents(await readable(root(exec), args.ruta), args.referencia)),
  }))

  ctx.tools.register(defineTool({
    name: 'workpaper_map_save',
    description: 'Guarda (reemplaza) el mapa de una plantilla para no volver a explorarla el siguiente periodo: cómo se alimenta (celdas de captura u hoja de datos donde se pega el insumo, y en qué columnas va cada mes), si es acumulativa, qué fórmulas avanzan mes a mes, de qué cuentas o auxiliares sale cada captura, qué celdas dan los resultados para la tarjeta y cualquier particularidad. Escríbelo en Markdown breve y concreto al terminar el cálculo, o actualízalo si encontraste algo nuevo. Los criterios del cliente van en client_criteria_save.',
    parameters: {
      plantilla: { type: 'string', required: true, description: 'Nombre del archivo de la plantilla, tal como lo lista workpaper_overview.' },
      contenido: { type: 'string', required: true, description: 'Mapa completo en Markdown.' },
    },
    output: text,
    execute: async (args, exec) => {
      await saveMap(root(exec), args.plantilla.split('/').pop() ?? args.plantilla, args.contenido)
      return 'Mapa de la plantilla guardado.'
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workpaper_store_inputs',
    description: 'Archiva en el proyecto, en «Insumos/<periodo>/», la balanza, los auxiliares y cualquier otro insumo que el usuario adjuntó al chat, para que el cálculo quede respaldado con los archivos que usó. Úsala en cuanto identifiques qué es cada adjunto y trabaja después sobre las rutas archivadas. Nunca reemplaza un archivo existente.',
    parameters: {
      periodo: { type: 'string', required: true, description: 'Periodo AAAA-MM, por ejemplo 2026-09.' },
      archivos: {
        type: 'array',
        required: true,
        description: 'Insumos a archivar.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ruta: { type: 'string', required: true, description: 'Ruta completa del adjunto o ruta dentro del proyecto.' },
            nombre: { type: 'string', description: 'Nombre descriptivo sin extensión, por ejemplo «Balanza 2026-09». Por omisión, el nombre original.' },
          },
        },
      },
    },
    output: text,
    execute: async (args, exec) => {
      const dir = root(exec)
      const label = period(args.periodo)
      const stored: string[] = []
      for (const file of args.archivos) stored.push(await shown(dir, await storeInput(dir, file.ruta, label, file.nombre)))
      return json({ archivados: stored })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workpaper_start',
    description: 'Crea la copia de trabajo de un papel oficial para un periodo, en «Papeles de trabajo/<periodo>/». La plantilla original nunca se modifica. Si la copia ya existe, devuelve su ruta para continuar sobre ella. Para un papel acumulativo (un libro anual con una columna o bloque por mes, donde cada mes se agrega a lo anterior) usa partir_de «periodo_anterior»: la copia parte del papel ya lleno del último periodo trabajado, y si no hay ninguno, de la plantilla.',
    parameters: {
      plantilla: { type: 'string', required: true, description: 'Ruta de la plantilla, tal como la lista workpaper_overview.' },
      periodo: { type: 'string', required: true, description: 'Periodo AAAA-MM, por ejemplo 2026-09.' },
      partir_de: { type: 'string', enum: ['plantilla', 'periodo_anterior'], description: 'De dónde parte la copia; por omisión, la plantilla.' },
    },
    output: text,
    execute: async (args, exec) => {
      const dir = root(exec)
      const template = await inside(dir, args.plantilla)
      const label = period(args.periodo)
      const copy = await inside(dir, join(OUTPUT_DIR, label, `${basename(template, extname(template))} - ${label}.xlsx`))
      const previous = args.partir_de === 'periodo_anterior' ? await previousCopy(dir, basename(template, extname(template)), label) : undefined
      let reused = false
      try {
        await copyTemplate(previous ?? template, copy)
      } catch (error) {
        if (!(error as Error).message.startsWith('Ya existe')) throw error
        reused = true
      }
      return json({
        copia: await shown(dir, copy), reutilizada: reused,
        basada_en: reused ? 'copia existente' : await shown(dir, previous ?? template), estructura: await describe(copy),
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workpaper_write',
    description: 'Escribe cifras o textos en las celdas de captura de la copia de trabajo (nunca en la plantilla ni en los insumos). Se rechaza escribir sobre una celda con fórmula: el papel calcula solo. Cada valor debe llevar su origen (archivo, hoja, cuenta o celda de donde salió) para que el contador pueda auditarlo. Puedes enviar varias celdas en una llamada.',
    parameters: {
      ruta: { type: 'string', required: true, description: 'Ruta de la copia devuelta por workpaper_start.' },
      celdas: {
        type: 'array',
        required: true,
        description: 'Celdas a escribir.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            hoja: { type: 'string', required: true, description: 'Hoja de la copia.' },
            celda: { type: 'string', required: true, description: 'Celda A1.' },
            valor: { type: 'string', required: true, description: 'Valor; los números sin separadores de miles ni signo de pesos. Vacío para borrar.' },
            texto: { type: 'boolean', description: 'true para guardar el valor como texto aunque parezca número (RFC, claves).' },
            origen: { type: 'string', required: true, description: 'De dónde sale el valor: archivo, hoja y cuenta o celda, o «confirmado por el contador».' },
          },
        },
      },
    },
    output: text,
    execute: async (args, exec) => {
      const dir = root(exec)
      const copy = await inside(dir, args.ruta)
      if (!await isOutput(dir, copy)) throw new Error(`Solo se escribe en copias dentro de «${OUTPUT_DIR}/» creadas con workpaper_start.`)
      const writes: CellWrite[] = args.celdas.map(item => ({
        sheet: item.hoja, cell: item.celda, value: cellValue(item.valor, item.texto),
      }))
      await writeCells(copy, writes)
      const trace = traceFile(dir, copy)
      const record = await readTrace(trace)
      args.celdas.forEach((item, i) => { record[`${item.hoja}!${item.celda.toUpperCase()}`] = { valor: writes[i]?.value ?? null, origen: item.origen } })
      await mkdir(join(trace, '..'), { recursive: true })
      await writeFile(trace, JSON.stringify(record, null, 1), { mode: 0o600 })
      return json({ escritas: writes.length, total_capturadas: Object.keys(record).length })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workpaper_paste',
    description: 'Pega un bloque completo de un insumo (por ejemplo la balanza de comprobación tal como la exporta el sistema contable) en una hoja de datos de la copia de trabajo, a partir de una celda; se usa cuando el papel de trabajo tiene una hoja donde se pega la balanza o el auxiliar de cada mes y sus fórmulas la leen por número de cuenta. Copia solo valores, conserva el formato de las celdas, limpia el resto del bloque hasta la última fila indicada para que no queden datos del periodo anterior, y se niega a tocar celdas con fórmula. Revisa antes, con excel_read, en qué columnas está el bloque del mes que corresponde.',
    parameters: {
      ruta: { type: 'string', required: true, description: 'Ruta de la copia devuelta por workpaper_start.' },
      hoja: { type: 'string', required: true, description: 'Hoja de la copia donde se pega.' },
      celda: { type: 'string', required: true, description: 'Celda superior izquierda del bloque destino, por ejemplo BU1.' },
      origen: { type: 'string', required: true, description: RUTA },
      hoja_origen: { type: 'string', description: 'Hoja del insumo; por omisión la primera.' },
      rango_origen: { type: 'string', description: 'Rango del insumo, por ejemplo A1:H278; por omisión todo el rango usado.' },
      limpiar_hasta_fila: { type: 'number', description: 'Última fila del bloque destino a limpiar si el insumo es más corto (por ejemplo, la última fila del bloque del mes anterior).' },
      nota: { type: 'string', required: true, description: 'Qué se pega y de dónde, para la traza del contador.' },
    },
    output: text,
    execute: async (args, exec) => {
      const dir = root(exec)
      const copy = await inside(dir, args.ruta)
      if (!await isOutput(dir, copy)) throw new Error(`Solo se escribe en copias dentro de «${OUTPUT_DIR}/» creadas con workpaper_start.`)
      const source = await readGrid(await readable(dir, args.origen), args.hoja_origen, args.rango_origen)
      const pasted = await pasteGrid(copy, args.hoja, args.celda, source.rows, args.limpiar_hasta_fila)
      const trace = traceFile(dir, copy)
      const record = await readTrace(trace)
      record[`${args.hoja}!${pasted.range}`] = { valor: `${source.rows.length} filas de ${source.sheet}!${source.range}`, origen: args.nota }
      await mkdir(join(trace, '..'), { recursive: true })
      await writeFile(trace, JSON.stringify(record, null, 1), { mode: 0o600 })
      return json({ pegado_en: `${args.hoja}!${pasted.range}`, desde: `${source.sheet}!${source.range}`, filas: source.rows.length, celdas_con_valor: pasted.cells })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workpaper_formula',
    description: 'Escribe o actualiza fórmulas en la copia de trabajo, por ejemplo para que una hoja de resumen o explicativa apunte a la columna del nuevo mes. Úsala solo cuando el papel lo requiera (referencias que avanzan mes a mes); las cifras se capturan con workpaper_write o workpaper_paste. Conserva el formato de cada celda. Después de escribir recalcula: si alguna fórmula queda en error (#REF!, #NAME?, #VALUE!) que la plantilla no tenía, deshace todo el cambio y te dice cuál falló. Nunca edites el archivo por otro medio.',
    parameters: {
      ruta: { type: 'string', required: true, description: 'Ruta de la copia devuelta por workpaper_start.' },
      formulas: {
        type: 'array',
        required: true,
        description: 'Fórmulas a escribir.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            hoja: { type: 'string', required: true, description: 'Hoja de la copia.' },
            celda: { type: 'string', required: true, description: 'Celda A1.' },
            formula: { type: 'string', required: true, description: 'Fórmula en la sintaxis en inglés de Excel, con o sin «=», por ejemplo =\'Income Tax\'!U16.' },
            motivo: { type: 'string', required: true, description: 'Por qué cambia, para la traza del contador.' },
          },
        },
      },
    },
    output: text,
    execute: async (args, exec) => {
      const dir = root(exec)
      const copy = await inside(dir, args.ruta)
      if (!await isOutput(dir, copy)) throw new Error(`Solo se escribe en copias dentro de «${OUTPUT_DIR}/» creadas con workpaper_start.`)
      const backup = await readFile(copy)
      const previous = await writeFormulas(copy, args.formulas.map(item => ({ sheet: item.hoja, cell: item.celda, formula: item.formula })))
      const cells = Object.keys(previous)
      const calc = await calculate(copy, cells)
      const fresh = new Set((await classify(dir, copy, calc)).nuevos.map(entry => entry.split(' ')[0]))
      const broken = calc.values.filter(cell => fresh.has(cell.cell))
      if (broken.length > 0) {
        await writeFile(copy, backup)
        throw new Error(`Se deshizo el cambio: ${broken.map(cell => `${cell.cell} = ${String(cell.value)}`).join(', ')}. Revisa la fórmula y las referencias.`)
      }
      const trace = traceFile(dir, copy)
      const record = await readTrace(trace)
      args.formulas.forEach((item, i) => {
        const key = cells[i] as string
        record[key] = { valor: `=${item.formula.trim().replace(/^=/u, '')} (antes: ${previous[key] === null ? 'sin fórmula' : `=${previous[key] ?? ''}`})`, origen: item.motivo }
      })
      await mkdir(join(trace, '..'), { recursive: true })
      await writeFile(trace, JSON.stringify(record, null, 1), { mode: 0o600 })
      return json({ escritas: cells.length, resultados: calc.values.map(cell => ({ celda: cell.cell, valor: cell.value })) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workpaper_calculate',
    description: 'Recalcula la copia completa con el motor de hojas de cálculo y devuelve el valor calculado de las celdas pedidas y las celdas con error (#REF!, #DIV/0!, #N/A) que este periodo introdujo; los errores que la plantilla ya tenía (meses sin trabajar) solo se cuentan. El archivo no se modifica. Úsala después de capturar para leer los resultados y verificar que el papel cuadre.',
    parameters: {
      ruta: { type: 'string', required: true, description: 'Ruta de la copia.' },
      celdas: { type: 'array', items: { type: 'string' }, required: true, description: 'Celdas o rangos «Hoja!A1» o «Hoja!A1:C20» a reportar.' },
    },
    output: text,
    execute: async (args, exec) => {
      const dir = root(exec)
      const copy = await inside(dir, args.ruta)
      const calc = await calculate(copy, args.celdas)
      const errors = await classify(dir, copy, calc)
      return json({
        valores: calc.values, errores_nuevos: errors.nuevos.slice(0, 60), total_errores_nuevos: errors.nuevos.length,
        errores_heredados_de_la_plantilla: errors.heredados,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'client_criteria_save',
    description: 'Guarda (reemplaza) el documento de criterios de este cliente: cómo se clasifica cada cuenta o grupo de cuentas en los conceptos del papel, datos fijos (coeficiente de utilidad, régimen, pérdidas por amortizar) y decisiones que confirmó el contador. Guarda como criterio solo lo que el contador confirmó o lo que no cambia el impuesto; una decisión que cambia el impuesto y no está confirmada se pregunta, no se guarda «por confirmar». Se reutiliza en cada periodo para que el resultado sea siempre igual. Escribe el documento completo en Markdown, conservando lo que siga vigente.',
    parameters: { contenido: { type: 'string', required: true, description: 'Documento completo de criterios en Markdown.' } },
    output: text,
    execute: async (args, exec) => {
      await saveCriteria(root(exec), args.contenido)
      return 'Criterios del cliente guardados.'
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workpaper_resolve',
    description: 'Marca como resuelto un pendiente de un papel ya cerrado (P1, P2, …), con la resolución en lenguaje del contador. Úsala cuando el contador pida resolver un pendiente: investiga, haz con las herramientas los cambios que hagan falta, pregunta lo que dependa de él, y al final registra aquí cómo quedó. La tarjeta del papel muestra el avance. Si la resolución cambia cifras, vuelve a cerrar con workpaper_finish.',
    parameters: {
      ruta: { type: 'string', required: true, description: 'Ruta de la copia del papel.' },
      id: { type: 'string', required: true, description: 'Identificador del pendiente, por ejemplo P3.' },
      resolucion: { type: 'string', required: true, description: 'Cómo se resolvió, en una o dos frases.' },
    },
    output: text,
    execute: async (args, exec) => {
      const dir = root(exec)
      const copy = await inside(dir, args.ruta)
      const item = await resolvePending(dir, copy, args.id, args.resolucion)
      const all = await readPendings(dir, copy)
      return json({ resuelto: item, abiertos: all.filter(entry => entry.estado === 'abierto').map(entry => entry.id) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workpaper_finish',
    description: 'Cierra el cálculo: recalcula la copia, comprueba errores y presenta al usuario la tarjeta del resultado con las cifras clave, las verificaciones y los pendientes. Llámala una sola vez al terminar; después entrega el archivo con present.',
    parameters: {
      ruta: { type: 'string', required: true, description: 'Ruta de la copia.' },
      plantilla: { type: 'string', required: true, description: 'Nombre del papel de trabajo.' },
      periodo: { type: 'string', required: true, description: 'Periodo AAAA-MM.' },
      resultados: {
        type: 'array',
        required: true,
        description: 'Cifras clave que el papel calcula (impuesto a cargo o a favor, bases), con la celda donde están.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            concepto: { type: 'string', required: true, description: 'Concepto tal como lo nombra el papel.' },
            celda: { type: 'string', required: true, description: 'Celda «Hoja!A1» donde el papel calcula la cifra.' },
          },
        },
      },
      verificaciones: { type: 'array', items: { type: 'string' }, required: true, description: 'Comprobaciones hechas, en lenguaje del contador.' },
      pendientes: {
        type: 'array',
        required: true,
        description: 'Lo que el contador debe revisar después; vacío si nada. Solo puntos que no cambian el impuesto a pagar: lo que lo cambia se pregunta antes de cerrar.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            texto: { type: 'string', required: true, description: 'El pendiente, en lenguaje del contador.' },
            cambia_impuesto: { type: 'boolean', required: true, description: 'true si, según cómo se resuelva, cambiaría algún impuesto a pagar o a favor del periodo.' },
          },
        },
      },
    },
    output: resultOutput,
    execute: async (args, exec) => {
      const open = args.pendientes.filter(item => item.cambia_impuesto)
      if (open.length > 0) {
        throw new Error(`No se cierra todavía: estos puntos cambian el impuesto y los decide el contador. Pregúntalos juntos con ask_user_question (con tu recomendación y el efecto en pesos de cada opción), aplica las respuestas, guárdalas con client_criteria_save y vuelve a cerrar. ${open.map(item => `• ${item.texto}`).join(' ')}`)
      }
      const dir = root(exec)
      const copy = await inside(dir, args.ruta)
      if (!await isOutput(dir, copy)) throw new Error(`La ruta no es una copia dentro de «${OUTPUT_DIR}/».`)
      const calc = await calculate(copy, args.resultados.map(item => item.celda))
      const resultados: WorkpaperFigure[] = args.resultados.map((item, i) => {
        const value = calc.values[i]?.value
        return { concepto: item.concepto, celda: item.celda, valor: typeof value === 'boolean' ? String(value) : value ?? null }
      })
      const trace = await readTrace(traceFile(dir, copy))
      const tarjeta: WorkpaperResult = {
        plantilla: args.plantilla, periodo: args.periodo, archivo: await shown(dir, copy), resultados,
        verificaciones: args.verificaciones, pendientes: await recordPendings(dir, copy, args.pendientes.map(item => item.texto)),
        errores: (await classify(dir, copy, calc)).nuevos.slice(0, 30), capturas: Object.keys(trace).length,
      }
      return JSON.stringify({ tarjeta, nota: 'El usuario ve esta tarjeta; no repitas todas las cifras, resume en dos o tres líneas y entrega el archivo con present.' })
    },
  }))
}
