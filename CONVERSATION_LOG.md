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

---

### Turno 6 — Partículas Abrazando el Cluster de Cubos (`0 proyectos = 0 cubos`), Animación Inmaculada del Cubo (`Por defecto`), Tapas y Tracklists Reales de Spotify, Separación Raperos vs Productores y Capacitor iOS
**Prompts del usuario:**
1. *"despues juga con las particulas en esta pantalla quiero que las particulas como que abracen el cluster de cubos (por cierto acordate que si hay 0 proyectos tieneque haber 0 cubos etc)"*
2. *"la animacion de entrar al cubo esta fierita no me gusto, refinala que quede inmaculada y no cometas errores. (por cierto donde dice "adentro del cubo" cambialo por "Por defecto")"*
3. *"y lo siguiente ya wipea todo de los ejemplos para mi y tratemos de ver como nos trata la app nativa en app store, con capacitor !"*
4. *"bueno el La Plaga del tablero main esta feo no lo estilices asi trata de cambiar otras cosas no tanto la fuente. y sacale la etiqueta de chickennugget a la mixtape de tizianolased xq no tienen nada q ver"*
5. *"de todos los artistas que te mencione el unico productor es dorkke los demas son todos raperos asi que a los raperos lo suyo al productor lo suyo. mas ejemplos de productores: 2ounces, gonza2k, bemo.wav, ando.flp, erreorocko, icylucki (tambien es prod), nutsvk"*
6. *"te mando de paso screenshot de los proyectos mencionados asi tenes la tapa y los tracks"* (adjuntó 5 capturas de Spotify: `PERDÓN LA DEMORA` de `Tizianolased`, `chickenNugget` de `poyo · dorkke`, `#MA7IAS` de `Ma7imza`, `ESTO ES ESTAR EN SONIDO` de `V4lentin0` y `Love2Hate` de `Icylucki`).

**Implementación:**
- **Tapas reales y tracklists reales desde los 5 screenshots (`public/covers/*.png` + `src/lib/mock.ts`):**
  - Recortadas y guardadas las 5 portadas oficiales en `public/covers/`: `perdon-la-demora.png`, `chickennugget.png`, `ma7ias.png`, `esto-es-estar-en-sonido.png` y `love2hate.png`.
  - Cargados los proyectos reales con todos sus tracks, feats, productores y duraciones exactas:
    - `PERDÓN LA DEMORA` (`Tizianolased` · 8 canciones: `fuma conmigo`, `peligrosita (recuerdos)`, `me sube`, `pronto es tarde`, `billetes azules` feat. blango, `antes que te vayas` feat. Elefego, `no da más`, `esta noche`).
    - `chickenNugget` (`poyo · dorkke` · EP 6 canciones: `i am GOD`, `esta cumbia`, `uno más`, `florcita`, `ni plata ni Tiempo`, `recuerdos tuyos` con prods `dorkke`, `Gonza2k`, `2ounces` y feat `Ma7imza`).
    - `#MA7IAS` (`Ma7imza` · LP 7 canciones: `SIN ANALITICO`, `AKAPITAL`, `GOLES DE CAÑO`, `HOES RETORNABLES` feat. Tizianolased, `PARA LA MAS ROCHA`, `FRANKLIN Y LAMAR`, `PIÑAZOS Y PATADAS`).
    - `ESTO ES ESTAR EN SONIDO` (`V4lentin0` · LP 9 canciones: `ESTO ES ESTAR`, `PERRAS TUNEADAS`, `CHETA LA COREO`, `DEPENDE DE MÍ` feat. Tizianolased, `CUANDO ME LLEGUE (Interludio)`, `AY BADDIE`, `ME TIRAN` feat. Ma7imza, `BAJEN PA' ACÁ`, `DECLINE`).
    - `Love2Hate` (`Icylucki` · EP 3 canciones: `Tengo tos` feat. nunoset, `3am`, `Fumo mari`).
    - `LA PLAGA` (`eyebags`) y `AMORIO CLUB 2` (`Máximo`).
