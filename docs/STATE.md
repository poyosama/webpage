# Estado de El tablero. (actualizar reemplazando, no acumulando)

**Qué es:** plataforma (web + PWA, iOS vía Capacitor) para que raperos y productores de la escena guarden, compartan y escuchen sus proyectos. Next.js 16 (App Router, Turbopack) + Supabase (Postgres, Auth Google, Storage, Realtime) + Vercel. Dominio: `eltablero.blog`.

## Estado del backend
- `APLICAR_TODO.sql` **aplicado completo en Supabase (2026-11-13, incluye social, account_type y privacidad)**: pases del servidor, compartir, colaboradores, borrar cuenta, me gusta sincronizados y proyectos privados por defecto (`is_public`) están activos. Si se agregan migraciones nuevas, sumarlas al final de `APLICAR_TODO.sql` (idempotente) y pedir que se vuelva a correr.
- Proyectos existentes quedaron **privados**: para que aparezcan en el Inicio de otros hay que ponerlos en Público (botón compartir).
- **Pendiente de correr:** `migration_account_type.sql` (ya al final de `APLICAR_TODO.sql`): columna `profiles.account_type` ('artista'|'oyente') y RPC `handle_available`. Sin ella el registro funciona igual (el código tiene fallback) pero el rol no se guarda en la base y los oyentes no se filtran del directorio para otros dispositivos.
- Marca de Google verificada y publicada ("El tablero"). Privacidad/Términos en `/privacidad` y `/terminos`.

## Pantallas y features
- **Registro** (`OnboardingScreen.tsx`): cuenta nueva = Google → pase gastado → pantalla de credenciales (foto opcional, nombre, @usuario con check, artista/oyente) → recién ahí se crea el perfil. No se importa nombre/foto/handle de Google. Oyentes: no salen en "Artistas en El tablero", Perfil sin "Mis proyectos".
- **Landing** (`LandingScene.tsx`): "Suscribirme" (gratis, por invitación) / "Ya estoy suscrito" / "Explorar sin suscribirme". `/invite/<código>` abre el modal con el pase puesto.
- **Modo explorar** (sin cuenta): Inicio con el tablero borroneado, 5 tracks destacados, previews de 25 s, perfiles de artista; el resto pide suscribirse.
- **Inicio:** collage del tablero. **REGLA: al tablero solo van proyectos en Público.** Lugares ligados a proyectos reales (se escuchan en la app): chickenNugget de @poyo (`BOARD_REAL`, por nombre+dueño) y jajajaqlacreo de @heyimloudd (`openRealBoardProject` por id, se oculta si no es público); el resto sigue con demos/Spotify, tira de portadas, tracks destacados, artistas, drops de productores.
- **Carpetas** (como [untitled]): de cada usuario, con CUALQUIER proyecto de su Biblioteca (propios, compartidos, guardados, Tus me gusta). Vista de tapas: arrastrar sobre otro = carpeta nueva, sobre carpeta = meter; adentro renombrar/sacar/desagrupar (mouse: mover 6 px; dedo: mantener ~0,4 s). Rueda: la carpeta es un vinilo más ("Abrir carpeta" → rueda con sus proyectos y ← volver). `libraryFolders.tsx`, tablas `project_folders` + `project_folder_items` (`migration_folders.sql`, aplicada 16/11).
- **Biblioteca** (`ManifoldLibrary3D.tsx`): rueda de vinilos (slider en celu) / tapas; primero siempre **Tus me gusta** (proyecto virtual `LIKED_PROJECT_ID`, tapa SVG animada). Vista de proyecto: lista scrolleable, portada en grande, editar track compacto, compartir.
- **Perfiles de otros:** página encima de la pantalla (`viewingArtist`), URL `/@handle`; se abre tocando un artista en Inicio, el nombre en el reproductor o en la vista del proyecto.
- **Importar** (`ImportFoldersModal.tsx` + `src/lib/importFolders.ts`): carpetas/.zip → proyectos privados (Perfil → +). **Desde [untitled]**: página `/importar-untitled` con el favorito `public/tools/untitled-import.js` (corre en untitled.stream con la sesión del usuario: `/library?_data`, `/library/project/{slug}?_data`, `/api/storage/buckets/{bucket}/objects/{path}/signedUrl`; manda los archivos por postMessage a `eltablero.blog/?import=untitled`). Solo proyectos propios o con permiso de edición. Si [untitled] cambia su API, usar el favorito de diagnóstico (`untitled-diag.js`) para ver la forma nueva.
- **Extensión** `extension/` (Chrome/Edge, MV3) para importar desde [untitled] en un toque; detalles y cómo publicarla en `docs/EXTENSION.md`. **Pendiente:** publicarla en Chrome Web Store (USD 5) y Edge Add-ons.
- **Perfil:** ruedita → Ajustes de cuenta (Google, nombre/@handle, cerrar sesión, borrar cuenta) / Cerrar sesión. "+" → crear proyecto / subir tracks. Invitar (pases).
- **Reproductor** (`PerformativePlayer.tsx`): grande deslizable hacia abajo, ♥, cola, Media Session (Control Center), autoplay del siguiente con evento `ended`, modo reproductor (solo biblioteca).
- **Control remoto entre dispositivos** (`src/lib/remotePlayer.ts`, Supabase Realtime `player:<userId>`): un dispositivo suena, los otros controlan.

