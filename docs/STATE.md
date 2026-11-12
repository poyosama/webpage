# Estado de El tablero. (actualizar reemplazando, no acumulando)

**Qué es:** plataforma (web + PWA, iOS vía Capacitor) para que raperos y productores de la escena guarden, compartan y escuchen sus proyectos. Next.js 16 (App Router, Turbopack) + Supabase (Postgres, Auth Google, Storage, Realtime) + Vercel. Dominio: `eltablero.blog`.

## Pendiente del usuario
- **Pegar `supabase/APLICAR_TODO.sql`** en Supabase → SQL Editor → Run (idempotente). Sin eso NO funcionan: pases de invitación del servidor, compartir proyectos/tracks, colaboradores, borrar cuenta, me gusta sincronizados. La app cae a modos locales sin romperse.
- Marca de Google verificada y publicada ("El tablero"). Privacidad/Términos en `/privacidad` y `/terminos`.

## Pantallas y features
- **Landing** (`LandingScene.tsx`): "Suscribirme" (gratis, por invitación) / "Ya estoy suscrito" / "Explorar sin suscribirme". `/invite/<código>` abre el modal con el pase puesto.
- **Modo explorar** (sin cuenta): Inicio con el tablero borroneado, 5 tracks destacados, previews de 25 s, perfiles de artista; el resto pide suscribirse.
- **Inicio:** collage del tablero (click → Spotify), tira de portadas, tracks destacados, artistas, drops de productores.
- **Biblioteca** (`ManifoldLibrary3D.tsx`): rueda de vinilos (slider en celu) / tapas; primero siempre **Tus me gusta** (proyecto virtual `LIKED_PROJECT_ID`, tapa SVG animada). Vista de proyecto: lista scrolleable, portada en grande, editar track compacto, compartir.
- **Perfil:** ruedita → Ajustes de cuenta (Google, nombre/@handle, cerrar sesión, borrar cuenta) / Cerrar sesión. "+" → crear proyecto / subir tracks. Invitar (pases).
- **Reproductor** (`PerformativePlayer.tsx`): grande deslizable hacia abajo, ♥, cola, Media Session (Control Center), autoplay del siguiente con evento `ended`, modo reproductor (solo biblioteca).
- **Control remoto entre dispositivos** (`src/lib/remotePlayer.ts`, Supabase Realtime `player:<userId>`): un dispositivo suena, los otros controlan.

## Datos / backend
- Pases: `invite_codes` (máx. 5 vigentes, vencen a los 14 días, admin ilimitado = `invite_admins`), lógica en `src/lib/invites.ts` con fallback local.
- Compartir: `project_shares` (token aleatorio, proyecto o track, listen/edit) + `project_members` (+ `is_coauthor` para colaboradores). RLS en `migration_sharing.sql` / `migration_collab.sql`.
- Me gusta: `track_likes` + localStorage. Sesión: localStorage + copia en cookies (400 días) en `src/lib/supabase.ts`.

## Archivos clave
- `src/components/App.tsx` (~7k líneas): estado global, pantallas, modales.
- Estilos: `globals.css` → `board-polish.css` → `ui-refresh.css` (overrides actuales, capas z-index documentadas) → `motion.css` (animaciones). Cambios nuevos: en `ui-refresh.css`.
- `src/lib/mock.ts`: proyectos demo (tapas en `public/covers/`, oficiales de Spotify), artistas.

## Ideas charladas, no hechas
- Fundadores: primeros 30 gratis de por vida; después plan Artista $5.000/mes o $12.500/trimestre con Mercado Pago (cobro en la web, no en App Store).
- Login de Google directo desde el dominio (Client ID ya existe).