- **Separación estricta Raperos vs Productores (`src/lib/mock.ts`):**
  - Raperos: `poyo`, `Tizianolased`, `Ma7imza`, `V4lentin0`, `eyebags`, `Máximo`, `Nvcho`, `alva musicc`.
  - Rapero & Productor: `Icylucki`.
  - Productores (dueños exclusivos de los Beatposts, Soundkits, Drumkits, Loopkits y Catálogos de Beats): `dorkke`, `Gonza2k`, `2ounces`, `bemo.wav`, `ando.flp`, `erreorocko`, `Icylucki`, `nutsvk`.
- **Collage Principal en `Inicio` (`src/components/App.tsx` + `src/app/globals.css`):**
  - Quitado `.gothic-drop` y los `.inline-swatch` que deformaban la fuente de `LA PLAGA` y los demás títulos; ahora usan tipografía editorial limpia y unificada (`.clean-editorial-word`), acompañados de miniaturas de las tapas reales (`.collage-cover-thumb`) y badges limpios.
  - Eliminada la etiqueta `🍗 chickenNugget` de la fila de `PERDÓN LA DEMORA` (`Tizianolased`).
- **Partículas que abrazan el cluster de cubos + `0 proyectos = 0 cubos` + Wipe en 1 click (`src/components/ManifoldLibrary3D.tsx` + `src/components/App.tsx`):**
  - Creado `ClusterEmbraceParticles` (16.000 partículas algorítmicas) que envuelven y abrazan las 6 caras/aristas de cada cubo del cluster y tejen filamentos orbitales entre cubos.
  - Cuando `projects.length === 0`, hay **0 cubos** y **0 vinilos** en escena con estado limpio `0 PROYECTOS // 0 CUBOS EN ESCENA`.
  - Agregado botón `"🧹 Wipear ejemplos (0 cubos)"` (y `"🔄 Restaurar proyectos"`) en `Biblioteca` y `Perfil`, además de permitir borrar todos los proyectos con `🗑️` hasta quedar en 0.
- **Animación Inmaculada al Entrar al Cubo (`VoxelDivePortal`) + `"Por defecto"`:**
  - Cambiado `"🎯 Adentro del Cubo"` por **`"Por defecto"`**.
  - Rediseñado `VoxelDivePortal`: al clickear el cubo activo se oculta el cubo sólido y sus 6 caras se convierten en **864 micro-vóxeles volumétricos** que se encienden en blanco puro (`#ffffff`), abren un túnel radial en espiral sincronizado con el vector de la cámara hacia el núcleo del cubo y funden con un *bloom* blanco sedoso (`.cube-dive-bloom-overlay`) hacia el interior del proyecto.
- **Configuración Nativa iOS con Capacitor (`capacitor.config.json`, `next.config.ts`, `package.json`, `src/app/layout.tsx`):**
  - Creado `capacitor.config.json` (`appId: "com.quetablero.app"`, `appName: "El tablero"`, `webDir: "out"`), scripts `npm run build:capacitor`, `npm run cap:sync`, `npm run cap:ios` y soporte de `safe-area-inset` para iPhone.

---

### Turno 7 — Fix del Build de Producción en Vercel (`DEMO_PROJECTS` import + `capacitor.config.json`)
**Prompt del usuario:**
- Adjuntó captura (`IMG_3876.png`) del correo de Vercel: `Production deployment failed on branch main at commit ec11480 (Command "npm run build" exited with 1)`.

**Implementación:**
- Agregado `DEMO_PROJECTS` al import de `@/lib/mock` en `src/components/App.tsx` (faltaba en la lista de imports de la cabecera aunque se usaba en `handleRestoreDemoProjects`, `findProjectById`, `.filmstrip-row`, `producerDrops` y `Proyectos fijados`).
- Reemplazado `capacitor.config.ts` por `capacitor.config.json` y mantenido `package.json` sincronizado con `package-lock.json` para que `next build` en Vercel no intente compilar tipos de `@capacitor/cli` ni falle por diferencias de lockfile.
- Tipado limpio de `nextConfig` en `next.config.ts`.

