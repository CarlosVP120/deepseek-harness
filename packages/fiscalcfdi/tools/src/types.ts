/** Browser-safe FiscalCFDI AI vocabulary shared by the Host service and the Client panels. @module */

/** Lifecycle of one company month in the FiscalCFDI AI engine. */
export type FiscalcfdiMonthState = 'draft' | 'ready' | 'running' | 'waiting' | 'completed' | 'blocked' | 'failed' | 'cancelled'

/** One company month as the start-page panel lists it. */
export interface FiscalcfdiMonth {
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
export interface FiscalcfdiCompany {
  /** Company RFC. */
  rfc: string
  /** Display name. */
  nombre: string
}

/** The company month a chat session works on. */
export interface FiscalcfdiBinding {
  /** Company RFC. */
  rfc: string
  /** Company display name. */
  empresa: string
  /** Accounting month as YYYY-MM. */
  periodo: string
}

/** A Session addressed by a Client panel. */
export interface FiscalcfdiSessionRequest {
  /** Chat Session id. */
  sessionId: string
}

/** A company month addressed by a Client panel. */
export interface FiscalcfdiMonthRequest {
  /** Company RFC. */
  rfc: string
  /** Accounting month as YYYY-MM. */
  periodo: string
}

/** Bind a chat Session to one company month. */
export interface FiscalcfdiBindRequest extends FiscalcfdiSessionRequest, FiscalcfdiMonthRequest {}

/** One file a panel uploads, base64-encoded. */
export interface FiscalcfdiUploadFile {
  /** Original file name. */
  name: string
  /** File bytes as base64. */
  data: string
}

/** Files dropped on the month panel. */
export interface FiscalcfdiUploadRequest extends FiscalcfdiMonthRequest {
  /** Files to load into the month. */
  files: FiscalcfdiUploadFile[]
}

/** One loaded source file of a month. */
export interface FiscalcfdiMonthFile {
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
export interface FiscalcfdiMonthQuestion {
  /** Question id. */
  id: string
  /** Question text. */
  pregunta: string
}

/** One checklist item a month needs before processing. */
export interface FiscalcfdiRequirement {
  /** Stable key: facturas, bancos, pdt. */
  clave: string
  /** Display title. */
  titulo: string
  /** Whether the month already has it. */
  listo: boolean
}

/** One step of the processing progress. */
export interface FiscalcfdiStep {
  /** Stable key. */
  clave: string
  /** Display title. */
  titulo: string
  /** hecho, en_curso or pendiente. */
  estado: string
}

/** Audited result of a finished month. */
export interface FiscalcfdiResult {
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
export interface FiscalcfdiMonthDetail {
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
  archivos: FiscalcfdiMonthFile[]
  preguntas: FiscalcfdiMonthQuestion[]
  requisitos: FiscalcfdiRequirement[]
  pasos: FiscalcfdiStep[]
  /** Live bank coverage while the agent works, or the audited one. */
  cubiertos: number | null
  total: number | null
  resultado: FiscalcfdiResult | null
  /** Whether an audited importable can be downloaded. */
  importable: boolean
}

/** The audited importable, ready to save. */
export interface FiscalcfdiImportable {
  /** File name. */
  nombre: string
  /** File bytes as base64. */
  data: string
}

/** The user's answer typed in the month panel. */
export interface FiscalcfdiAnswerRequest extends FiscalcfdiMonthRequest {
  /** The user's words. */
  texto: string
  /** Question answered; the first pending one when omitted. */
  pregunta_id?: string | undefined
}

/** The saved CONTPAQi SQL connection; the password never leaves the Host. */
export interface FiscalcfdiSqlConnection {
  /** Server IP or host name. */
  server: string
  /** SQL Server TCP port. */
  port: number
  /** SQL login. */
  user: string
  /** Database used for the login. */
  database: string
  /** Whether a password is saved. */
  passwordConfigured: boolean
}

/** A connection to test or save; an empty password keeps the saved one. */
export interface FiscalcfdiSqlRequest {
  /** Server IP or host name. */
  server: string
  /** SQL Server TCP port. */
  port: number
  /** SQL login. */
  user: string
  /** Database used for the login. */
  database: string
  /** New password, or empty to keep the saved one. */
  password: string
}

/** A connection that answered. */
export interface FiscalcfdiSqlCheck {
  /** The saved connection after the call. */
  connection: FiscalcfdiSqlConnection
  /** SQL Server version the server reported. */
  version: string | null
  /** Whether the call saved the connection. */
  saved: boolean
  /** Whether the saved server, port, login or database changed; the company list then needs a refresh. */
  changed: boolean
}

/** Result of re-reading the companies from the saved server. */
export interface FiscalcfdiCompanyRefresh {
  /** Companies available now. */
  companies: number
  /** Company databases the login could not read. */
  unavailable: number
}