## Datos / backend
- Pases: `invite_codes` (cada pase vence solo a los 14 días de creado; generar nuevos no invalida los anteriores — **pendiente correr** `migration_invites_no_revoke.sql`; admin ilimitado = `invite_admins`), lógica en `src/lib/invites.ts` con fallback local.
- Compartir: `project_shares` (token aleatorio, proyecto o track, listen/edit) + `project_members` (+ `is_coauthor` para colaboradores). RLS en `migration_sharing.sql` / `migration_collab.sql`.
- Privacidad: `projects.visibility` public/friends/private (is_public sincronizado por trigger); amigos = `is_friend_of(owner)`.
- Seguidores: `follows` (seguidor→seguido); amigos = se siguen los dos; `social_lists(user)` devuelve amigo/seguidor/seguido.
- Notificaciones (campanita en la barra, `NotificationBell.tsx`): `notifications` llenada por triggers de `track_likes`, `saved_projects` y `follows` (like/save/follow/friend); lectura vía RPC `my_notifications`. **Pendiente de correr:** `migration_notifications.sql` (al final de `APLICAR_TODO.sql`); sin ella la campanita no aparece.
- Audio: suena el MP3 192 kbps (`audio_url`). **Por ahora no se guardan los WAV originales** (`KEEP_ORIGINALS = false` en `supabase.ts`) y al convertir los WAV viejos se borra el WAV del storage: el plan gratis de Supabase está pasado de cuota (cached egress 138 %, storage 79 %, gracia hasta 15/12/2026). Si se quieren WAV: Cloudflare R2 (sin costo de tráfico) o plan Pro (USD 25). Conversión en el navegador (`mp3Encode.ts`); los WAV viejos se convierten solos desde la compu del dueño. **Pendiente de correr:** `migration_audio_original.sql`.
- Comentarios: `track_comments` (track_id = id en la base, `at_sec` opcional) + RPC `track_comments_list`; trigger avisa al dueño (notificación `comment`). UI: globito en el reproductor grande (`TrackComments.tsx`). **Pendiente de correr:** `migration_comments.sql`.
- Me gusta: `track_likes` + localStorage. Sesión: localStorage + copia en cookies (400 días) en `src/lib/supabase.ts`.

## Links de proyecto
- `/project/[id]` tiene página propia (`src/app/project/[id]/page.tsx`): misma App + vista previa para WhatsApp/Discord/iMessage (og: tapa, título, @artista; solo públicos). Sin sesión, un proyecto público se abre directo para escuchar (no pasa por la entrada). iOS no deja que un link abra la web agregada a inicio: para eso haría falta app nativa (Capacitor + Universal Links, cuenta Apple Developer + Mac). Ojo: `build:capacitor` (export estático) necesitaría `generateStaticParams` en esa ruta.

## Actividad y fila
- **Fila por contexto:** `playFromContext(ctx, entry)` en `App.tsx` guarda `playContext` ({label, items}); siguiente/anterior y el fin del track recorren esa lista (después de la cola manual). Cualquier play desde otro lado lo borra (`keepContextRef`). Hoy lo usa "Lo último subido & Rotación" de Inicio; para sumar otra lista, llamar `playFromContext` con sus tracks.
- **Actividad:** `listening_activity` (1 fila por usuario; hora y comienzo del track los pone un trigger). La app manda un latido cada 45 s y al cambiar track/play (si es control remoto, manda lo que suena en el otro dispositivo). Conectado = latido < 2 min. `friends_activity()` (amigos mutuos con `share`) → panel `FriendsActivity.tsx` (botón de personas en la barra de arriba; en compu queda abierto si lo dejaste así). `admin_users_activity()` solo para el id de @poyo → `/admin/usuarios` (link también al pie del panel de amigos).