---

### Turno 8 — Fix de Superposición de Navbar/Dynamic Island en iPhone (`IMG_3877.png` y `IMG_3878.png`) y Renovación de Cache `v3`
**Prompt del usuario:**
- *"no se ve esto"* (adjuntó `IMG_3877.png` y `IMG_3878.png` tomadas en iPhone mientras el deploy anterior estaba fallido: se veía la versión anterior y además la barra superior `.ios-navbar` en 3 filas tapaba el encabezado de `Biblioteca` / `Inicio`, y el Dynamic Island inferior tapaba el botón `+ Subir video 3–5s / GIF al bloque`).

**Implementación:**
- Compactada la fila superior de `.ios-navbar` en iPhone (`@media (max-width: 720px)`) para que `El tablero` + `@poyo` + `🎛️ Reproductor` + `🔊` entren siempre en **1 sola fila** y la píldora de 4 pestañas en la **2ª fila** (nunca en 3 filas).
- Corregido el orden de `@supports (padding-top: env(safe-area-inset-top))` en `src/app/globals.css` para que no pise el `padding-top` ni `padding-bottom` mobile (`calc(114px + env(safe-area-inset-top))` arriba y `calc(148px + env(safe-area-inset-bottom))` abajo), dejando 100% visibles los títulos superiores, el switch `Por defecto / ◫ Lado a Lado` y el botón inferior de subir video.
- Actualizadas las keys de `localStorage` a `v3` (`eltablero_clean_projects_v3`) para que el iPhone refresque automáticamente los proyectos con las 5 tapas reales y los nuevos tracks.

---

### Turno 9 — Reemplazo Total de Emojis por Formas Geométricas (SVGs) en Reproductor + Fix de Subida de Audio (WAV / MP3) en iPhone
**Prompt del usuario:**
- *"en el reproductor odio que los controladores sean emojis hace que sean formitas por dios y cuando subis un archivo desde el celular no me admite ni wav ni mp3 solo fotos y videos"*

**Implementación:**
- **Reemplazo 100% de emojis por formas geométricas vectoriales SVG:**
  - En el reproductor completo (`PerformativePlayer.tsx`), mini-player Dynamic Island (`App.tsx`) y navbar (`App.tsx`), se reemplazaron todos los emojis (`⏮`, `⏭`, `▶`/`❚❚`, `🔇`/`🔉`/`🔊`, `🔀`, `🔁`, `🎛️`, `♥`/`♡`, `📝`, etc.) por iconos SVG vectoriales minimalistas y limpios.
  - Se vinculó la tapa de álbum real (`project.coverUrl`) en el arte del Dynamic Island y del reproductor.
- **Solución definitiva para selección de WAV / MP3 en iOS / iPhone:**
  - En iOS Safari y WebViews, el atributo genérico `accept="audio/*"` dispara el sheet de `Fototeca / Tomar foto o video` o inhabilita archivos `.wav`/`.mp3` en la app `Archivos`.
  - Se reemplazó en todos los inputs (`App.tsx`, `MacInstallerUpload.tsx`, `CreateProjectScreen.tsx`, `UntitledImporter.tsx`) por extensiones explícitas y MIME types de audio sin wildcards fotográficos (`.wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff,.alac,.opus,audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/flac,application/octet-stream`).
  - En `Biblioteca` (`ManifoldLibrary3D.tsx`) se agregó un botón dedicado `+ Subir WAV / MP3 al bloque` junto al de videos, y se implementó un enrutador inteligente que detecta si el usuario seleccionó un archivo de audio en cualquier input para mandarlo automáticamente a canciones/tracks sin fallar.

---

### Turno 10 — Explicación y Guía Completa de Capacitor para Deployar en App Store
**Prompt del usuario:**
- *"explicame bien lo de capacitor porque no se como deployear en app store"*

