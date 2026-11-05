/**
 * Server-rendered sign-in and account pages. They are plain HTML forms so they
 * work before the application bundle loads and without JavaScript. Every link
 * is relative, so the pages work under a reverse-proxy mount.
 */

import { BRAND_MARK, BRAND_WORDMARK } from './brand.ts'
import { ASSETS_PATH } from './assets.ts'
import { MIN_PASSWORD_LENGTH } from './store.ts'
import type { AccountView } from './types.ts'

function escape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

const STYLE = `
@font-face { font-family: Montserrat; font-weight: 400; font-display: swap; src: url(${ASSETS_PATH}/montserrat-regular.woff2) format('woff2'); }
@font-face { font-family: Montserrat; font-weight: 500 700; font-display: swap; src: url(${ASSETS_PATH}/montserrat-medium.woff2) format('woff2'); }
:root { color-scheme: light; --purple: #664899; --coral: #e86a6e; --accent: #664899; --accent-hover: #563c83; --accent-soft: #f1ecf8;
  --ink: #2b2b2b; --muted: #6b6878; --line: #e6e2ee; --field: #fbfafd; --bg: #f6f4fa; --card: rgba(255, 255, 255, .94); --surface: #fff;
  --error: #b3261e; --ok: #1f7a4d; --scene: url(${ASSETS_PATH}/fondo-dia.webp); --veil: rgba(40, 24, 72, .18);
  --shadow: 0 24px 64px -24px rgba(48, 26, 92, .45), 0 2px 6px rgba(48, 26, 92, .08); }
@media (prefers-color-scheme: dark) { :root { color-scheme: dark; --accent: #a68bd6; --accent-hover: #b9a2e2; --accent-soft: #2d2540;
  --ink: #f2f0f6; --muted: #aaa6b6; --line: #37324a; --field: #1a1724; --bg: #110f18; --card: rgba(24, 21, 34, .9); --surface: #1a1724;
  --error: #f2b8b5; --ok: #8fd5ae; --scene: url(${ASSETS_PATH}/fondo-noche.webp); --veil: rgba(8, 6, 16, .35);
  --shadow: 0 24px 64px -24px rgba(0, 0, 0, .8), 0 0 0 1px rgba(255, 255, 255, .04); } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink);
  font: 14px/1.55 Montserrat, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
.scene { position: fixed; inset: 0; z-index: -1; background: linear-gradient(var(--veil), var(--veil)), var(--scene) 12% 50% / cover no-repeat, var(--bg); }
main { max-width: 440px; margin: 0 auto; padding: 10vh 16px 48px; }
.brand { display: flex; align-items: center; gap: 12px; color: var(--ink); }
.brand .wordmark { height: 18px; width: auto; }
.brand .product { padding-left: 12px; border-left: 1px solid var(--line); font-weight: 500; font-size: 13px; letter-spacing: .14em;
  background: linear-gradient(151deg, var(--purple), var(--coral)); -webkit-background-clip: text; background-clip: text; color: transparent; }
@media (prefers-color-scheme: dark) { .brand .product { background: linear-gradient(151deg, #b49ae0, #f08a8d); -webkit-background-clip: text; background-clip: text; } }
.card { background: var(--card); border-radius: 20px; padding: 32px; margin-bottom: 16px; box-shadow: var(--shadow);
  -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); }
.signin .brand { margin-bottom: 28px; }
.signin .card::before { content: ""; display: block; height: 3px; margin: -32px -32px 28px; border-radius: 20px 20px 0 0;
  background: linear-gradient(90deg, var(--purple), var(--coral)); }
h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -.01em; } h2 { margin: 0 0 16px; font-size: 16px; font-weight: 600; }
p.lead { margin: 0 0 24px; color: var(--muted); }
label { display: block; margin: 0 0 14px; font-weight: 500; font-size: 13px; }
input, select { display: block; width: 100%; margin-top: 6px; padding: 11px 13px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--field); color: inherit; font: inherit; font-size: 14px; transition: border-color .15s, box-shadow .15s; }
input:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
button { padding: 11px 18px; border: 0; border-radius: 12px; background: var(--accent); color: #fff; font: inherit; font-weight: 600;
  cursor: pointer; transition: background .15s, transform .05s; }
@media (prefers-color-scheme: dark) { button { color: #17131f; } }
button:hover { background: var(--accent-hover); } button:active { transform: translateY(1px); }
button:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent); }
button.quiet { background: transparent; color: var(--accent); padding: 6px 10px; }
button.quiet:hover { background: var(--accent-soft); }
button.full { width: 100%; margin-top: 10px; padding: 13px 18px;
  background: linear-gradient(120deg, var(--purple) 0%, #7a4f9e 55%, var(--coral) 130%); color: #fff; }
button.full:hover { filter: brightness(1.06); }
.notice { padding: 11px 13px; border-radius: 12px; margin-bottom: 18px; font-size: 13px; }
.notice.error { background: color-mix(in srgb, var(--error) 12%, transparent); color: var(--error); }
.notice.ok { background: color-mix(in srgb, var(--ok) 12%, transparent); color: var(--ok); }
.foot { margin-top: 20px; text-align: center; color: rgba(255, 255, 255, .85); font-size: 12px; text-shadow: 0 1px 2px rgba(0, 0, 0, .35); }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
.wide main { max-width: 920px; padding-top: 0; }
.wide .scene { bottom: auto; height: 220px; }
.bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 20px 4px 72px; }
.bar .brand { padding: 9px 14px; border-radius: 14px; background: var(--surface); box-shadow: 0 6px 20px -8px rgba(30, 16, 60, .45); }
.bar .brand .wordmark { height: 15px; } .bar .brand svg.mark { width: 28px; height: 28px; }
.bar nav { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.bar nav a, .bar nav button { color: #fff; padding: 7px 12px; border-radius: 10px; background: rgba(255, 255, 255, .14); font-size: 13px; font-weight: 500; }
.bar nav a:hover, .bar nav button:hover { background: rgba(255, 255, 255, .26); text-decoration: none; }
.bar nav a[aria-current] { background: #fff; color: var(--purple); }
.wide h1 { margin: 0 0 4px; }
.wide .card { background: var(--surface); -webkit-backdrop-filter: none; backdrop-filter: none; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
tr:last-child td { border-bottom: 0; }
th { color: var(--muted); font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.chip { display: inline-block; padding: 2px 10px; border-radius: 99px; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 500; }
.chip.off { background: transparent; border: 1px solid var(--line); color: var(--muted); }
.row-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.row-actions form { display: flex; gap: 6px; margin: 0; }
.row-actions input { width: 180px; margin: 0; padding: 7px 10px; font-size: 13px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0 14px; }
.muted { color: var(--muted); font-size: 12px; }
.table-wrap { overflow-x: auto; }
@media (max-width: 520px) { .card { padding: 24px 20px; } .signin .card::before { margin: -24px -20px 24px; } main { padding-top: 6vh; } }
`