## Modo TV
- `/tv` (`src/components/TvApp.tsx` + `src/app/tv/tv.css`): la tele NO inicia sesión. Muestra código de 6 letras + QR (`src/lib/qr.ts`) y escucha el canal `tvpair:<código>`; el celu logueado (Dispositivos → "Vincular una tele", o el QR → `/?tv=CÓDIGO`, que sobrevive al login con sessionStorage) le manda `{userId, name, handle}`. La tele lo guarda (`eltablero_tv_pair`) y se suma a `player:<userId>` con `kind: "tv"`. Como no tiene sesión, el celu le manda `media` (proyecto + links de audio, `buildTvMedia`) en `play_track`/`transfer`. Flechas mueven el foco, OK activa, teclas multimedia y MediaSession. Si el navegador bloquea el autoplay, aparece "Apretá OK para escuchar".
- **App de tele** (`android-tv/`): Activity con WebView que abre `https://www.eltablero.blog/tv` (paquete `blog.eltablero.tv`, LEANBACK_LAUNCHER + banner, sin táctil, `mediaPlaybackRequiresUserGesture=false`, KEEP_SCREEN_ON, pantalla "Sin conexión" con OK para reintentar). `build.sh` (aapt2+javac+d8+apksigner, necesita SDK con build-tools 35 + platform 35) → `public/tv.apk`. La keystore NO está en el repo (la tiene el usuario; sin ella no hay actualizaciones del mismo APK). Instalación hoy: app Downloader → `eltablero.blog/tv.apk`. Para la tienda: cuenta de Play (USD 25), subir versionCode y armar un .aab (o subir el APK firmado).

## Discord
- Avisos de lanzamientos: trigger en `projects`/`tracks` → `discord_announce_if_ready()` manda un embed (una vez por proyecto, tabla `discord_announcements`) al webhook guardado en **Vault** como `discord_webhook_url` (pg_net). Prueba: `select public.discord_test();`. `migration_discord.sql` (aplicada 16/11). Pendiente: comandos (/tablero) y previews de links.

## Archivos clave
- **Cloudflare R2** (archivos): `src/lib/r2Server.ts` (firma S3 con aws4fetch), `/api/r2/sign-upload` (subidas del navegador con URL firmada), `/api/r2/migrate` + página `/admin/r2` (copia Supabase→R2, solo admin). Variables en Vercel: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `NEXT_PUBLIC_R2_PUBLIC_URL` (= https://pub-2c3ed1e009e747ebb40aff4518db40c8.r2.dev). Sin variables, todo sigue en Supabase Storage. **Migración hecha (16/11):** 249 archivos copiados a R2; en la base 173 tracks, 28 tapas y 4 avatares apuntan a R2 (respaldo de links viejos en la tabla `r2_migration_backup`, solo admin). **Pendiente:** confirmar que todo suena desde R2 y recién ahí borrar los archivos de Supabase; pasar a dominio propio (`media.eltablero.blog`) porque `r2.dev` es para pruebas.
- `public/sw.js`: service worker (arranque rápido / sin señal). Si cambia la estrategia, subir `VERSION`.
- `src/components/App.tsx` (~7k líneas): estado global, pantallas, modales.
- Estilos: `globals.css` → `board-polish.css` → `ui-refresh.css` (overrides actuales, capas z-index documentadas) → `motion.css` (animaciones). Cambios nuevos: en `ui-refresh.css`.
- `src/lib/mock.ts`: proyectos demo (tapas en `public/covers/`, oficiales de Spotify), artistas.

## Roadmap (no codear hasta que el usuario avise)
- **Tablero con rotación diaria** cuando haya suficientes proyectos reales: ordenar por guardados, escuchas y recientes (algoritmo de sort), reemplazando el collage fijo de `BOARD_ITEMS`/demos y "Lo último subido & Rotación".
- **Proyectos fijados a mano en el tablero** por el admin (jpizarrograndinetti@gmail.com): elegir un proyecto y fijarlo (ej. tabla `board_pins` + UI solo para admin).
- **Comunidad / posts**: pestaña nueva o sección en Inicio (a definir).

## Ideas charladas, no hechas
- Fundadores: primeros 30 gratis de por vida; después plan Artista $5.000/mes o $12.500/trimestre con Mercado Pago (cobro en la web, no en App Store).
- Login de Google directo desde el dominio (Client ID ya existe).