**Implementación:**
- Guía explicada con tono directo, argentino y paso a paso para el usuario Juani (requerimientos de Apple Developer, Xcode en Mac, compilación estática de Next.js, sincronización de Capacitor con `npm run cap:sync && npm run cap:ios`, firmado con certificados de distribución, y subida a TestFlight / App Store Connect).

---

### Turno 11 — Método Gratuito: PWA ("Agregar a Inicio") y Sideloading con Personal Team
**Prompt del usuario:**
- *"y como era la forma de hacerlo gratis ? jajajaj"*

**Implementación:**
- Explicación de las 2 alternativas gratuitas (sin pagar los $99 USD anuales de Apple):
  1. **PWA Standalone (100% gratis, sin Mac y sin Apple Developer):** Desde Safari en iPhone, tocar compartir y "Agregar a pantalla de inicio". Corre en pantalla completa nativa sin marcos de navegador, con soporte offline, WebGL 3D y Web Audio. Se creó `src/app/manifest.ts` para habilitar formalmente el Web App Manifest en Next.js.
  2. **Personal Team en Xcode (gratis con cable USB):** Usar un Apple ID gratuito para instalar el build nativo de Capacitor directo en el iPhone físico por 7 días de validez por build.

---

### Turno 12 — Consulta sobre eliminar vista de bloques y dejar solo vinilos
**Prompt del usuario:**
- *"si te digo que saques la vista por bloques y dejes solo los vinilos podes hacerlo o tiene que hacerlo si o si el argon ?"*

**Implementación:**
- Confirmación al usuario de capacidad total de edición autónoma, modificación de código, compilación y push directo a producción sin requerir a Argon ni a ningún agente externo.

---

### Turno 13 — Eliminación de la Vista de Bloques 3D y Establecimiento de Vinilos como Vista Única
**Prompt del usuario:**
- *"dale deployalo"*

**Implementación:**
- **Eliminación de la escena de Bloques 3D (`ManifoldLibrary3D.tsx`):**
  - Removido el branching condicional `viewMode === "manifold"`.
  - Eliminado el selector/switch de `🧊 Bloques / 💿 Vinilos` del header.
  - La escena de **Vinilos 3D en abanico curvo (arco fijo C)** pasa a ser la vista principal y única permanente en `Biblioteca`.
  - Titulación actualizada a `MIS PROYECTOS // VINILOS 3D` con subtítulo `Arrastrá para mover · Seleccioná un vinilo`.
  - Se mantienen los controles de selección de proyectos, las tapas de vinilos reales, la extracción de disco, la interacción en modo "Por defecto" / "Lado a Lado", el botón `+` para crear proyecto, el botón `🗑️` para eliminar proyectos, y la barra inferior de subida Canvas y tracks WAV/MP3.
- En `src/components/App.tsx`, `libraryViewMode` se fijó por defecto en `"disc-row"`.---

### Turno 14 — Portadas Individuales de Tracks, Editor de Proyecto y Vinilo, Canvas Visible en Inspector y Texturas Reales en Spinner 3D
**Prompt del usuario:**
- *"voy a necesitar tambien que en la biblioteca cambies esta cagada de las imagenes que aparecen en el spinner, quiero que cada track tenga para subirle una imagen y quiero que se pueda editar el nombre y eso del proyecto lo mismo con los vinilos que tengan una imagen que le puedo poner al proyecto y un canvas que se vea porque el que esta ahora creo que no se ve xd"*

**Implementación:**
1. **Texturas de Alta Calidad con Artwork Real en el Spinner 3D (`DiscSpinner3D.tsx`):**
   - Se eliminaron las texturas rayadas procedurales generadas por canvas sintético.
   - Implementado el hook `useDiscPlateTexture(track, projectCoverUrl, index, total)` que carga de forma asíncrona la portada real del track (o la del proyecto) en un canvas offscreen de alta definición (512x512) con ranuras concéntricas de vinilo de precisión, bisel de cristal y tipografía limpia, actualizando la textura WebGL (`needsUpdate = true`) sin parpadeos ni destellos.
