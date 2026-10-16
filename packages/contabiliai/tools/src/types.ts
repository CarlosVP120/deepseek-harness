/** Browser-safe FiscalCFDI AI vocabulary shared by the Host service and the Client panels. @module */

/** Lifecycle of one company month in the FiscalCFDI AI engine. */
export type ContabiliaiMonthState = 'draft' | 'ready' | 'running' | 'waiting' | 'completed' | 'blocked' | 'failed' | 'cancelled'

/** One company month as the start-page panel lists it. */
export interface ContabiliaiMonth {
  /** Company RFC, the engine's company key. */
  rfc: string
  /** Company display name. */
  empresa: string
  /** Accounting month as YYYY-MM. */
  periodo: string
  /** Engine job state. */
  estado: string
  /** Last engine activity, `YYYY-MM-DD HH:MM:SS`. */
  actualizado: string
  /** Questions waiting for the user. */
  preguntas: number
  /** Files loaded into the month. */
  archivos: number
  /** Journals of the audited result, when there is one. */
  polizas: number | null
  /** Bank movements with a journal. */
  cubiertos: number | null
  /** Bank movements in the loaded statements. */
  total: number | null
}

/** One CONTPAQi company the engine can post. */
export interface ContabiliaiCompany {
  /** Company RFC. */
  rfc: string
  /** Display name. */
  nombre: string
}

/** The company month a chat session works on. */
export interface ContabiliaiBinding {
  /** Company RFC. */
  rfc: string
  /** Company display name. */
  empresa: string
  /** Accounting month as YYYY-MM. */
  periodo: string
}

/** A Session addressed by a Client panel. */
export interface ContabiliaiSessionRequest {
  /** Chat Session id. */
  sessionId: string
}

/** A company month addressed by a Client panel. */
export interface ContabiliaiMonthRequest {
  /** Company RFC. */
  rfc: string
  /** Accounting month as YYYY-MM. */
  periodo: string
}

/** Bind a chat Session to one company month. */
export interface ContabiliaiBindRequest extends ContabiliaiSessionRequest, ContabiliaiMonthRequest {}

/** One file a panel uploads, base64-encoded. */
export interface ContabiliaiUploadFile {
  /** Original file name. */
  name: string
  /** File bytes as base64. */
  data: string
}

/** Files dropped on the month panel. */
export interface ContabiliaiUploadRequest extends ContabiliaiMonthRequest {
  /** Files to load into the month. */
  files: ContabiliaiUploadFile[]
}

/** One loaded source file of a month. */
export interface ContabiliaiMonthFile {
  /** Name the user gave the file. */
  nombre: string
  /** Kind the engine recognized, when it did. */
  tipo: string | null
  /** Role in the month (documents, bank, …), when known. */
  rol: string | null
  /** Engine status line for this file. */
  estado: string
}

/** One question the accounting agent is waiting on. */
export interface ContabiliaiMonthQuestion {
  /** Question id. */
  id: string
  /** Question text. */
  pregunta: string
}

/** One checklist item a month needs before processing. */
export interface ContabiliaiRequirement {
  /** Stable key: facturas, bancos, pdt. */
  clave: string
  /** Display title. */
  titulo: string
  /** Whether the month already has it. */
  listo: boolean
}

/** One step of the processing progress. */
export interface ContabiliaiStep {
  /** Stable key. */
  clave: string
  /** Display title. */
  titulo: string
  /** hecho, en_curso or pendiente. */
  estado: string
}

/** Audited result of a finished month. */
export interface ContabiliaiResult {
  /** Whether the independent audit passed. */
  auditoria_aprobada: boolean
  /** Journals generated. */
  polizas: number | null
  /** Bank movements with a journal. */
  cubiertos: number | null
  /** Bank movements in the statements. */
  total: number | null
  /** Creditable VAT paid, as a decimal string. */
  iva_acreditable: string | null
  /** Output VAT collected, as a decimal string. */
  iva_trasladado: string | null
}

/** Everything the month panel shows for one company month. */
export interface ContabiliaiMonthDetail {
  rfc: string
  empresa: string
  periodo: string
  /** Engine job state. */
  estado: string
  /** Engine description of the state. */
  descripcion: string
  /** Processing attempt number. */
  intento: number
  /** What the engine needs next, when it is not ready. */
  mensaje: string | null
  /** Last engine error, when any. */
  error: string | null
  /** Whether the month can be processed now. */
  listo: boolean
  archivos: ContabiliaiMonthFile[]
  preguntas: ContabiliaiMonthQuestion[]
  requisitos: ContabiliaiRequirement[]
  pasos: ContabiliaiStep[]
  /** Live bank coverage while the agent works, or the audited one. */
  cubiertos: number | null
  total: number | null
  resultado: ContabiliaiResult | null
  /** Whether an audited importable can be downloaded. */
  importable: boolean
}

/** The audited importable, ready to save. */
export interface ContabiliaiImportable {
  /** File name. */
  nombre: string
  /** File bytes as base64. */
  data: string
}

/** The user's answer typed in the month panel. */
export interface ContabiliaiAnswerRequest extends ContabiliaiMonthRequest {
  /** The user's words. */
  texto: string
  /** Question answered; the first pending one when omitted. */
  pregunta_id?: string | undefined
}
