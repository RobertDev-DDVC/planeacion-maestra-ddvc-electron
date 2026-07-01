# Planeación Maestra DDVC — App de escritorio (Electron)

Empaqueta la app Next.js de `../pm-next` como aplicación de escritorio para Windows.
El servidor de Next corre **embebido** dentro de Electron (no es export estático), porque
la app usa API routes, server actions y autenticación por sesión (`proxy.ts`).

## Arquitectura

- `main.js` — proceso principal de Electron. En producción inyecta las credenciales,
  levanta el server standalone de Next (`renderer/server.js`) en `127.0.0.1:3000` y carga
  la ventana. Expone IPC para guardar Excel y escribir logs locales.
- `preload.js` — puente seguro (`window.electronAPI`).
- `build-electron.js` — compila `pm-next` con `output: 'standalone'` y copia los artefactos a
  `renderer/`, luego empaqueta con electron-builder.
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

Las credenciales **no** se incluyen en el instalador. Tras instalar, coloca un archivo
`config.json` en:

```
%APPDATA%\pm-ddvc\config.json
```

Usa `config.example.json` como plantilla y completa los valores (mismos que
`pm-next/.env.local`). Si falta el archivo o `SESSION_SECRET`, la app muestra un error al abrir.

Las credenciales son *service principals* con acceso a Dataverse/Dynamics/Fabric/OneDrive:
trátalas como secretos y rótalas editando este `config.json` (no requiere recompilar).

## Datos locales

La app guarda en `%APPDATA%\pm-ddvc\`:
- `exports/` — respaldo de cada Excel generado (el archivo principal va a **Descargas**).
- `logs/` — copia local de los logs (también se envían a OneDrive).