2. **Portadas Individuales por Track (`src/lib/mock.ts` + `App.tsx`):**
   - Agregada la propiedad opcional `coverUrl?: string;` a la interfaz `Track`.
   - En la lista de tracks del inspector (`.inspector-tracklist`), cada fila muestra ahora la miniatura de la portada (`track.coverUrl || project.coverUrl`) con fallback estético y un botón/input `🖼️ Tapa` para subir una imagen directa desde el explorador/archivos de iOS o escritorio.
   - En el modal de edición de track individual (`EditTrackModal`), se agregó el campo de portada con subida directa y previsualización en vivo.
3. **Editor de Proyecto y Portada de Vinilo (`EditProjectModal` en `App.tsx`):**
   - Se sumó el botón `✎ Editar Proyecto & Tapa` en la cabecera del inspector del proyecto.
   - Permite editar en tiempo real: Título, Artista / Colaboradores, Formato / Tipo (`Mixtape`, `EP`, `LP`, `Single`, `Beatpost`), Año, Zona, Estado (`Privado`, `Borrador`, `Publicado`), Descripción / Notas de Producción y cargar una nueva imagen de portada (`coverUrl`).
   - Al guardar, la portada se propaga inmediatamente a la funda del vinilo en 3D, al sello central del disco y a las placas del spinner.
4. **Reproductor de Canvas de Video Visible en Inspector (`App.tsx` + `globals.css`):**
---

### Turno 15 — Ajuste de Dynamic Island en iPhone, Eliminación de 0261 y Purga Total de Emojis de la UI
**Prompt del usuario:**
- *"podes correr la parte de arriba (lo que dice el tablero y eso) mas abajo? cosa de que la parte de arriba arranque justo debajo del dynamic island de mi iphone / y sacale el 0261 no me gusta / tambien sacá los emojis de la ui / como encaramos el almacenamiento de los perfiles y todo eso? quiero que ya sea una webapp funcional, quiero logearme y empezar a crear mi perfil y biblioteca, cual es el siguiente paso en el desarrollo??"*

**Implementación:**
1. **Ajuste de Dynamic Island & Safe-Area en iPhone (`globals.css`):**
   - Se ajustó la posición de `.ios-navbar` en pantallas móviles a `top: calc(max(env(safe-area-inset-top, 0px), 54px) + 8px);` para que quede despegada y comience exactamente por debajo de la Dynamic Island y notch del iPhone sin colisionar con la barra de estado de iOS.
   - Se actualizó el `padding-top` de `.apple-shell` a `calc(max(env(safe-area-inset-top, 0px), 54px) + 106px)` para que el contenido editorial y los collages arranquen con aire limpio debajo del menú sin quedar tapados.
2. **Eliminación Total de "0261":**
   - Removido el `<small>0261</small>` del header de marca `El tablero`.
   - Limpiadas las menciones residuales de `0261` en biografías y crews en `src/lib/mock.ts`.
3. **Purga Completa de Emojis en Toda la UI:**
   - Se eliminaron todos los emojis de la interfaz (`App.tsx`, `DiscSpinner3D.tsx`, `ManifoldLibrary3D.tsx`, `MacInstallerUpload.tsx`, `CreateProjectScreen.tsx`, `UntitledImporter.tsx`, `PerformativePlayer.tsx`, `mock.ts`).
   - Los emojis de tachos (`🗑️`), discos (`💿`), lápices (`✎`), cámaras, escobas, checks y llaves se reemplazaron por componentes SVG minimalistas de precisión vectorial (`TrashIcon`, `DiscIcon`, etc.) o tipografía editorial limpia.
   - En perfiles y stickers se reemplazaron los emojis por tags e iniciales en mayúsculas (`RAW`, `MIC`, `808`, `VINYL`).
4. **Propuesta de Arquitectura Backend & Storage para WebApp Funcional:**
   - Plan detallado para autenticación (Supabase Auth / Google OAuth), base de datos relacional Postgres (perfiles, proyectos, tracks, videos), y Cloudflare R2 / S3 para streaming de audio sin costo de transferencia.

