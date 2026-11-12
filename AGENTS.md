<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Contexto del proyecto ("El tablero." — Estética Apple / Editorial + Entorno 3D Manifold)
- **REGLA OBLIGATORIA DE LOG:** Con **CADA** prompt nuevo del usuario, actualizá el archivo `CONVERSATION_LOG.md` en la raíz del repositorio antes de hacer `git commit` y `git push origin main`, para que si el usuario cambia de agente o sesión quede todo el historial completo guardado en el repo.
- **Tono con el usuario:** español argentino bien casual con spanglish y puteadas amistosas; llamalo "juani", "gordo", "boludo", "negro", etc. Respuestas directas y concisas.
- **Vocabulario:** NUNCA uses la palabra `"corte"` ni `"cortes"`. Usá siempre `"proyectos"`, `"tracks"` o `"canciones"`.
- **Nombre de la web:** `El tablero.` (`@quetablero` · arriba a la izquierda en la barra y en el título display, con punto distintivo en verde esmeralda `#10b981`).
- **Raperos (`src/lib/mock.ts`):** `poyo`, `Tizianolased`, `Ma7imza`, `V4lentin0`, `eyebags`, `Máximo`, `Nvcho`, `alva musicc`, `Icylucki` (rapero y productor), `bbbrvno` (`@bbbrvno`).
- **Productores (`src/lib/mock.ts`):** `dorkke`, `Gonza2k`, `2ounces`, `bemo.wav`, `ando.flp`, `erreorocko`, `Icylucki`, `nutsvk`.
- **Proyectos principales con tapas, tracklists y Spotify links reales (`src/lib/mock.ts` + `public/covers/`):**
  - `PERDÓN LA DEMORA` (Mixtape · `Tizianolased` · 8 tracks · `/covers/perdon-la-demora.png` · Spotify: `50Qf8do6bp61BCUSABe7nw`)
  - `chickenNugget` (EP · `poyo · dorkke` · 6 tracks · `/covers/chickennugget.png` · Spotify: `06rk3Ca3uVZOXzgdNYakRm`)
  - `#MA7IAS` (LP · `Ma7imza` · 7 tracks · `/covers/ma7ias.png` · Spotify: `3fqEhGOk6yuLCKwi0i7q7S`)
  - `ESTO ES ESTAR EN SONIDO` (LP · `V4lentin0` · 9 tracks · `/covers/esto-es-estar-en-sonido.png` · Spotify: `4AgV3jniMStGnN7qgiZM6C`)
  - `Love2Hate` (EP · `Icylucki` · 3 tracks · `/covers/love2hate.png` · Spotify: `13LVOkh1JCitO7Ah7mxUQw`)
  - `LA PLAGA` (Mixtape · `eyebags` · 6 tracks · `/covers/la-plaga.png` · Spotify: `5MGalKt6rRgZB5tCx46jDO`)
  - `AMORIO CLUB` (EP · `Máximo` · 4 tracks · `/covers/amorio-club.png`)
  - `blablabla` (EP · `bbbrvno` · 4 tracks · `/covers/blablabla.png` · Spotify: `2qQsmIu0Y54qI0FgjPSFSD`)