const BRAND = `<div class="brand">${BRAND_MARK}${BRAND_WORDMARK}<span class="product">AI</span></div>`

function page(title: string, body: string, layout: 'signin' | 'wide' = 'signin'): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="same-origin"><meta name="color-scheme" content="light dark">
<title>${escape(title)} · EQIDIS AI</title><style>${STYLE}</style></head>
<body class="${layout}"><div class="scene" aria-hidden="true"></div><main>${body}</main></body></html>`
}

function signInCard(title: string, card: string): string {
  return page(title, `<div class="card">${BRAND}${card}</div><p class="foot">Asistente contable de EQIDIS</p>`)
}

function notice(message: string | undefined, kind: 'error' | 'ok' = 'error'): string {
  return message === undefined ? '' : `<div class="notice ${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${escape(message)}</div>`
}

const PASSWORD_HINT = `Al menos ${String(MIN_PASSWORD_LENGTH)} caracteres.`

/**
 * Render the sign-in page.
 * @param state - the typed username and the error to show, if any.
 * @returns the sign-in page.
 */
export function signInPage(state: { username?: string; error?: string; message?: string }): string {
  return signInCard('Iniciar sesión', `<h1>Iniciar sesión</h1>
<p class="lead">Entra con el usuario y la contraseña que te dio el administrador.</p>
${notice(state.error)}${notice(state.message, 'ok')}
<form method="post" action="login">
<label>Usuario<input name="username" autocomplete="username" autocapitalize="none" required autofocus value="${escape(state.username ?? '')}"></label>
<label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
<button class="full" type="submit">Entrar</button>
</form>`)
}

/**
 * Render the page creating the first administrator.
 * @param state - the setup token, the typed values, and the error to show, if any.
 * @returns the page creating the first administrator.
 */
export function setupPage(state: { token: string; username?: string; name?: string; error?: string }): string {
  return signInCard('Crear administrador', `<h1>Crear la cuenta de administrador</h1>
<p class="lead">Es la primera vez que se abre EQIDIS AI en este servidor. El administrador da de alta a las demás personas.</p>
${notice(state.error)}
<form method="post" action="login">
<input type="hidden" name="setup" value="${escape(state.token)}">
<label>Nombre<input name="name" autocomplete="name" required autofocus value="${escape(state.name ?? '')}"></label>
<label>Usuario<input name="username" autocomplete="username" autocapitalize="none" required value="${escape(state.username ?? '')}"></label>
<label>Contraseña<input name="password" type="password" autocomplete="new-password" required minlength="${String(MIN_PASSWORD_LENGTH)}"></label>
<label>Confirmar contraseña<input name="confirm" type="password" autocomplete="new-password" required></label>
<p class="muted">${PASSWORD_HINT}</p>
<button class="full" type="submit">Crear y entrar</button>
</form>`)
}

