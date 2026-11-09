<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Contexto del proyecto ("El tablero" — Estética Apple / Editorial + Entorno 3D Manifold)
- **REGLA OBLIGATORIA DE LOG:** Con **CADA** prompt nuevo del usuario, actualizá el archivo `CONVERSATION_LOG.md` en la raíz del repositorio antes de hacer `git commit` y `git push origin main`, para que si el usuario cambia de agente o sesión quede todo el historial completo guardado en el repo.
- **Tono con el usuario:** español argentino bien casual con spanglish y puteadas amistosas; llamalo "juani", "gordo", "boludo", "negro", etc. Respuestas directas y concisas.
- **Vocabulario:** NUNCA uses la palabra `"corte"` ni `"cortes"`. Usá siempre `"proyectos"`, `"tracks"` o `"canciones"`.
- **Nombre de la web:** `El tablero` (`@quetablero` · arriba a la izquierda en la barra y en el título display).
- **Artistas curados (`src/lib/mock.ts`):** `poyo`, `eyebags`, `Tizianolased`, `V4lentin0`, `Máximo`, `Ma7imza`, `Nvcho`, `alva musicc`, `dorkke`.
- **Proyectos principales (`src/lib/mock.ts`):**
  - `LA PLAGA` (Mixtape · `eyebags`)
  - `PERDÓN POR LA DEMORA` (Mixtape · `Tizianolased`)
  - `chickenNugget` (EP · `poyo`)
  - `ESTO ES ESTAR EN SONIDO` (LP · `V4lentin0`)
  - `AMORIO CLUB 2` (EP · `Máximo`)
- **Páginas del MVP (en orden en la píldora superior: `Inicio · Subir · Biblioteca · @poyo`):**
  1. `Inicio`:
     - 1º el ruido visual en el medio de la pantalla (collage con `LA PLAGA`, `PERDÓN POR LA DEMORA`, `chickenNugget`, `ESTO ES ESTAR EN SONIDO`, `AMORIO CLUB 2`), 2º el nombre gigante `El tablero` con `"Tus proyectos. Tu identidad. Tu gente. Tu música."`, y 3º la tira horizontal de miniportadas sin scrollbar fantasma.
     - Sección **Novedades de Productores (`Beatpost · Soundkit · Drumkit · Loopkit · Catálogo de Beats`)** con filtros, previews de audio y botón `🗑️`.
     - Grilla inferior con `Proyectos fijados` (`PROYECTOS // ROTACIÓN DEL TABLERO`) y `Artistas en El Tablero` (`ARTISTAS // ROTACIÓN DEL TABLERO`).
  2. `Subir` (`MacInstallerUpload.tsx`): Paso 1 arrastrar Prop al perfil -> Paso 2 abre la **Biblioteca 3D (`ManifoldLibrary3D`)**, el proyecto seleccionado **popea** de la unidad y arrastrás el Prop ahí -> Paso 3 acomodás el track en el `Spinner` (`DiscSpinner3D`). Incluye acceso directo a `+ Crear Proyecto`.
  3. `Biblioteca` (`ManifoldLibrary3D.tsx` + `DiscSpinner3D.tsx`):
     - Switch superior derecho entre 2 modos de display:
       1. **`🎯 Adentro del Cubo` (Default):** una adentro de la otra; al tocar un cubo hace zoom hacia adentro mientras la cara frontal se desintegra en pequeños vóxeles blancos (`VoxelDivePortal`) y abre el interior del proyecto.
       2. **`◫ Lado a Lado`:** escena de proyectos a la izquierda e inspector con `Spinner` a la derecha.
     - Switch interno `🧊 Bloques / 💿 Vinilos` ubicado justo a la derecha de `"Arrastrá para mover · Seleccioná un proyecto"`:
       - `🧊 Bloques`: cubos arquitectónicos 3D con videos `Canvas` de 3–5s en las caras.
       - `💿 Vinilos`: abanico curvo fijo en arco C sobre la izquierda (nunca rota con la cámara 3D de los cubos), con sobres redondeados inclinados tangencialmente y el vinilo asomando por el borde derecho.
     - Botón `+` al final de la fila de proyectos que lleva a la pantalla `Crear Proyecto` (`CreateProjectScreen.tsx`) con un enjambre de 28.000 partículas sentientes que forman el modelo 3D del logo `"El tablero"`, se dispersan de a una, en grupos y arman formas entre sí.
     - Botones de basurita (`🗑️`) siempre visibles para eliminar proyectos enteros y eliminar tracks individuales.
  4. `Perfil` (`@poyo`):
     - Incluye el **Importador directo desde `[untitled]` (`UntitledImporter.tsx` + `/api/import-untitled`)** para importar proyectos vía link de `untitled.stream` o carpeta de WAVs/MP3s directamente a la Biblioteca 3D.
     - Showcase de `Mis Proyectos & Canvas`, modal **Editar Perfil** y modal **Cuenta / Google Sign-In**.
  5. `Reproductor` (`PerformativePlayer.tsx` + Dynamic Island centrado):
     - Dynamic Island con controles Play/Skip 100% centrados, solo título y artista a la izquierda, y slider de volumen a la derecha.
     - Visualizador por defecto: **36.000 Partículas Algorítmicas (50% más pequeñas)** que laten/saltan hacia afuera cuando pegan los **808** (`30Hz–115Hz`) y vuelven a su posición al terminar el golpe de 808.
     - Controles completos estilo Spotify (barra de progreso con duración, shuffle, repeat, like, cola `Queue` y volumen).
- Siempre hacé commit y `git push` a `main` al terminar un cambio para que Vercel se actualice automáticamente.
