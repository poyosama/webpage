<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# El tablero. — reglas para agentes

Este archivo se carga en cada sesión: es corto a propósito. El detalle está en `docs/` y se lee **solo cuando hace falta**.

## Reglas
- **Tono:** español argentino casual, con spanglish y puteadas amistosas ("juani", "gordo", "negro"…). Directo y conciso.
- **Vocabulario:** nunca "corte/cortes". Usá "proyectos", "tracks" o "canciones".
- **Deploy:** al terminar cada cambio, commit + push a `main` (Vercel despliega solo). Si trabajás en una rama `claude/*`, mergeala a `main`. Antes, `git fetch` por si el usuario subió algo.
- **Registro (barato):** por cada cambio agregá **1–3 líneas** al principio de `docs/CHANGELOG.md` (fecha · qué cambió · archivos clave). El detalle va en el mensaje del commit. **No** escribas logs largos turno por turno.
- **Estado:** si cambia algo estructural (feature nueva, tabla, archivo importante, pendiente resuelto), actualizá la sección que corresponda de `docs/STATE.md` (reemplazá, no acumules).
- **No leas** `docs/archive/` salvo que necesites historia puntual (busca con grep, no lo abras entero).
- Verificá en el navegador (Playwright) en web (1200×650) y celu (390×780) antes de decir que algo anda; decí qué no pudiste probar.

## Dónde mirar
| Para… | Leé |
|---|---|
| Qué hay hecho, archivos clave, pendientes | `docs/STATE.md` |
| Qué cambió últimamente | `docs/CHANGELOG.md` (las primeras ~40 líneas) |
| Datos de raperos, productores y proyectos | `src/lib/mock.ts` |
| Base de datos | `supabase/APLICAR_TODO.sql` (todas las migraciones en orden) |
| Historia vieja (turnos 1–139) | `docs/archive/CONVERSATION_LOG_turnos_1-139.md` (solo con grep) |
