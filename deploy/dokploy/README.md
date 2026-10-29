# EQIDIS AI en Dokploy

Despliega la versión web multiusuario de EQIDIS AI como un servicio Docker Compose en Dokploy. Las cuentas, la carpeta por persona y el aislamiento funcionan igual que en la [guía de VPS](../eqidis-vps/README.md); aquí Dokploy pone el HTTPS y el dominio.

## Qué hay en esta carpeta

- [`Dockerfile`](Dockerfile): compila EQIDIS desde el repositorio (Node 24) e instala las fuentes que usa LibreOffice para recalcular los papeles de trabajo y generar PDFs.
- [`docker-compose.yml`](docker-compose.yml): un servicio `eqidis` en el puerto interno `3080` con dos volúmenes persistentes.
- [`start.sh`](start.sh): arranca la versión web con el dominio público.

El contenedor ya trae activadas las cuentas (`EQIDIS_CUENTAS=1`), escucha en la red interna de Docker (`EQIDIS_ESCUCHAR_RED=1`) y manda la cookie de sesión solo por HTTPS (`EQIDIS_COOKIES_SEGURAS=1`).

## Pasos en Dokploy

1. **Crear el servicio.** En tu proyecto: **Create Service → Compose**.
2. **Origen.** Proveedor **GitHub** (o Git) con el repositorio `CarlosVP120/deepseek-harness`, rama `eqidis`. En **Compose Path** escribe `./deploy/dokploy/docker-compose.yml`.
3. **Variables.** En **Environment**:
   ```
   EQIDIS_DOMINIO=eqidis.tuempresa.com
   ```
   Opcional: `DEEPSEEK_API_KEY` u `OPENROUTER_API_KEY`. También se pueden configurar después, como administrador, en **Ajustes → Modelos**.
4. **Dominio.** En **Domains → Add Domain**: servicio `eqidis`, host `eqidis.tuempresa.com`, puerto `3080`, **HTTPS** activado con Let's Encrypt. El dominio debe ser el mismo que `EQIDIS_DOMINIO`.
5. **Deploy.** La primera compilación tarda varios minutos; el servidor necesita al menos 4 GB de RAM para compilar.
6. **Crear el administrador.** En **Logs** del servicio busca la línea `dsh web: https://eqidis.tuempresa.com/login?setup=…`, abre ese enlace y crea la cuenta de administrador. Desde el menú con tu nombre, **Usuarios**, das de alta al equipo.

## Datos y respaldos

| Volumen | Contenido |
|---|---|
| `eqidis-datos` → `/data` | cuentas, conversaciones, ajustes y llaves |
| `eqidis-usuarios` → `/usuarios` | carpeta de cada persona con sus proyectos y papeles |

Respalda ambos volúmenes (Dokploy → **Volume Backups**). Un nuevo despliegue conserva los volúmenes.

## Actualizar

Cada **Deploy** (o el webhook de GitHub, si activas **Autodeploy**) recompila desde la rama `eqidis` y reinicia el contenedor; las conversaciones abiertas se reconectan solas.

## Si algo falla

- **La página da 403 en todo:** `EQIDIS_DOMINIO` no coincide con el dominio que abre el navegador.
- **No se queda la sesión al entrar:** el dominio se está abriendo por `http://`; activa HTTPS en el dominio de Dokploy.
- **No aparece el enlace de configuración:** ya existe un administrador; entra con su usuario.