---

### Turno 16 — Setup Inicial de Supabase: Instalación de SDK, Cliente y Schema SQL
**Prompt del usuario:**
- *"ya estoy aca y ahora?"* (adjunta captura del dashboard del nuevo proyecto `eltablero` en Supabase con URL `https://txhrbfgejcwmmurriccw.supabase.co`).

**Implementación:**
1. **Instalación de `@supabase/supabase-js`:**
   - Agregada la librería oficial al proyecto con `npm install @supabase/supabase-js`.
2. **Creación del Cliente Supabase (`src/lib/supabase.ts`):**
   - Configurado con fallback a la URL del proyecto del usuario (`https://txhrbfgejcwmmurriccw.supabase.co`) y lectura de variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. **Creación del Schema SQL (`supabase/schema.sql`):**
   - Definición de tablas relacionales: `profiles` (vinculada a `auth.users`), `projects`, `tracks`, `project_videos`.
   - Políticas RLS (Row Level Security) para lectura pública y mutación exclusiva por usuario autenticado.
   - Bucket de almacenamiento `el-tablero-media` para subidas de audio y portadas.
4. **Guía paso a paso al usuario:**
   - Instrucciones exactas para correr el SQL en el `SQL Editor` y copiar la `anon public key` para habilitar el backend en producción.

---

### Turno 17 — Aclaración de API Key de Supabase y Restauración de Estilización de Recuadros en el Collage
**Prompt del usuario:**
- *"tenes que cambiarle de nuevo la fuente que usaste en El tablero porque yo te habia dicho que le saques todas las modificaciones a las fuentes pero enr ealidad era solo a las letras, habias usado colores y recuadros que me habian en cantado lo unico era mezclar fuentes literalmente, la estilizacion me encantaba / cual key t paso ??"* (adjunta captura de pantalla de Supabase Settings > API Keys).

**Implementación:**
1. **Aclaración sobre la API Key:**
   - Se le indicó al usuario que copie la **`Publishable key`** (la de arriba, que arranca con `sb_publishable_...`), ya que es la clave pública y segura para el cliente del navegador con Row Level Security (RLS), a diferencia de la `Secret key` que nunca debe exponerse en el frontend.
2. **Restauración de Estilización con Recuadros y Colores (`inline-swatch`):**
   - Se recuperaron los bloques de color y recuadros editoriales de alto contraste en los nombres de los proyectos del collage (`LA PLAGA`, `PERDÓN LA DEMORA`, `chickenNugget`, `ESTO ES ESTAR EN SONIDO`, `#MA7IAS`, `Love2Hate`, `AMORIO CLUB 2`).
   - Se mantuvo la regla de **cero mezcla de fuentes**: todas las letras y palabras usan la misma tipografía unificada sin deformaciones góticas ni mezclas tipográficas, conservando exclusivamente el juego de recuadros, fondos de color vibrantes (`coral`, `cyan`, `gold`, `blue`, `lime`, `purple`, `red`) y bordes estéticos.

---

### Turno 18 — Conexión de Supabase Publishable Key, Sincronización de Auth y Proyectos en la Nube
**Prompt del usuario:**
- *"sb_publishable_UvC4vGCFOnN0FGbRAux0nw_wneVnyhC"*

**Implementación:**
1. **Configuración de Variables de Entorno (`.env.local` & `src/lib/supabase.ts`):**
   - Configurada la `NEXT_PUBLIC_SUPABASE_URL=https://txhrbfgejcwmmurriccw.supabase.co` y `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_UvC4vGCFOnN0FGbRAux0nw_wneVnyhC`.
   - Agregados fallbacks por defecto en el código cliente para que funcione tanto en local como en producción de Vercel inmediatamente.
2. **Listener de Autenticación en Tiempo Real (`App.tsx`):**
   - Integrado `supabase.auth.getSession()` y `supabase.auth.onAuthStateChange` para detectar inicios y cierres de sesión de usuarios automáticamente.
   - Sincronización del perfil de usuario y proyectos desde PostgreSQL al logearse, con persistencia y fallback automático a datos locales ante ausencia inicial de tablas.
