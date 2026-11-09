# Registro Completo de Conversación y Cambios ("El tablero")

> **IMPORTANTE PARA CUALQUIER AGENTE:** Este archivo guarda el historial cronológico completo de todos los prompts del usuario (Juani / poyo) y las decisiones de diseño e implementación aplicadas en el repositorio. **Con cada nuevo prompt del usuario, actualizá este archivo antes de hacer commit y `git push origin main`.**

---

## Contexto General del Proyecto
- **Nombre de la plataforma:** `El tablero` (`@quetablero` · escena underground `0261` Mendoza).
- **Estética:** Apple / Editorial (`SecondStory`, `manifold.art`, `[untitled]`) + WebGL 3D interactivo (`Three.js` / `@react-three/fiber`).
- **Tono con el usuario:** Español argentino casual ("juani", "gordo", "boludo", "negro"), respuestas directas y al hueso.
- **Regla de oro de vocabulario:** Nunca usar la palabra `"corte"` ni `"cortes"`; usar siempre `"proyectos"`, `"tracks"` o `"canciones"`.
- **Deploy continuo:** Siempre hacer `git commit` y `git push origin main` al finalizar cada cambio para que Vercel despliegue automáticamente.

---

## Historial Cronológico de Prompts y Cambios

### Turno 1 — Migración de chat y rediseño de textos, Dynamic Island, Partículas 808 y Controles Spotify
**Prompt del usuario:**
1. Cambio de nomenclatura en `Biblioteca`:
   - `"Bloques 3d con video y discos por corte"` → `"Mis Proyectos"`
   - `"Entorno 3D con Videos (Default)"` → `"Bloques"`
   - `"Hilera de Discos 3D"` → `"Vinilos"`
   - `"Entorno 3d gpu // manifold cluster"` → `"Mis Proyectos // Bloques"`
   - `"Vista hilera 3d // proyectos apilados"` → `"Mis Proyectos // Vinilos"`
   - Subtítulo en ambos: `"Arrastrá para mover · Seleccioná un proyecto"`
   - `"Carpeta de Videos (3-5s)"` → `"Canvas"` y `"Videos 3-5s"`
   - Metadata completable por el usuario con atributos, tipo de proyecto (`EP`, `Mixtape`, `Album`, `Single`, etc.) y cantidad de canciones.
   - `"spinner 4 discos exactos"` → `"Spinner"`
   - Prohibido usar la palabra `"cortes"` en toda la app.
   - `"Subir Tema"` → `"Subir"`.
2. Cambios en `Inicio` y `Dynamic Island`:
   - `"EL TABLERO // UG BOARD"`, `@quetablero`, `"Tus proyectos. Tu identidad. Tu gente. Tu música."`, `"📌 Mendoza"`.
   - `"Proyectos fijados"`, `"PROYECTOS // ROTACIÓN DEL TABLERO"`, `"ARTISTAS // ROTACIÓN DEL TABLERO"`, `"Artistas en El Tablero"`.
   - En el Dynamic Island: sacar `"Abrir Reproductor"`, poner un slider de volumen a la derecha, centrar al 100% los botones de Play/Skip en el medio, y mostrar solo nombre del track y artista a la izquierda (sin BPM ni Key).
   - Quitar scrollbar fantasma de `.filmstrip-row`.
3. Reproductor 3D (`PerformativePlayer.tsx` + `sfx.ts`):
   - Partículas como visualizador por defecto (en lugar de los Props).
   - Duplicar la cantidad de partículas a **36.000** y reducir su tamaño un **50%** (`size = 0.021`).
   - Detección de **808 / sub-bass en tiempo real (`30Hz–115Hz`)**: cada vez que pega el 808 las partículas saltan hacia afuera proporcionalmente a la fuerza del 808 y cuando termina el 808 vuelven con resorte a su posición original en el flujo.
   - Controles completos estilo Spotify: barra de progreso con duración, shuffle, repeat, like, cola de reproducción (`Queue` drawer) y volumen.

