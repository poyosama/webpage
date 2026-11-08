<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Contexto del proyecto ("El tablero" — Estética Apple / Editorial + Entorno 3D Manifold)
- **Tono con el usuario:** español argentino bien casual con spanglish y puteadas amistosas; llamalo "juani", "gordo", "boludo", "negro", etc. Respuestas directas y concisas.
- **Nombre de la web:** `El tablero` (arriba a la izquierda en la barra y en el título display).
- **SFX (`src/lib/sfx.ts`):** micro-pulsos hápticos de baja frecuencia (4–10ms) y roce de aire casi imperceptible estilo Taptic Engine de iPhone.
- **Páginas del MVP (en orden: `Inicio · Biblioteca · Subir Tema · @juani`):**
  1. `Inicio`: 1º el ruido visual en el medio de la pantalla (el tablero de recortes, pines y artistas), 2º el nombre gigante `El tablero` con la tipografía apretada de `SecondStory`, y 3º la tira horizontal de miniportadas.
  2. `Biblioteca` (`ManifoldLibrary3D.tsx` + `DiscSpinner3D.tsx`):
     - Por default muestra el **entorno 3D real estilo `gif1.gif` (`manifold.art`)**: bloques arquitectónicos 3D en WebGL donde las caras reproducen videos/loops de 3–5s, con píldoras flotantes inclinadas y efecto *pop-out* al seleccionar un bloque.
     - Cada proyecto tiene su **carpetita de videos de 3–5s** donde el usuario puede subir sus propios `.mp4`/`.webm`/`.gif` para que se proyecten en las caras 3D del bloque.
     - Vista alternativa: **Hilera de Discos 3D** apilados en diagonal (como en el primer prototipo).
     - Inspector inferior con el **Spinner 3D (`video.gif`)** de exactamente N discos según la cantidad de tracks.
  3. `Subir Tema` (`MacInstallerUpload.tsx`): Paso 1 arrastrar Prop al perfil -> Paso 2 abre la **Biblioteca 3D (`ManifoldLibrary3D`)**, el proyecto seleccionado **popea** de la unidad y arrastrás el Prop ahí -> Paso 3 acomodás el track en la ruedita 3D (`DiscSpinner3D`).
  4. `Perfil` (`@juani`): incluye el bloque de la **Biblioteca 3D** con los videos de cada proyecto como centro de la identidad visual, modal **Editar Perfil** completo y modal **Cuenta / Iniciar con Google**.
  5. `Reproductor` (`PerformativePlayer.tsx` + Dynamic Island centrado):
     - Barra espaciadora (`Space`) pausa/reproduce globalmente.
     - Se cierra tanto clickeando arriba a la izquierda como llevando el cursor bien arriba del borde superior de la pantalla.
     - Selector desplegable de **Visual Engine** (sin selector de fuentes, fijo en `SF Display`):
       1. **Props 3D Procedurales**: siempre en gravedad `0G`, 100% macizos y con geometrías procedurales (nudos toroidales, blobs sinusoidales, estrellas extruidas, columnas helicoidales).
       2. **18K Partículas Algorítmicas**: alta resolución con sprites circulares suaves siguiendo un campo vectorial procedural (Atractor de Thomas).
       3. **Ferrofluido Moldeable**: se esculpe pasando el mouse sobre la superficie y se rota en 3D con el mouse.
       4. **Disco Acrílico 3D**: orientado de frente desde el inicio y rotable 360° con el mouse.
     - Arriba tiene link clickeable al proyecto en la Biblioteca y botón **Editar track** que abre el modal de edición de track.
- Siempre hacé commit y `git push` a `main` al terminar un cambio para que Vercel se actualice automáticamente.