3. **Modal de Autenticación (`GoogleAuthModal`):**
   - Botón directo de "Continuar con Google" conectado a `supabase.auth.signInWithOAuth({ provider: 'google' })`.
   - Indicador de estado en tiempo real `SUPABASE CLOUD CONECTADO // txhrbfgejcwmmurriccw`.
   - Opción de fallback para desarrollo offline y botón de desconexión / cerrar sesión seguro.

---

### Turno 19 — Instrucciones de Ejecución en SQL Editor de Supabase
**Prompt del usuario:**
- *"teng oque borrar lo que estaba antes en el sql editor ?"*

**Respuesta y Guía:**
- Se le confirmó al usuario que sí, que borre cualquier texto de ejemplo o plantilla que venga por defecto en el SQL Editor (o cree una pestaña nueva vacía con `+ New query`), pegue el contenido completo de `supabase/schema.sql` y le dé a `Run`.

---

### Turno 21 — Aclaración directa de `policy already exists` y script con DROP POLICY
**Prompt del usuario:**
- *"me tiro eso mira"* (misma captura enfatizando el error).

**Explicación y Solución:**
- Se le explicó al usuario que el script anterior ya había creado la tabla y la política la primera vez, y que Postgres chilla si intentás volver a crear una política con el mismo nombre.
- Se le pasó el script SQL definitivo que incluye `DROP POLICY IF EXISTS` para que borre y reemplace las políticas limpiamente sin quejarse.

---

### Turno 22 — Verificación de Schema Creado y Siguientes Pasos
**Prompt del usuario:**
- *"taaa success, y ahora ?"*

**Respuesta y Guía:**
- Confirmación de que las 4 tablas (`profiles`, `projects`, `tracks`, `project_videos`) y el bucket `el-tablero-media` ya existen en Supabase.
- Siguientes pasos claros:
  1. Login / Auth: probar ingresar desde el modal de Cuenta en `@poyo` o la barra superior.
  2. Sincronización automática de proyectos y subidas en la nube al crear proyectos o subir canciones.

---

### Turno 23 — Configuración de Google OAuth y Sincronización Bidireccional en Supabase
**Prompt del usuario:**
- *"vamos con google es mucho mucho mas comodo y facil y son 6 clicks mas"*

**Implementación:**
1. **Guía paso a paso de Google OAuth:**
   - Instrucciones directas de 6 pasos para obtener `Client ID` y `Client Secret` en Google Cloud Console vinculando el Callback URL de Supabase (`https://txhrbfgejcwmmurriccw.supabase.co/auth/v1/callback`).
2. **Generación de UUIDs estándar (`CreateProjectScreen.tsx`):**
   - Nuevos proyectos y tracks ahora se inicializan con `crypto.randomUUID()` para ser 100% compatibles con las columnas `uuid` de PostgreSQL.
3. **Persistencia en tiempo real (`App.tsx`):**
   - Al crear un proyecto en la Biblioteca 3D (`onCreateProject`), se inserta/actualiza en las tablas `projects` y `tracks` de Supabase si el usuario está autenticado.
   - Al borrar un proyecto o track individual (`handleDeleteProject` / `handleDeleteTrack`), se eliminan las filas correspondientes de la base de datos en la nube.

---

### Turno 24 — Vinculación del Dominio Custom `eltablero.blog` (Hostinger -> Vercel & Supabase)
**Prompt del usuario:**
- *"ahi compre el dominio eltablero.blogen hostinger"*

**Implementación y Guía:**
- Instrucciones DNS exactas para apuntar `eltablero.blog` de Hostinger a los servidores de Vercel (registro A `@ -> 76.76.21.21` y CNAME `www -> cname.vercel-dns.com`).
- Actualización de Site URL y Redirect URLs en Supabase Auth y Google Cloud Console para que el flujo de autenticación use directamente el nuevo dominio oficial.