- **Páginas del MVP (en orden en la píldora superior: `Inicio · Subir · Biblioteca · @poyo`):**
  - **Top Navbar Pill (`.ios-navbar`):** Píldora ultra compacta de 42px de alto (`top: 10px`, padding `5px 14px`, botones de 28px). Modos adaptativos: Oyente (`Inicio · Guardados · @perfil`) y Artista (`Inicio · Subir · Biblioteca · @perfil` o `Iniciar sesión`). Separación de `margin-top: 14px !important;` en `.project-inspector-sheet`, `.profile-page` y `.cp-page` para garantizar que la navbar nunca tape encabezados.
  1. `Inicio`:
     - 1º el ruido visual en el medio de la pantalla (collage editorial con fuente unificada sin deformar letras, miniaturas de las tapas reales y sin etiquetas cruzadas), 2º el nombre gigante `El tablero.` con `"Tus proyectos. Tu identidad. Tu gente. Tu música."`, y 3º la tira horizontal de miniportadas con las tapas reales sin scrollbar fantasma. Click en proyectos o artistas abre sus vistas respectivas.
     - Grilla superior con `Proyectos fijados` (`PROYECTOS // ROTACIÓN DE EL TABLERO.`) y `Artistas en El Tablero` (`ARTISTAS // ROTACIÓN DE EL TABLERO.`), y sección inferior `Rotación de Productores` (`dorkke`, `Gonza2k`, `2ounces`, `bemo.wav`, `ando.flp`, `erreorocko`, `Icylucki`, `nutsvk`).
     - Proyectos privados nunca exponen sus canciones en Inicio ni en perfiles de otros usuarios.
  2. `Subir` (`MacInstallerUpload.tsx`): Subida batch de archivos WAV/MP3 -> Mazo de vinilitos swipeables con BPM, Key y productor opcional -> Gesto Swipe-Up para instalar en el proyecto seleccionado. Soporta `0 proyectos` y acceso directo a `+ Crear Proyecto`.
  3. `Biblioteca` (`ManifoldLibrary3D.tsx`):
     - Switch entre 2 modos de display (`Por defecto` inmersivo con vóxeles / `◫ Lado a Lado`).
     - Switch interno `🧊 Bloques` (cubos con Canvas 3D y 16.000 partículas) / `💿 Vinilos` (abanico curvo fijo en arco C). Si hay `0 proyectos`, hay `0 cubos`.
     - Botón `+` que navega a `Crear Proyecto` (`CreateProjectScreen.tsx`).
     - Botones de basurita (`🗑️`) para eliminar proyectos enteros o canciones individuales.
  4. `Inspector de Proyecto` (`App.tsx` + `board-polish.css`):
     - Render de Estudio HD de la portada del proyecto con vinilo 3D realista que gira al sonar el tema.
     - Flex derecho compacto con título, badges de estado, botón integrado `← Volver a mis proyectos` y lista de tracks optimizada (40px/fila) para visualización inmediata sin scroll innecesario.
     - Canvas de fondo autoajustable a la resolución real del video/GIF (`width: fit-content`), sin barras negras.
  5. `Crear Proyecto` (`CreateProjectScreen.tsx` + `create-project.css`):
     - Enjambre 3D de 28.000 partículas sentientes que modelan en tiempo real el texto tipeado.
     - Tarjeta compacta con `justify-content: flex-start`, botón `← Volver` integrado en el header (`.cp-inline-back-pill`), inputs limpios, selector de artwork, tracks y canvas, con autodetección Single/EP/LP.
  6. `Perfil` (`@poyo`):
     - Importador directo desde `[untitled]` (`UntitledImporter.tsx` + `/api/import-untitled`).
     - Showcase de `Mis Proyectos & Canvas`, invitaciones exclusivas (3 pases cada 2 semanas), modales **Editar Perfil** y **Cuenta / Google Sign-In** con handle único en PostgreSQL.
  7. `Reproductor` (`PerformativePlayer.tsx` + Dynamic Island centrado):
     - Dynamic Island con scrubber integrado, controles Play/Skip 100% centrados, título, artista, botón de Spotify y slider de volumen.
     - 36.000 partículas algorítmicas que laten reactivas a frecuencias sub-graves de 808 (`30Hz–115Hz`).
- **Persistencia y Seguridad:** Persistencia completa en Supabase Storage y PostgreSQL con fallback automático Base64 data URLs si el bucket está pendiente. Rewrites SPA en Next.js para `/library`, `/upload`, `/profile`, `/create` y `/project/:id`. Pantalla 404 personalizada con enjambre Three.js de `?`.
- **App Nativa iOS (Capacitor):** Configurada en `capacitor.config.ts` (`com.quetablero.app`), `next.config.ts` (`CAPACITOR_BUILD=true`) y `package.json` (`npm run cap:sync && npm run cap:ios`).
- Siempre hacé commit y `git push` a `main` al terminar un cambio para que Vercel se actualice automáticamente.

