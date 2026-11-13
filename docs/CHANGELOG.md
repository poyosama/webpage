# Changelog (lo más nuevo arriba · 1–3 líneas por cambio)

- 2026-11-13 · Reproductor: carga manual del grande (sin Suspense de next/dynamic) → primera apertura 940 → 61 ms en build de prod; escena 3D se monta tras el slide; `sfx.primeAudio()` desbloquea el audio en el mismo toque (iOS) y se precargan las URLs de audio del proyecto abierto/sonando.
- 2026-11-13 · Perfiles de otros artistas: página `viewingArtist` (proyectos públicos + lanzamientos en Spotify + tracks) desde directorio, reproductor (grande y mini) y vista de proyecto; URL `eltablero.blog/@handle` (rewrite en `next.config.ts`, botón atrás del navegador). Sin cuenta abre el modo explorar.
- 2026-11-13 · "Lo último subido": tracks de ejemplo sin audio abren el álbum en Spotify (no el ruidito procedural).
- 2026-11-13 · Subidas más rápidas: la sincronización ya no cancela subidas en curso (una corrida a la vez, repite con lo último), cada archivo se sube una sola vez (`persistedUploads`), tapa/canvas/tracks en paralelo (3 a la vez). `App.tsx`, `supabase.ts`.
- 2026-11-13 · Registro: pantalla de credenciales tras Google (foto opcional, nombre, @usuario con check de disponibilidad, artista/oyente); no se importa nada de Google. `account_type` en `profiles` + RPC `handle_available` (`migration_account_type.sql`, ya sumada a `APLICAR_TODO.sql`: **hay que correrla**). (`OnboardingScreen.tsx`, `App.tsx`, `supabase.ts`)
- 2026-11-13 · Oyentes: ya no aparecen en "Artistas en El tablero"; su Perfil no muestra "Mis proyectos"/métricas; avatar vacío legible. Landing sin selector de perfil.
- 2026-11-13 · El usuario aplicó `APLICAR_TODO.sql` en Supabase; verificado por REST (tablas y RPCs responden).
- 2026-11-12 · Contexto reorganizado: `AGENTS.md` corto, `docs/STATE.md`, este changelog; log viejo y PLAN a `docs/archive/`.
- 2026-11-12 · iOS: un solo scroller en la vista del proyecto; tapa animada de Tus me gusta (`App.tsx`, `ui-refresh.css`).
- 2026-11-12 · Biblioteca celu: botones Subir track/Canva sin pisar el reproductor; Tus me gusta siempre visible.
- 2026-11-12 · Control remoto entre dispositivos (`remotePlayer.ts`) + fix de dispositivos pisándose.
- 2026-11-12 · Colaboradores/coautores (`migration_collab.sql`); pases máx. 5 con vencimiento; sesión respaldada en cookies.
- 2026-11-12 · Turnos 1–139 detallados en `docs/archive/CONVERSATION_LOG_turnos_1-139.md`.
