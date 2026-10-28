/**
 * Server-rendered sign-in and account pages. They are plain HTML forms so they
 * work before the application bundle loads and without JavaScript. Every link
 * is relative, so the pages work under a reverse-proxy mount.
 */

import { MIN_PASSWORD_LENGTH } from './store.ts'
import type { AccountView } from './types.ts'

function escape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

const STYLE = `
:root { color-scheme: light dark; --accent: #664899; --accent-soft: #f1ecf8; --ink: #2c2c34; --muted: #6b6b76;
  --line: #e4e1ea; --bg: #f7f6fa; --card: #fff; --error: #b3261e; --ok: #1f7a4d; }
@media (prefers-color-scheme: dark) { :root { --accent: #a68bd6; --accent-soft: #2b2438; --ink: #ecebf0; --muted: #a3a1ad;
  --line: #34313c; --bg: #141317; --card: #1d1b21; --error: #f2b8b5; --ok: #8fd5ae; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink);
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 420px; margin: 0 auto; padding: 12vh 16px 48px; }
main.wide { max-width: 880px; padding-top: 48px; }
.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; font-weight: 700; font-size: 18px; }
.mark { display: inline-flex; width: 32px; height: 32px; border-radius: 9px; background: var(--accent); color: #fff;
  align-items: center; justify-content: center; font-size: 15px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 24px; margin-bottom: 16px; }
h1 { margin: 0 0 4px; font-size: 20px; } h2 { margin: 0 0 12px; font-size: 16px; }
p.lead { margin: 0 0 20px; color: var(--muted); }
label { display: block; margin: 0 0 12px; font-weight: 500; }
input, select { display: block; width: 100%; margin-top: 4px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 10px;
  background: transparent; color: inherit; font: inherit; }
input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
button { padding: 9px 16px; border: 0; border-radius: 10px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
button.quiet { background: transparent; color: var(--accent); padding: 4px 8px; }
button.full { width: 100%; margin-top: 8px; }
.notice { padding: 10px 12px; border-radius: 10px; margin-bottom: 16px; }
.notice.error { background: color-mix(in srgb, var(--error) 12%, transparent); color: var(--error); }
.notice.ok { background: color-mix(in srgb, var(--ok) 12%, transparent); color: var(--ok); }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.top nav { display: flex; gap: 12px; align-items: center; }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
th { color: var(--muted); font-weight: 500; font-size: 12px; }
.chip { display: inline-block; padding: 1px 8px; border-radius: 99px; background: var(--accent-soft); color: var(--accent); font-size: 12px; }
.chip.off { background: transparent; border: 1px solid var(--line); color: var(--muted); }
.row-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.row-actions form { display: flex; gap: 6px; margin: 0; }
.row-actions input { width: 170px; margin: 0; padding: 5px 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0 12px; }
.muted { color: var(--muted); font-size: 12px; }
.table-wrap { overflow-x: auto; }
`

function page(title: string, body: string, wide = false): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="same-origin"><title>${escape(title)} · EQIDIS AI</title><style>${STYLE}</style></head>
<body><main${wide ? ' class="wide"' : ''}><div class="brand"><span class="mark">E</span>EQIDIS AI</div>${body}</main></body></html>`
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
  return page('Iniciar sesión', `<div class="card"><h1>Iniciar sesión</h1>
<p class="lead">Entra con el usuario y la contraseña que te dio el administrador.</p>
${notice(state.error)}${notice(state.message, 'ok')}
<form method="post" action="login">
<label>Usuario<input name="username" autocomplete="username" autocapitalize="none" required autofocus value="${escape(state.username ?? '')}"></label>
<label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
<button class="full" type="submit">Entrar</button>
</form></div>`)
}

/**
 * Render the page creating the first administrator.
 * @param state - the setup token, the typed values, and the error to show, if any.
 * @returns the page creating the first administrator.
 */
export function setupPage(state: { token: string; username?: string; name?: string; error?: string }): string {
  return page('Crear administrador', `<div class="card"><h1>Crear la cuenta de administrador</h1>
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
</form></div>`)
}

/**
 * Render the page for a missing or spent setup link.
 * @returns the page shown for a setup link that is missing or no longer valid.
 */
export function setupClosedPage(): string {
  return page('Configuración pendiente', `<div class="card"><h1>EQIDIS AI aún no tiene administrador</h1>
<p class="lead">Abre el enlace de configuración que aparece en la consola del servidor al iniciar EQIDIS AI.</p></div>`)
}

function header(current: AccountView, title: string): string {
  return `<div class="top"><h1>${escape(title)}</h1><nav><a href="./">Volver a EQIDIS AI</a>
${current.role === 'admin' ? '<a href="cuentas">Usuarios</a>' : ''}<a href="cuenta">Mi cuenta</a>
<form method="post" action="logout" style="margin:0"><button class="quiet" type="submit">Cerrar sesión</button></form></nav></div>`
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
  return page('Usuarios', `${header(current, 'Usuarios')}${notice(state.error)}${notice(state.message, 'ok')}
<div class="card"><h2>Dar de alta</h2>
<form method="post" action="cuentas"><input type="hidden" name="action" value="create">
<div class="grid">
<label>Nombre<input name="name" required></label>
<label>Usuario<input name="username" autocapitalize="none" required></label>
<label>Contraseña inicial<input name="password" type="password" autocomplete="new-password" required minlength="${String(MIN_PASSWORD_LENGTH)}"></label>
<label>Rol<select name="role"><option value="user">Contador</option><option value="admin">Administrador</option></select></label>
</div>
<p class="muted">${PASSWORD_HINT} Cada persona ve solo sus proyectos y conversaciones; el administrador ve todo y administra los usuarios y los ajustes.</p>
<button type="submit">Crear usuario</button></form></div>
<div class="card table-wrap"><h2>Personas</h2><table><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
<tbody>${rows}</tbody></table></div>`, true)
}

/**
 * Render the page where a person changes their own password.
 * @param current - the signed-in account.
 * @param home - the account's own folder.
 * @param state - the result of the last change.
 * @returns the page where a person changes their own password.
 */
export function ownAccountPage(current: AccountView, home: string, state: { error?: string; message?: string }): string {
  return page('Mi cuenta', `${header(current, 'Mi cuenta')}${notice(state.error)}${notice(state.message, 'ok')}
<div class="card"><h2>${escape(current.name)}</h2><p class="muted">Usuario: ${escape(current.username)} · Carpeta de proyectos: ${escape(home)}</p></div>
<div class="card"><h2>Cambiar contraseña</h2>
<form method="post" action="cuenta">
<label>Contraseña actual<input name="current" type="password" autocomplete="current-password" required></label>
<label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" required minlength="${String(MIN_PASSWORD_LENGTH)}"></label>
<label>Confirmar nueva contraseña<input name="confirm" type="password" autocomplete="new-password" required></label>
<p class="muted">${PASSWORD_HINT} Al cambiarla se cierran tus otras sesiones.</p>
<button type="submit">Guardar</button></form></div>`, true)
}
