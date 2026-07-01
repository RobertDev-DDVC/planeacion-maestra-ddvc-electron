# Planeación Maestra DDVC — App de escritorio (Electron)

Empaqueta la app Next.js de `../pm-next` como aplicación de escritorio para Windows.
El servidor de Next corre **embebido** dentro de Electron (no es export estático), porque
la app usa API routes, server actions y autenticación por sesión (`proxy.ts`).

## Arquitectura

- `main.js` — proceso principal de Electron. En producción inyecta las credenciales,
  levanta el server standalone de Next (`renderer/server.js`) en `127.0.0.1:3000` y carga
  la ventana. Expone IPC para guardar Excel y escribir logs locales.
- `preload.js` — puente seguro (`window.electronAPI`).
- `build-electron.js` — compila `pm-next` con `output: 'standalone'`, copia los artefactos a
  `renderer/`, genera `config.json` desde `pm-next/.env.local` y empaqueta con electron-builder.
- `renderer/` — generado por el build (ignorado en git).

## Requisitos previos

- Node.js + pnpm
- `pm-next` como carpeta hermana (`../pm-next`) con sus dependencias instaladas.
- `pm-next` debe tener `output: 'standalone'` (en `next.config.ts`) y
  `nodeLinker: hoisted` (en `pnpm-workspace.yaml`). Esto último es **obligatorio en
  Windows**: con el `node_modules` de symlinks por defecto de pnpm, el server standalone
  falla con `EPERM` al hacer `realpathSync`. Si cambias el linker, reinstala
  (`rm -rf node_modules && pnpm install`).

## Desarrollo

En dos terminales:

```bash
# 1) en pm-next
pnpm dev

# 2) en pm-electron
pnpm electron:dev
```

`electron:dev` espera a `http://localhost:3000` (el `next dev` de pm-next) y abre la ventana.
En dev, las credenciales las toma `next dev` desde `pm-next/.env.local`.

## Build de producción

```bash
# en pm-electron
pnpm electron:build
```

Genera el instalador NSIS en `dist/`.

## Configuración de credenciales (producción)

Las credenciales quedan **embebidas en el instalador**: `build-electron.js` genera
`config.json` a partir de `pm-next/.env.local` y electron-builder lo empaqueta (vía
`extraResources`) en `resources/config.json`. El usuario final **no** tiene que copiar
nada manualmente.

Antes de `pnpm electron:build`, asegúrate de que `pm-next/.env.local` tenga todas las
credenciales requeridas (el build avisa si alguna clave queda vacía). Al abrir la app, si
falta alguna variable obligatoria (p. ej. `SESSION_SECRET`), muestra un error.

**Override opcional:** si existe `%APPDATA%\pm-ddvc\config.json`, sus claves tienen prioridad
sobre las empaquetadas (merge por clave). Útil para ajustar credenciales en una máquina
concreta sin recompilar. Usa `config.example.json` como plantilla.

> ⚠️ **Seguridad:** con `asar: false`, el `config.json` embebido queda en **texto plano**
> dentro del instalador y de la carpeta de instalación. Cualquiera con el `.exe` o acceso al
> equipo puede leer los secretos (*service principals* de Dataverse/Dynamics/Fabric/OneDrive
> y `SESSION_SECRET`). Trata el instalador como secreto: **distribución controlada**, no lo
> subas a repos/nube públicos. Rota las credenciales periódicamente.

## Datos locales

La app guarda en `%APPDATA%\pm-ddvc\`:
- `exports/` — respaldo de cada Excel generado (el archivo principal va a **Descargas**).
- `logs/` — copia local de los logs (también se envían a OneDrive).
