# Extensión "El tablero — Importador de proyectos"

Código en `extension/` (Manifest V3, Chrome y Edge). El .zip que bajan los usuarios está en `public/tools/eltablero-extension.zip`:
**si cambiás algo en `extension/`, regenerá el zip** (y subí `version` en `manifest.json`).

```bash
cd extension && zip -r ../public/tools/eltablero-extension.zip . -x '.*' && cd ..
```
La tienda exige `manifest.json` en la **raíz** del zip (no adentro de una carpeta). Sin `localhost` en el manifest.

## Cómo funciona
- `bridge.js` (solo en eltablero.blog): la página le habla con `window.postMessage({source:"et-page", type, id, payload})`.
- `background.js`: corre lo de [untitled] **adentro de una pestaña de untitled.stream** (`chrome.scripting.executeScript`, world MAIN) para que Cloudflare no frene nada; si no hay pestaña, abre una por detrás. Pedidos: `untitled:list`, `untitled:project`, `untitled:file`.
- Solo proyectos propios o con permiso de edición (se chequea al listar y otra vez al bajar).
- Página: `src/lib/untitledExtension.ts` + sección "Desde [untitled]" en `ImportFoldersModal.tsx`. El ícono de la extensión abre `/?import=untitled`.

## Publicar en las tiendas
- **Chrome Web Store**: cuenta de desarrollador (USD 5, una vez) → https://chrome.google.com/webstore/devconsole → subir el zip, capturas 1280×800, ícono 128 (`extension/icons/icon128.png`), descripción, política de privacidad (`https://www.eltablero.blog/privacidad`), justificar permisos: `tabs`/`scripting` (leer la biblioteca de [untitled] del usuario desde su pestaña) y hosts `untitled.stream`. Revisión: días.
- **Edge Add-ons**: gratis → https://partner.microsoft.com/dashboard/microsoftedge → mismo zip.
- Cuando esté publicada, cambiar el paso 1 de `/importar-untitled` por el link de la tienda.
