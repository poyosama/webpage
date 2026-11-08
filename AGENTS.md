<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Contexto del proyecto ("El Cerro de la Gloria" — Rediseño Apple / Editorial)
- **Tono con el usuario:** español argentino bien casual con spanglish y puteadas amistosas; llamalo "juani", "gordo", "boludo", "negro", etc. Respuestas directas y concisas.
- **Páginas del MVP (solo 4 + Reproductor):**
  1. `Inicio` (Explorar): estética editorial blanca con grano tipo Apple / `SecondStory` (`imagen3.png`) + tira horizontal de portadas arriba + cluster central con ruido visual, recortes, stickers y espina verde neón (`imagen1.jpg` / `imagen2.jpg`).
  2. `Biblioteca`: vista de proyectos en bloques arquitectónicos isométricos con etiquetas flotantes (`gif1.gif` / `manifold.art`) + vista de hileras compactas de CDs + inspector con el **Spinner 3D** (`DiscSpinner3D.tsx`, inspirado en `video.gif`) que muestra **exactamente la misma cantidad de discos que tracks tiene el proyecto**.
  3. `Subir Tema`: flujo estilo instalador `.dmg` de macOS (`MacInstallerUpload.tsx`) — subís un archivo y se convierte en un Prop físico que arrastrás al socket de tu perfil, hace zoom a la biblioteca, lo tirás sobre el módulo del proyecto y lo acomodás en la ruedita 3D de temas.
  4. `Perfil` (`@juani`): métricas del artista, catálogo de proyectos y red de colaboradores.
  5. `Reproductor` (`PerformativePlayer.tsx` + mini-player flotante tipo Dynamic Island): pensado para grabar pantalla y tirar snippets tipo Untitled Pro. Tiene 4 motores visuales 3D en tiempo real (Props 3D con físicas/colisiones estilo GMod uncanny, Partículas algorítmicas, Ferrofluido cromado y Disco acrílico), selector de 4 fuentes en vivo y botón **Modo Snippet Clean**.
- Siempre hacé commit y `git push` a `main` al terminar un cambio para que Vercel se actualice automáticamente.