**Implementación (`commit 976a9fc`):**
- Actualizados `App.tsx`, `ManifoldLibrary3D.tsx`, `DiscSpinner3D.tsx`, `MacInstallerUpload.tsx`, `PerformativePlayer.tsx`, `sfx.ts` y `globals.css`.

---

### Turno 2 — Rediseño Responsive Completo para iPhone
**Prompt del usuario:**
- *"repensá toda la interfaz desde el iphone es inusable ejejej igual nunca te lo pedi pero mandale que quede cheto bien"* (adjuntó 4 capturas desde iPhone mostrando textos gigantes superpuestos, barra superior apretada y elementos 3D cortados).

**Implementación (`commit b77dc59`):**
- Creado sistema responsive integral `@media (max-width: 720px)` en `src/app/globals.css`.
- Agregado `ResponsiveSceneGroup` en `ManifoldLibrary3D.tsx` y `ResponsiveSpinnerGroup` en `DiscSpinner3D.tsx` para auto-escalar las escenas 3D según el ancho del viewport de iPhone.
- Reestructurado el header en iPhone en 2 filas limpias, `.corecore-stage` compacto, `Dynamic Island` compacto y `PerformativePlayer` apilado estilo Spotify iOS.

---

### Turno 3 — Orden de Píldora Superior, 2 Modos en Biblioteca (Zoom Voxel Adentro del Cubo vs Lado a Lado) y Pantalla "Crear Proyecto" con Partículas Sentientes
**Prompt del usuario:**
1. Intercambiar la posición de `Subir` y `Biblioteca` en la píldora de arriba (`Inicio · Subir · Biblioteca · @poyo`).
2. Mostrar las dos interfaces de `Biblioteca` (`ManifoldLibrary3D` y `project-inspector-sheet`) de **2 formas** con un switch arriba a la derecha:
   - **Modo 1 (Default — `🎯 Adentro del Cubo`):** una adentro de la otra. Cuando tocás el cubo, la cámara hace zoom hacia adentro del cubo mientras la cara frontal se desintegra en pequeños vóxeles que se ponen blanquitos antes de desintegrarse (`VoxelDivePortal`), y ahí entrás al proyecto.
   - **Modo 2 (`◫ Lado a Lado`):** uno al lado del otro por comodidad.
3. Bajar el switch de `🧊 Bloques / 💿 Vinilos` adentro de `MIS PROYECTOS // BLOQUES` justo a la derecha de `"Arrastrá para mover · Seleccioná un proyecto"`.
4. Botón `+` donde están todos los proyectos (y también desde `Subir`) que lleva a la nueva pantalla **`Crear Proyecto` (`CreateProjectScreen.tsx`)** con un **enjambre de 28.000 partículas sentientes** que arman el modelo 3D del título `"El tablero"`, se dispersan de a una (*scouts*), se dispersan en 12 grupos autónomos, crean formas entre sí y vuelven a juntarse en el logo 3D `"El tablero"`.

**Implementación (`commit 2f426d4`):**
- Creado `src/components/CreateProjectScreen.tsx` y actualizados `ManifoldLibrary3D.tsx`, `MacInstallerUpload.tsx`, `App.tsx` y `globals.css`.

---

### Turno 4 — Abanico Curvo Fijo de Vinilos (Cero Rotación 3D), Eliminar Proyectos/Tracks (`🗑️`), Artistas y Proyectos Reales, Novedades de Productores e Importador de `[untitled]`
**Prompt del usuario:**
1. **Vinilos con posición fija y diseño en abanico curvo (`image.png`):**
   - Al rotar los cubos en `Biblioteca` no se pueden rotar los vinilos; los vinilos tienen posición fija.
   - En lugar de apilarlos en diagonal 3D, mostrarlos en un **abanico curvo en arco C sobre la izquierda** igual a la imagen de referencia (`image.png`), con sobres redondeados inclinados tangencialmente a la curva y el disco de vinilo asomando.