/**
 * Render the page for a missing or spent setup link.
 * @returns the page shown for a setup link that is missing or no longer valid.
 */
export function setupClosedPage(): string {
  return signInCard('Configuración pendiente', `<h1>EQIDIS AI aún no tiene administrador</h1>
<p class="lead">Abre el enlace de configuración que aparece en la consola del servidor al iniciar EQIDIS AI.</p>`)
}

function header(current: AccountView, currentPage: 'cuentas' | 'cuenta'): string {
  const link = (href: 'cuentas' | 'cuenta', label: string): string =>
    `<a href="${href}"${href === currentPage ? ' aria-current="page"' : ''}>${label}</a>`
  return `<div class="bar">${BRAND}<nav><a href="./">Volver a EQIDIS AI</a>
${current.role === 'admin' ? link('cuentas', 'Usuarios') : ''}${link('cuenta', 'Mi cuenta')}
<form method="post" action="logout" style="margin:0"><button type="submit">Cerrar sesión</button></form></nav></div>`
}

/**
 * Render the account administration page.
 * @param current - the signed-in administrator.
 * @param accounts - every account.
 * @param state - the result of the last change.
 * @returns the account administration page.
 */
export function accountsPage(current: AccountView, accounts: readonly AccountView[],
  state: { error?: string; message?: string }): string {
  const rows = accounts.map(account => `<tr>
<td><strong>${escape(account.name)}</strong><div class="muted">${escape(account.username)}</div></td>
<td><span class="chip">${account.role === 'admin' ? 'Administrador' : 'Contador'}</span></td>
<td>${account.disabled ? '<span class="chip off">Desactivada</span>' : '<span class="chip">Activa</span>'}</td>
<td><div class="row-actions">
<form method="post" action="cuentas"><input type="hidden" name="action" value="password"><input type="hidden" name="id" value="${account.id}">
<input name="password" type="password" placeholder="Nueva contraseña" autocomplete="new-password" required minlength="${String(MIN_PASSWORD_LENGTH)}" aria-label="Nueva contraseña de ${escape(account.username)}">
<button class="quiet" type="submit">Cambiar</button></form>
${account.id === current.id ? '' : `<form method="post" action="cuentas"><input type="hidden" name="action" value="${account.disabled ? 'enable' : 'disable'}">
<input type="hidden" name="id" value="${account.id}"><button class="quiet" type="submit">${account.disabled ? 'Activar' : 'Desactivar'}</button></form>`}
</div></td></tr>`).join('')
  return page('Usuarios', `${header(current, 'cuentas')}
<div class="card"><h1>Usuarios</h1><p class="lead">Da de alta a cada persona del equipo con un usuario y una contraseña inicial.</p>
${notice(state.error)}${notice(state.message, 'ok')}
<h2>Dar de alta</h2>
<form method="post" action="cuentas"><input type="hidden" name="action" value="create">
<div class="grid">
<label>Nombre<input name="name" required></label>
<label>Usuario<input name="username" autocapitalize="none" required></label>
<label>Contraseña inicial<input name="password" type="password" autocomplete="new-password" required minlength="${String(MIN_PASSWORD_LENGTH)}"></label>
<label>Rol<select name="role"><option value="user">Contador</option><option value="admin">Administrador</option></select></label>
</div>
<p class="muted">${PASSWORD_HINT} Cada persona, incluidos los administradores, ve solo sus propios proyectos, archivos y conversaciones. Los administradores además dan de alta usuarios y cambian los ajustes.</p>
<button type="submit">Crear usuario</button></form></div>
<div class="card table-wrap"><h2>Personas</h2><table><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
<tbody>${rows}</tbody></table></div>`, 'wide')
}

/**
 * Render the page where a person changes their own password.
 * @param current - the signed-in account.
 * @param home - the account's own folder.
 * @param state - the result of the last change.
 * @returns the page where a person changes their own password.
 */
export function ownAccountPage(current: AccountView, home: string, state: { error?: string; message?: string }): string {
  return page('Mi cuenta', `${header(current, 'cuenta')}
<div class="card"><h1>${escape(current.name)}</h1><p class="muted">Usuario: ${escape(current.username)} · Carpeta de proyectos: ${escape(home)}</p></div>
<div class="card"><h2>Cambiar contraseña</h2>
${notice(state.error)}${notice(state.message, 'ok')}
<form method="post" action="cuenta">
<label>Contraseña actual<input name="current" type="password" autocomplete="current-password" required></label>
<label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" required minlength="${String(MIN_PASSWORD_LENGTH)}"></label>
<label>Confirmar nueva contraseña<input name="confirm" type="password" autocomplete="new-password" required></label>
<p class="muted">${PASSWORD_HINT} Al cambiarla se cierran tus otras sesiones.</p>
<button type="submit">Guardar</button></form></div>`, 'wide')
}
