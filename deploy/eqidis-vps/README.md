# EQIDIS AI en un servidor (VPS) para varios usuarios

Esta guía publica la versión web de EQIDIS AI en un servidor Linux para que el equipo entre desde el navegador con su usuario y contraseña. Cada persona trabaja en su propia carpeta del servidor y solo ve sus proyectos y conversaciones; el administrador ve todo y da de alta a los usuarios.

## Cómo funciona

- **Cuentas.** Con `EQIDIS_CUENTAS=1`, el enlace con token de la versión web se reemplaza por la página «Iniciar sesión». Las cuentas se guardan en `$DSH_HOME/eqidis-cuentas/cuentas.json` (contraseñas con scrypt, archivo solo legible por el servicio).
- **Una carpeta por persona.** Cada usuario tiene `EQIDIS_CARPETAS/<usuario>`. Sus proyectos se crean ahí; el selector de carpetas empieza ahí y no acepta carpetas de otra persona.
- **Aislamiento.** El servidor revisa cada llamada: un usuario no puede listar, abrir, seguir ni escribir en conversaciones o proyectos fuera de su carpeta, ni descargar archivos de otra carpeta. Las notificaciones en vivo también se filtran por persona.
- **Administración.** Solo los administradores cambian ajustes globales (modelos, llaves de API, plugins), usan la terminal del servidor y administran usuarios en `/cuentas`. Cada persona cambia su contraseña en `/cuenta`. El menú con su nombre, al pie de la barra lateral, lleva a esas páginas y a «Cerrar sesión».
- **Sin la variable**, EQIDIS AI se comporta como siempre (instalación personal y app de escritorio).

## 1. Preparar el servidor

Requisitos: Ubuntu 22.04 o 24.04, 4 GB de RAM o más, un dominio apuntando al servidor (por ejemplo `eqidis.tuempresa.com`) y los puertos 80 y 443 abiertos.

```bash
sudo apt update && sudo apt install -y git curl build-essential caddy
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs
sudo corepack enable
sudo useradd --system --create-home --home-dir /srv/eqidis --shell /usr/sbin/nologin eqidis
```

## 2. Instalar EQIDIS AI

```bash
sudo -u eqidis git clone --branch eqidis https://github.com/CarlosVP120/deepseek-harness.git /srv/eqidis/app
cd /srv/eqidis/app
sudo -u eqidis pnpm install --frozen-lockfile
sudo -u eqidis pnpm run build
```

La llave del modelo (`DEEPSEEK_API_KEY` u otra) se configura después desde **Ajustes → Modelos** con la cuenta de administrador, o en `/srv/eqidis/app/.env`.

## 3. Servicio

Copia [`eqidis.service`](eqidis.service) a `/etc/systemd/system/`, cambia `eqidis.tuempresa.com` por tu dominio y arráncalo:

```bash
sudo cp deploy/eqidis-vps/eqidis.service /etc/systemd/system/eqidis.service
sudo systemctl daemon-reload
sudo systemctl enable --now eqidis
```

EQIDIS escucha solo en `127.0.0.1:3080`; nadie llega a él sin pasar por el proxy.

## 4. Proxy con HTTPS

Copia [`Caddyfile`](Caddyfile) a `/etc/caddy/Caddyfile`, cambia el dominio y recarga. Caddy obtiene y renueva el certificado HTTPS solo.

```bash
sudo cp deploy/eqidis-vps/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

El proxy conserva el encabezado `Host` y reenvía WebSockets, que es lo que EQIDIS necesita. Si prefieres nginx, aplica las mismas reglas de la [guía de despliegue público](../../docs/user/guide/public-deployments.md).

## 5. Crear el administrador

La primera vez, el servidor imprime un enlace de configuración de un solo uso:

```bash
sudo journalctl -u eqidis | grep "login?setup="
```

Ábrelo, crea la cuenta de administrador y entra. Después, en **Usuarios** (menú con tu nombre, al pie de la barra lateral) da de alta a cada persona con una contraseña inicial; cada quien la cambia en **Mi cuenta**.

## Operación

- **Actualizar:** `cd /srv/eqidis/app && sudo -u eqidis git pull && sudo -u eqidis pnpm install --frozen-lockfile && sudo -u eqidis pnpm run build && sudo systemctl restart eqidis`.
- **Respaldo:** respalda `/srv/eqidis/datos` (cuentas, conversaciones y ajustes) y `/srv/eqidis/usuarios` (proyectos y papeles de trabajo).
- **Dar de baja a alguien:** en **Usuarios**, «Desactivar». Sus sesiones abiertas se cierran al momento; sus archivos se conservan.
- **Olvidó su contraseña:** el administrador le asigna una nueva en **Usuarios**.

## Límites conocidos

- El agente ejecuta comandos en el servidor con el modo «Proyecto»: puede escribir solo dentro del proyecto, pero el aislamiento de lectura entre carpetas depende de los permisos del sistema. Para separar por completo a cada persona, usa un servidor por equipo o contenedores por usuario.
- Los ajustes de modelos y llaves de API son de todo el servidor: los cambia el administrador y aplican a todos.
- Las conversaciones creadas antes de activar las cuentas, fuera de las carpetas de usuarios, solo las ve el administrador.