2. **Registro de conversación en el repo (`CONVERSATION_LOG.md` + `AGENTS.md`):**
   - Actualizar con cada prompt el log de toda la conversación guardado en el repo por si en algún momento cambia de agente.
3. **Eliminar proyectos enteros y eliminar tracks (`🗑️` siempre visible):**
   - Botón de la basurita (`🗑️`) siempre visible en píldoras de proyectos, inspector de proyecto, filas de tracks (`Inicio` y `Biblioteca`), `Spinner` y modal de editar track.
4. **Nuevos nombres de artistas reales:**
   - `eyebags`, `Ma7imza`, `poyo`, `Nvcho`, `alva musicc`, `Máximo`, `V4lentin0`, `Tizianolased`, `dorkke`.
5. **Nuevos nombres de proyectos reales:**
   - `LA PLAGA` (Mixtape — `eyebags`)
   - `PERDÓN POR LA DEMORA` (Mixtape — `Tizianolased`)
   - `chickenNugget` (EP — `poyo`)
   - `ESTO ES ESTAR EN SONIDO` (LP — `V4lentin0`)
   - `AMORIO CLUB 2` (EP — `Máximo`)
6. **Novedades de productores (`Beatpost`, `Soundkit`, `Drumkit`, `Loopkit`, `Catálogo de Beats`):**
   - Incluidos tanto en una sección dedicada en `Inicio` (`NOVEDADES DE PRODUCTORES // BEATPOST · SOUNDKIT · DRUMKIT · LOOPKIT · CATÁLOGO DE BEATS`) como en los tipos de proyecto al crear/editar proyectos.
7. **Importador desde `[untitled]` (`untitled.stream`) en la página de Perfil:**
   - Creado endpoint `/api/import-untitled` (`src/app/api/import-untitled/route.ts`) + componente `src/components/UntitledImporter.tsx` integrado directamente en la página de `Perfil` (`@poyo`), permitiendo pegar cualquier link de `untitled.stream` o subir carpetas WAV/MP3 exportadas de `[untitled]`, previsualizar/editar tracks y convertirlo en un bloque 3D + vinilo en 1 click.

---

### Turno 5 — Partículas 100% Blancas en "Crear Proyecto" y Arreglo Total de Clicks/Interacción en Modo Vinilos
**Prompt del usuario:**
1. *"QUE LAS PARTICULAS DE CREACION DEL PROYECTO POR FAVOR SEAN BLANCAS !"*
2. *"cuando cambio a vinilos todo queda inusable no puedo volver a bloques ni entrar a los proyectos ni cambiar el seleccionado, arregla todo lo de vinilos que anda medio mal, no se puede clickear para entrar a los proyectos tambpcoo"*

**Implementación:**
- **Partículas 100% blancas en `Crear Proyecto` (`src/components/CreateProjectScreen.tsx`):**
  - Configurados los 28.000 vértices de color en blanco puro (`#ffffff`, `0.94–1.0` en RGB) sobre fondo `#070709` con `<pointsMaterial color="#ffffff" size={0.028} opacity={0.96} toneMapped={false} />`.
- **Arreglo de interacción, clicks y z-index en `Vinilos` (`src/components/ManifoldLibrary3D.tsx` + `src/app/globals.css`):**
  - Eliminado `setPointerCapture` del contenedor `.vinyl-arc-stage` que secuestraba los eventos `pointerup`/`click` e impedía clickear el switch `🧊 Bloques / 💿 Vinilos`, las píldoras de proyectos y los sobres de vinilo.
  - Subido `.manifold-stage-overlay-top` a `z-index: 90; pointer-events: auto;` y aislado el stacking context de `.vinyl-fan-arc-viewport` (`z-index: 1; isolation: isolate;`) para que ningún vinilo (`z-index: 50`) ni tarjeta inspectora (`z-index: 60`) tape la barra superior.
  - Agregados botones rápidos `▲` / `▼` para girar el abanico de vinilos, pills de tracks directos en la tarjeta derecha y soporte para que clickear cualquier sobre de vinilo lo seleccione y abra el proyecto (`onDiveIntoProject`).

