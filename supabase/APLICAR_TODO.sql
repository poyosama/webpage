-- =========================================================================
-- EL TABLERO // APLICAR TODO (pegar entero en Supabase > SQL Editor > Run)
-- Junta, en orden: migration_visibility, migration_invites, migration_sharing, migration_account, migration_likes, migration_collab, migration_social, migration_profiles, migration_privacy, migration_notifications, migration_invites_no_revoke, migration_audio_original, migration_comments, migration_folders, migration_discord.
-- Es idempotente: se puede correr más de una vez.
-- =========================================================================

-- >>>>>>>>>> migration_visibility.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: proyectos privados / públicos + guardados
-- Correr UNA vez en Supabase > SQL Editor. Es idempotente.
-- =========================================================================

alter table public.projects add column if not exists is_public boolean not null default false;

-- Un proyecto nace privado; el dueño lo puede publicar para toda la plataforma.
drop policy if exists "Proyectos visibles por todos" on public.projects;
drop policy if exists "Proyectos publicos o propios" on public.projects;
create policy "Proyectos publicos o propios" on public.projects
  for select using (is_public = true or auth.uid() = user_id);

drop policy if exists "Tracks visibles por todos" on public.tracks;
drop policy if exists "Tracks de proyectos visibles" on public.tracks;
create policy "Tracks de proyectos visibles" on public.tracks
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = tracks.project_id and (p.is_public = true or p.user_id = auth.uid())
    )
  );

drop policy if exists "Videos visibles por todos" on public.project_videos;
drop policy if exists "Videos de proyectos visibles" on public.project_videos;
create policy "Videos de proyectos visibles" on public.project_videos
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_videos.project_id and (p.is_public = true or p.user_id = auth.uid())
    )
  );

-- Guardados (bookmarks) por usuario
create table if not exists public.saved_projects (
  user_id uuid references auth.users on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (user_id, project_id)
);
alter table public.saved_projects enable row level security;
drop policy if exists "Guardados propios" on public.saved_projects;
create policy "Guardados propios" on public.saved_projects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Perfiles nuevos: sin datos de relleno
alter table public.profiles alter column stickers set default array[]::text[];
alter table public.profiles alter column crew set default '';
alter table public.profiles alter column role set default 'Artista';

-- Storage: lectura pública, subida solo para usuarios logueados
insert into storage.buckets (id, name, public) values ('el-tablero-media', 'el-tablero-media', true)
on conflict (id) do update set public = true;

-- >>>>>>>>>> migration_invites.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: pases de invitación del lado del servidor
-- Correr UNA vez en Supabase > SQL Editor. Es idempotente (se puede re-correr).
--
-- Qué hace:
--  1. Tabla public.invite_codes: los pases viven en el servidor (no en el navegador).
--     Nadie puede insertar/editar pases directo: solo vía las funciones de abajo.
--  2. public.invite_admins: emails con pases ILIMITADOS (solo jpizarrograndinetti@gmail.com).
--     La tabla no tiene policies → no se puede leer ni editar desde la app.
--  3. Funciones (security definer):
--       invite_is_unlimited()          → ¿la cuenta logueada es admin?
--       create_invite_codes(p_count)   → genera pases (3 cada 14 días; admin: hasta 20 por vez, sin límite)
--       validate_invite_code(p_code)   → ¿existe y está sin usar? (pública, para el link /invite/…)
--       consume_invite_code(p_code)    → lo gasta para la cuenta logueada (un solo uso)
--       invite_can_create_profile()    → admin, cuenta previa a esta migración, o con pase gastado
--  4. Traba de registro: policy RESTRICTIVA de INSERT en profiles → una cuenta nueva
--     no puede crear su perfil si no gastó un pase. Las cuentas que ya existían quedan habilitadas.
--  5. Importa los pases viejos guardados en profiles.invite_codes (si la columna existe) y
--     la vacía, porque esa columna era legible por cualquiera.
-- =========================================================================

-- 1. Tabla de pases ------------------------------------------------------
create table if not exists public.invite_codes (
  code text primary key check (code = lower(code)),
  creator_id uuid references auth.users(id) on delete set null,
  creator_handle text,
  creator_name text,
  created_at timestamptz not null default now(),
  used boolean not null default false,
  used_by uuid references auth.users(id) on delete set null,
  used_by_handle text,
  used_at timestamptz
);
-- Vencimiento (14 días) y reemplazo al generar una tanda nueva
alter table public.invite_codes add column if not exists expires_at timestamptz;
alter table public.invite_codes add column if not exists revoked boolean not null default false;
update public.invite_codes set expires_at = created_at + interval '14 days' where expires_at is null;
alter table public.invite_codes alter column expires_at set default (now() + interval '14 days');

create index if not exists invite_codes_creator_idx on public.invite_codes (creator_id, created_at desc);
create index if not exists invite_codes_used_by_idx on public.invite_codes (used_by);

alter table public.invite_codes enable row level security;
drop policy if exists "Ver mis pases" on public.invite_codes;
create policy "Ver mis pases" on public.invite_codes
  for select using (auth.uid() = creator_id);
-- (sin policies de insert/update/delete: solo las funciones security definer escriben)

-- 2. Admins con pases ilimitados -----------------------------------------
create table if not exists public.invite_admins (
  email text primary key check (email = lower(email))
);
alter table public.invite_admins enable row level security;
insert into public.invite_admins (email) values ('jpizarrograndinetti@gmail.com')
  on conflict do nothing;

-- Fecha de corte: cuentas creadas antes de correr esta migración quedan habilitadas.
create table if not exists public.invite_settings (
  id int primary key default 1 check (id = 1),
  grandfather_before timestamptz not null default now()
);
alter table public.invite_settings enable row level security;
insert into public.invite_settings (id) values (1) on conflict do nothing;

-- 3. Funciones ------------------------------------------------------------
create or replace function public.invite_is_unlimited()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    join public.invite_admins a on a.email = lower(u.email)
    where u.id = auth.uid()
  );
$$;

create or replace function public.invite_new_slug()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  chars constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  slug text := 'board-';
  i int;
begin
  for i in 1..6 loop
    slug := slug || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return slug;
end;
$$;

create or replace function public.create_invite_codes(p_count int default 3)
returns setof public.invite_codes
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  unlimited boolean := public.invite_is_unlimited();
  n int;
  latest timestamptz;
  v_handle text;
  v_name text;
  v_code text;
  i int;
begin
  if uid is null then
    raise exception 'Tenés que iniciar sesión' using errcode = '28000';
  end if;

  if unlimited then
    n := 5; -- tanda de 5 (la lista nunca pasa de 5)
  else
    select max(created_at) into latest from public.invite_codes where creator_id = uid;
    if latest is not null and latest > now() - interval '14 days' then
      raise exception 'Todavía no se recargaron tus pases (cada 14 días)' using errcode = 'P0001';
    end if;
    n := 3;
  end if;

  select p.handle, p.name into v_handle, v_name from public.profiles p where p.id = uid;

  -- La tanda nueva reemplaza a la anterior: los pases sin usar quedan inválidos
  update public.invite_codes set revoked = true
   where creator_id = uid and used = false and revoked = false;

  for i in 1..n loop
    loop
      v_code := public.invite_new_slug();
      begin
        insert into public.invite_codes (code, creator_id, creator_handle, creator_name, expires_at)
        values (v_code, uid, v_handle, v_name, now() + interval '14 days');
        exit;
      exception when unique_violation then
        -- colisión (muy improbable): probar otro código
      end;
    end loop;
  end loop;

  return query
    select * from public.invite_codes
     where creator_id = uid and used = false and revoked = false and expires_at > now()
     order by created_at desc, code
     limit 5;
end;
$$;

create or replace function public.validate_invite_code(p_code text)
returns table (valid boolean, creator_handle text, creator_name text, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.invite_codes;
begin
  select * into r from public.invite_codes where code = lower(trim(p_code));
  if not found then
    return query select false, null::text, null::text, 'Ese código no existe. Revisá que esté bien escrito (board-xxxxxx).'::text;
  elsif r.used then
    return query select false, r.creator_handle, r.creator_name,
      ('Este pase ya se usó' || coalesce(' (lo usó ' || r.used_by_handle || ')', '') || '. Pedile uno nuevo a quien te invitó.')::text;
  elsif r.revoked then
    return query select false, r.creator_handle, r.creator_name,
      'Este pase ya no sirve: quien te invitó generó pases nuevos. Pedile uno nuevo.'::text;
  elsif r.expires_at <= now() then
    return query select false, r.creator_handle, r.creator_name,
      ('Este pase venció el ' || to_char(r.expires_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM') || ' (duran 14 días). Pedile uno nuevo.')::text;
  else
    return query select true, r.creator_handle, r.creator_name, null::text;
  end if;
end;
$$;

create or replace function public.consume_invite_code(p_code text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_handle text;
begin
  if uid is null then
    return false;
  end if;
  -- ya tiene uno gastado: listo
  if exists (select 1 from public.invite_codes where used_by = uid) then
    return true;
  end if;
  select handle into v_handle from public.profiles where id = uid;
  update public.invite_codes
     set used = true, used_by = uid, used_by_handle = v_handle, used_at = now()
   where code = lower(trim(p_code))
     and used = false
     and revoked = false
     and expires_at > now()
     and creator_id is distinct from uid;
  return found;
end;
$$;

create or replace function public.invite_can_create_profile()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null and (
    public.invite_is_unlimited()
    or exists (select 1 from public.invite_codes where used_by = auth.uid())
    or exists (
      select 1 from auth.users u, public.invite_settings s
      where u.id = auth.uid() and u.created_at < s.grandfather_before
    )
  );
$$;

revoke all on function public.invite_is_unlimited() from public;
revoke all on function public.invite_new_slug() from public;
revoke all on function public.create_invite_codes(int) from public;
revoke all on function public.validate_invite_code(text) from public;
revoke all on function public.consume_invite_code(text) from public;
revoke all on function public.invite_can_create_profile() from public;
grant execute on function public.invite_is_unlimited() to authenticated;
grant execute on function public.create_invite_codes(int) to authenticated;
grant execute on function public.validate_invite_code(text) to anon, authenticated;
grant execute on function public.consume_invite_code(text) to authenticated;
grant execute on function public.invite_can_create_profile() to authenticated;

-- 4. Traba de registro ---------------------------------------------------
-- Restrictiva: se suma (AND) a la policy existente "Usuarios editan su propio perfil".
-- Aplica a INSERT (incluye el insert de un upsert). Updates de perfiles existentes no se tocan.
drop policy if exists "Perfil nuevo solo con invitacion" on public.profiles;
create policy "Perfil nuevo solo con invitacion" on public.profiles
  as restrictive
  for insert
  with check (public.invite_can_create_profile());

-- Cuando se crea el perfil (después de gastar el pase) se completa el handle en el pase gastado
create or replace function public.invite_fill_used_handle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invite_codes
     set used_by_handle = new.handle
   where used_by = new.id and used_by_handle is null;
  return new;
end;
$$;
drop trigger if exists invite_fill_used_handle on public.profiles;
create trigger invite_fill_used_handle
  after insert on public.profiles
  for each row execute function public.invite_fill_used_handle();

-- 5. Importar pases viejos de profiles.invite_codes ----------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'invite_codes'
  ) then
    insert into public.invite_codes (code, creator_id, creator_handle, creator_name, created_at, used, used_by_handle, used_at)
    select
      lower(trim(e->>'code')),
      p.id,
      coalesce(e->>'creatorHandle', p.handle),
      coalesce(e->>'creatorName', p.name),
      coalesce(nullif(e->>'createdAt', '')::timestamptz, now()),
      coalesce((e->>'used')::boolean, false),
      e->>'usedByHandle',
      nullif(e->>'usedAt', '')::timestamptz
    from public.profiles p,
         lateral jsonb_array_elements(
           case when jsonb_typeof(to_jsonb(p.invite_codes)) = 'array' then to_jsonb(p.invite_codes) else '[]'::jsonb end
         ) e
    where coalesce(e->>'code', '') ~ '^board-[a-z0-9]{4,10}$'
    on conflict (code) do nothing;

    -- La columna vieja era legible por cualquiera (policy de select = true): se vacía.
    execute 'update public.profiles set invite_codes = null where invite_codes is not null';
  end if;
end;
$$;

-- >>>>>>>>>> migration_sharing.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: compartir proyectos y tracks (solo escuchar / editar)
-- Correr UNA vez en Supabase > SQL Editor, DESPUÉS de schema.sql y migration_visibility.sql.
-- Es idempotente (se puede re-correr).
--
-- Reemplaza el sistema viejo de links (hash calculable desde el navegador, no revocable,
-- y que la base de datos ignoraba) por:
--  1. public.project_shares: links con token ALEATORIO para un proyecto entero o UN track,
--     con rol 'listen' (solo escuchar) o 'edit' (editar). Revocables.
--  2. public.project_members: quién abrió cada link (queda como miembro del proyecto o del track).
--  3. RLS: los miembros ven/editan exactamente lo compartido:
--       - miembro de proyecto 'listen' → ve el proyecto y todos sus tracks (aunque sea privado)
--       - miembro de proyecto 'edit'   → además edita el proyecto, sus tracks y canvas
--       - miembro de track 'listen'    → ve el proyecto (tapa/título) y SOLO ese track
--       - miembro de track 'edit'      → además edita SOLO ese track
--     El dueño y la visibilidad pública no cambian; un editor nunca puede cambiar el dueño.
--  4. RPCs: create_project_share, redeem_project_share, get_project_share (sin login, para
--     escuchar), revoke_project_share.
-- =========================================================================

-- 1. Tablas ----------------------------------------------------------------
create table if not exists public.project_shares (
  token text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  track_id uuid references public.tracks(id) on delete cascade,
  role text not null check (role in ('listen', 'edit')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked boolean not null default false
);
create index if not exists project_shares_project_idx on public.project_shares (project_id);

create table if not exists public.project_members (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  track_id uuid references public.tracks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('listen', 'edit')),
  created_at timestamptz not null default now()
);
create unique index if not exists project_members_unique
  on public.project_members (project_id, coalesce(track_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id);
create index if not exists project_members_user_idx on public.project_members (user_id);

alter table public.project_shares enable row level security;
alter table public.project_members enable row level security;

-- 2. Helpers (security definer: leen sin pasar por RLS, así no hay recursión) ----
create or replace function public.share_project_role(p_project uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.projects p where p.id = p_project and p.user_id = auth.uid()) then 'owner'
    when exists (select 1 from public.project_members m
                 where m.project_id = p_project and m.track_id is null and m.user_id = auth.uid() and m.role = 'edit') then 'edit'
    when exists (select 1 from public.project_members m
                 where m.project_id = p_project and m.track_id is null and m.user_id = auth.uid()) then 'listen'
    else null
  end;
$$;

create or replace function public.share_track_role(p_track uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.share_project_role(t.project_id) from public.tracks t where t.id = p_track),
    (select case when bool_or(m.role = 'edit') then 'edit' else 'listen' end
       from public.project_members m
      where m.track_id = p_track and m.user_id = auth.uid()
     having count(*) > 0)
  );
$$;

create or replace function public.share_can_view_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.share_project_role(p_project) is not null
      or exists (select 1 from public.project_members m
                 where m.project_id = p_project and m.user_id = auth.uid());
$$;

-- 3. RLS (se SUMAN a las policies existentes; las policies permisivas se combinan con OR) --
-- Proyectos
drop policy if exists "Proyectos compartidos visibles" on public.projects;
create policy "Proyectos compartidos visibles" on public.projects
  for select using (public.share_can_view_project(id));

drop policy if exists "Editores de proyecto editan" on public.projects;
create policy "Editores de proyecto editan" on public.projects
  for update using (public.share_project_role(id) = 'edit')
  with check (public.share_project_role(id) = 'edit');

-- (upsert = insert ... on conflict: Postgres valida la policy de INSERT aunque la fila exista)
drop policy if exists "Editores de proyecto upsert" on public.projects;
create policy "Editores de proyecto upsert" on public.projects
  for insert with check (public.share_project_role(id) = 'edit');

-- Un editor nunca cambia el dueño ni la visibilidad
create or replace function public.share_guard_project_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and old.user_id is distinct from auth.uid() then
    new.user_id := old.user_id;
    new.is_public := old.is_public;
  end if;
  return new;
end;
$$;
drop trigger if exists share_guard_project_owner on public.projects;
create trigger share_guard_project_owner
  before update on public.projects
  for each row execute function public.share_guard_project_owner();

-- Tracks
drop policy if exists "Tracks compartidos visibles" on public.tracks;
create policy "Tracks compartidos visibles" on public.tracks
  for select using (public.share_track_role(id) is not null);

drop policy if exists "Editores de proyecto gestionan tracks" on public.tracks;
create policy "Editores de proyecto gestionan tracks" on public.tracks
  for all using (public.share_project_role(project_id) = 'edit')
  with check (public.share_project_role(project_id) = 'edit');

drop policy if exists "Editores de track editan su track" on public.tracks;
create policy "Editores de track editan su track" on public.tracks
  for update using (public.share_track_role(id) = 'edit')
  with check (public.share_track_role(id) = 'edit');

drop policy if exists "Editores de track upsert" on public.tracks;
create policy "Editores de track upsert" on public.tracks
  for insert with check (public.share_track_role(id) = 'edit');

-- Un editor de track no lo puede mover a otro proyecto
create or replace function public.share_guard_track_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is distinct from old.project_id
     and public.share_project_role(old.project_id) is distinct from 'owner'
     and public.share_project_role(old.project_id) is distinct from 'edit' then
    raise exception 'No podés mover este track a otro proyecto';
  end if;
  return new;
end;
$$;
drop trigger if exists share_guard_track_project on public.tracks;
create trigger share_guard_track_project
  before update on public.tracks
  for each row execute function public.share_guard_track_project();

-- Canvas
drop policy if exists "Videos compartidos visibles" on public.project_videos;
create policy "Videos compartidos visibles" on public.project_videos
  for select using (public.share_can_view_project(project_id));

drop policy if exists "Editores de proyecto gestionan videos" on public.project_videos;
create policy "Editores de proyecto gestionan videos" on public.project_videos
  for all using (public.share_project_role(project_id) = 'edit')
  with check (public.share_project_role(project_id) = 'edit');

-- Links y miembros: el dueño ve los links de sus proyectos; cada uno ve sus membresías
drop policy if exists "Dueño ve sus links" on public.project_shares;
create policy "Dueño ve sus links" on public.project_shares
  for select using (public.share_project_role(project_id) = 'owner');

drop policy if exists "Ver mis membresias" on public.project_members;
create policy "Ver mis membresias" on public.project_members
  for select using (user_id = auth.uid() or public.share_project_role(project_id) = 'owner');

drop policy if exists "Dueño saca miembros" on public.project_members;
create policy "Dueño saca miembros" on public.project_members
  for delete using (public.share_project_role(project_id) = 'owner' or user_id = auth.uid());

-- 4. RPCs -----------------------------------------------------------------
create or replace function public.create_project_share(p_project uuid, p_track uuid default null, p_role text default 'listen')
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  my_role text := public.share_project_role(p_project);
  v_token text;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if p_role not in ('listen', 'edit') then raise exception 'Rol inválido'; end if;
  -- dueño: cualquier link · editor del proyecto: solo links de escucha
  if my_role is distinct from 'owner' and not (my_role = 'edit' and p_role = 'listen') then
    raise exception 'No podés compartir este proyecto con ese permiso';
  end if;
  if p_track is not null and not exists (select 1 from public.tracks where id = p_track and project_id = p_project) then
    raise exception 'Ese track no es de este proyecto';
  end if;

  -- mismo link estable si ya existía uno igual sin revocar
  select token into v_token from public.project_shares
   where project_id = p_project
     and track_id is not distinct from p_track
     and role = p_role
     and created_by = auth.uid()
     and revoked = false
   limit 1;
  if v_token is not null then return v_token; end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.project_shares (token, project_id, track_id, role, created_by)
  values (v_token, p_project, p_track, p_role, auth.uid());
  return v_token;
end;
$$;

create or replace function public.redeem_project_share(p_token text)
returns table (project_id uuid, track_id uuid, role text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  s public.project_shares;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  select * into s from public.project_shares where token = p_token and revoked = false;
  if not found then raise exception 'Link inválido o revocado'; end if;

  -- el dueño no se agrega a sí mismo
  if public.share_project_role(s.project_id) = 'owner' then
    return query select s.project_id, s.track_id, 'edit'::text;
    return;
  end if;

  insert into public.project_members (project_id, track_id, user_id, role)
  values (s.project_id, s.track_id, auth.uid(), s.role)
  on conflict (project_id, coalesce(track_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id)
  do update set role = case when public.project_members.role = 'edit' or excluded.role = 'edit' then 'edit' else 'listen' end;

  return query select s.project_id, s.track_id, s.role;
end;
$$;

-- Para escuchar un link SIN iniciar sesión: devuelve el proyecto con los tracks permitidos
create or replace function public.get_project_share(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.project_shares;
  result jsonb;
begin
  select * into s from public.project_shares where token = p_token and revoked = false;
  if not found then return null; end if;

  select to_jsonb(p) || jsonb_build_object(
           'share_role', s.role,
           'share_track_id', s.track_id,
           'tracks', coalesce((
             select jsonb_agg(to_jsonb(t) order by t.order_index)
               from public.tracks t
              where t.project_id = p.id and (s.track_id is null or t.id = s.track_id)
           ), '[]'::jsonb),
           'project_videos', coalesce((
             select jsonb_agg(to_jsonb(v)) from public.project_videos v where v.project_id = p.id
           ), '[]'::jsonb)
         )
    into result
    from public.projects p
   where p.id = s.project_id;
  return result;
end;
$$;

create or replace function public.revoke_project_share(p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.project_shares set revoked = true
   where token = p_token and public.share_project_role(project_id) = 'owner';
  return found;
end;
$$;

revoke all on function public.share_project_role(uuid) from public;
revoke all on function public.share_track_role(uuid) from public;
revoke all on function public.share_can_view_project(uuid) from public;
revoke all on function public.create_project_share(uuid, uuid, text) from public;
revoke all on function public.redeem_project_share(text) from public;
revoke all on function public.get_project_share(text) from public;
revoke all on function public.revoke_project_share(text) from public;
grant execute on function public.share_project_role(uuid) to anon, authenticated;
grant execute on function public.share_track_role(uuid) to anon, authenticated;
grant execute on function public.share_can_view_project(uuid) to anon, authenticated;
grant execute on function public.create_project_share(uuid, uuid, text) to authenticated;
grant execute on function public.redeem_project_share(text) to authenticated;
grant execute on function public.get_project_share(text) to anon, authenticated;
grant execute on function public.revoke_project_share(text) to authenticated;

-- >>>>>>>>>> migration_account.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: borrar mi cuenta (Ajustes de cuenta → Borrar cuenta)
-- Correr UNA vez en Supabase > SQL Editor. Es idempotente.
-- Borra el usuario de auth.users; por cascada se van su perfil, sus proyectos,
-- tracks, canvas, guardados y membresías. Solo puede borrarse a sí mismo.
-- =========================================================================
create or replace function public.delete_my_account()
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Tenés que iniciar sesión';
  end if;
  delete from public.projects where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
  return true;
end;
$$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- >>>>>>>>>> migration_likes.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: me gusta sincronizados entre dispositivos
-- Correr en Supabase > SQL Editor. Es idempotente.
-- =========================================================================
create table if not exists public.track_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
create index if not exists track_likes_user_idx on public.track_likes (user_id, created_at);

alter table public.track_likes enable row level security;
drop policy if exists "Mis me gusta" on public.track_likes;
create policy "Mis me gusta" on public.track_likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, delete on public.track_likes to authenticated;

-- >>>>>>>>>> migration_collab.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: colaboradores (proyectos en conjunto)
-- Requiere migration_sharing.sql (tabla project_members). Idempotente.
-- El dueño invita a otro usuario por @handle:
--   'edit' + coautor  → el proyecto es de los dos: aparece en los dos perfiles y
--                       su nombre se suma al del proyecto (poyo · dorkke)
--   'edit'            → colaborador que puede editar (subir, ordenar, editar tracks)
--   'listen'          → solo escuchar y descargar
-- =========================================================================
alter table public.project_members add column if not exists is_coauthor boolean not null default false;
alter table public.project_members add column if not exists added_by uuid references auth.users(id) on delete set null;

-- Los coautores de proyectos públicos los puede ver cualquiera (para mostrar "poyo · dorkke")
drop policy if exists "Coautores de proyectos públicos visibles" on public.project_members;
create policy "Coautores de proyectos públicos visibles" on public.project_members
  for select using (
    is_coauthor and exists (select 1 from public.projects p where p.id = project_id and p.is_public)
  );
-- Los miembros de un proyecto ven quiénes más están
drop policy if exists "Miembros ven al resto" on public.project_members;
create policy "Miembros ven al resto" on public.project_members
  for select using (public.share_can_view_project(project_id) and track_id is null);

create or replace function public.add_project_collaborator(
  p_project uuid, p_handle text, p_role text default 'edit', p_coauthor boolean default true
)
returns table (user_id uuid, handle text, name text, role text, is_coauthor boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid;
  v_handle text := '@' || regexp_replace(lower(trim(coalesce(p_handle, ''))), '^@+', '');
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if public.share_project_role(p_project) is distinct from 'owner' then
    raise exception 'Solo el dueño del proyecto puede sumar colaboradores';
  end if;
  if p_role not in ('listen', 'edit') then raise exception 'Permiso inválido'; end if;
  select id into v_uid from public.profiles where lower(profiles.handle) = v_handle;
  if v_uid is null then raise exception 'No existe ningún usuario %', v_handle; end if;
  if v_uid = auth.uid() then raise exception 'Ya sos el dueño de este proyecto'; end if;

  insert into public.project_members (project_id, track_id, user_id, role, is_coauthor, added_by)
  values (p_project, null, v_uid, p_role, coalesce(p_coauthor, false) and p_role = 'edit', auth.uid())
  on conflict (project_id, coalesce(track_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id)
  do update set role = excluded.role, is_coauthor = excluded.is_coauthor, added_by = excluded.added_by;

  return query
    select pr.id, pr.handle, pr.name, m.role, m.is_coauthor
      from public.project_members m join public.profiles pr on pr.id = m.user_id
     where m.project_id = p_project and m.user_id = v_uid and m.track_id is null;
end;
$$;

create or replace function public.list_project_collaborators(p_project uuid)
returns table (user_id uuid, handle text, name text, avatar_url text, role text, is_coauthor boolean)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.handle, pr.name, pr.avatar_url, m.role, m.is_coauthor
    from public.project_members m
    join public.profiles pr on pr.id = m.user_id
   where m.project_id = p_project
     and m.track_id is null
     and (
       public.share_can_view_project(p_project)
       or (m.is_coauthor and exists (select 1 from public.projects p where p.id = p_project and p.is_public))
     )
   order by m.is_coauthor desc, m.created_at;
$$;

create or replace function public.remove_project_collaborator(p_project uuid, p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.share_project_role(p_project) is distinct from 'owner' and p_user is distinct from auth.uid() then
    raise exception 'Solo el dueño puede sacar colaboradores';
  end if;
  delete from public.project_members where project_id = p_project and user_id = p_user and track_id is null;
  return found;
end;
$$;

-- Coautores de varios proyectos de una (para armar "poyo · dorkke" en listas)
create or replace function public.coauthors_for_projects(p_projects uuid[])
returns table (project_id uuid, handle text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select m.project_id, pr.handle, pr.name
    from public.project_members m
    join public.profiles pr on pr.id = m.user_id
   where m.project_id = any(p_projects)
     and m.track_id is null
     and m.is_coauthor
     and (
       public.share_can_view_project(m.project_id)
       or exists (select 1 from public.projects p where p.id = m.project_id and p.is_public)
     );
$$;

revoke all on function public.add_project_collaborator(uuid, text, text, boolean) from public;
revoke all on function public.list_project_collaborators(uuid) from public;
revoke all on function public.remove_project_collaborator(uuid, uuid) from public;
revoke all on function public.coauthors_for_projects(uuid[]) from public;
grant execute on function public.add_project_collaborator(uuid, text, text, boolean) to authenticated;
grant execute on function public.list_project_collaborators(uuid) to anon, authenticated;
grant execute on function public.remove_project_collaborator(uuid, uuid) to authenticated;
grant execute on function public.coauthors_for_projects(uuid[]) to anon, authenticated;

-- >>>>>>>>>> migration_social.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: seguidores y amigos
-- Seguís a alguien → figurás como seguidor en su perfil. Si te sigue de vuelta → son amigos.
-- Idempotente.
-- =========================================================================
create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;
-- Quién sigue a quién es público (como en cualquier red)
drop policy if exists "Follows visibles" on public.follows;
create policy "Follows visibles" on public.follows for select using (true);
drop policy if exists "Seguir con mi cuenta" on public.follows;
create policy "Seguir con mi cuenta" on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists "Dejar de seguir" on public.follows;
create policy "Dejar de seguir" on public.follows for delete using (auth.uid() = follower_id);

grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;

-- Amigos / seguidores / seguidos de un usuario (los tres grupos sin solaparse)
create or replace function public.social_lists(p_user uuid)
returns table (kind text, user_id uuid, handle text, name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  with seguidores as (select follower_id as id from public.follows where followee_id = p_user),
       seguidos   as (select followee_id as id from public.follows where follower_id = p_user)
  select case
           when s1.id is not null and s2.id is not null then 'amigo'
           when s1.id is not null then 'seguidor'
           else 'seguido'
         end,
         pr.id, pr.handle, pr.name, pr.avatar_url
    from (select id from seguidores union select id from seguidos) u
    left join seguidores s1 on s1.id = u.id
    left join seguidos s2 on s2.id = u.id
    join public.profiles pr on pr.id = u.id;
$$;
revoke all on function public.social_lists(uuid) from public;
grant execute on function public.social_lists(uuid) to anon, authenticated;

-- >>>>>>>>>> migration_profiles.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: tipo de cuenta en el perfil (artista / oyente)
-- Sin esta columna todos figuraban como artistas (el tipo quedaba solo en el navegador).
-- Los oyentes existentes se marcan solos la próxima vez que entran. Idempotente.
-- =========================================================================
alter table public.profiles add column if not exists account_type text not null default 'artista';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_account_type_check') then
    alter table public.profiles add constraint profiles_account_type_check check (account_type in ('artista', 'oyente'));
  end if;
end;
$$;

-- >>>>>>>>>> migration_privacy.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: privacidad de proyectos en 3 niveles
--   'public'  → lo ve todo El tablero
--   'friends' → solo amigos (se siguen mutuamente, tabla follows)
--   'private' → solo yo (y a quien le comparta un link / colaboradores)
-- Requiere migration_visibility.sql (is_public) y migration_social.sql (follows). Idempotente.
-- =========================================================================
alter table public.projects add column if not exists visibility text not null default 'private';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_visibility_check') then
    alter table public.projects add constraint projects_visibility_check check (visibility in ('public', 'friends', 'private'));
  end if;
end;
$$;
update public.projects set visibility = 'public' where is_public and visibility <> 'public';

-- is_public y visibility siempre coherentes; un editor invitado no cambia la privacidad
create or replace function public.privacy_sync_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and old.user_id is distinct from auth.uid() then
    new.visibility := old.visibility;
    new.is_public := old.is_public;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.visibility = 'private' and new.is_public then new.visibility := 'public'; end if;
  elsif new.visibility is distinct from old.visibility then
    null; -- manda visibility
  elsif new.is_public is distinct from old.is_public then
    new.visibility := case when new.is_public then 'public' else 'private' end;
  end if;
  new.is_public := (new.visibility = 'public');
  return new;
end;
$$;
drop trigger if exists privacy_sync_project on public.projects;
create trigger privacy_sync_project
  before insert or update on public.projects
  for each row execute function public.privacy_sync_project();

-- ¿La cuenta logueada es amiga (seguimiento mutuo) del dueño?
create or replace function public.is_friend_of(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.follows where follower_id = auth.uid() and followee_id = p_owner)
     and exists (select 1 from public.follows where follower_id = p_owner and followee_id = auth.uid());
$$;
revoke all on function public.is_friend_of(uuid) from public;
grant execute on function public.is_friend_of(uuid) to anon, authenticated;

drop policy if exists "Proyectos para amigos" on public.projects;
create policy "Proyectos para amigos" on public.projects
  for select using (visibility = 'friends' and public.is_friend_of(user_id));

drop policy if exists "Tracks de proyectos para amigos" on public.tracks;
create policy "Tracks de proyectos para amigos" on public.tracks
  for select using (
    exists (select 1 from public.projects p
            where p.id = tracks.project_id and p.visibility = 'friends' and public.is_friend_of(p.user_id))
  );

drop policy if exists "Videos de proyectos para amigos" on public.project_videos;
create policy "Videos de proyectos para amigos" on public.project_videos
  for select using (
    exists (select 1 from public.projects p
            where p.id = project_videos.project_id and p.visibility = 'friends' and public.is_friend_of(p.user_id))
  );

-- >>>>>>>>>> migration_notifications.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: notificaciones (campanita)
-- Me gusta a un track tuyo, guardaron un proyecto tuyo, te siguen, ahora son amigos.
-- Idempotente. Los avisos los crean triggers (el cliente solo lee/marca leído).
-- =========================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,   -- quien recibe
  actor_id uuid not null references auth.users(id) on delete cascade,  -- quien lo hizo
  kind text not null check (kind in ('like','save','follow','friend')),
  project_id uuid,
  track_id text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
-- Un mismo gesto no avisa dos veces (sacar y volver a poner el me gusta no spamea)
create unique index if not exists notifications_dedupe_idx
  on public.notifications (user_id, actor_id, kind, coalesce(project_id::text, ''), coalesce(track_id, ''));

alter table public.notifications enable row level security;
drop policy if exists "Mis notificaciones" on public.notifications;
create policy "Mis notificaciones" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "Marcar leídas" on public.notifications;
create policy "Marcar leídas" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Borrar mis notificaciones" on public.notifications;
create policy "Borrar mis notificaciones" on public.notifications for delete using (auth.uid() = user_id);
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Me gusta a un track → avisa al dueño del proyecto
create or replace function public.notify_track_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; proj uuid;
begin
  select p.user_id, p.id into owner, proj
    from public.tracks t join public.projects p on p.id = t.project_id
   where t.id::text = new.track_id;
  if owner is not null and owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, kind, project_id, track_id)
    values (owner, new.user_id, 'like', proj, new.track_id) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_track_like on public.track_likes;
create trigger trg_notify_track_like after insert on public.track_likes
  for each row execute function public.notify_track_like();

-- Guardaron un proyecto → avisa al dueño
create or replace function public.notify_project_save() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.projects where id = new.project_id;
  if owner is not null and owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, kind, project_id)
    values (owner, new.user_id, 'save', new.project_id) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_project_save on public.saved_projects;
create trigger trg_notify_project_save after insert on public.saved_projects
  for each row execute function public.notify_project_save();

-- Te siguen → "te siguió"; si ya lo seguías → "ahora son amigos"
create or replace function public.notify_follow() returns trigger
language plpgsql security definer set search_path = public as $$
declare mutual boolean;
begin
  select exists (select 1 from public.follows
                  where follower_id = new.followee_id and followee_id = new.follower_id) into mutual;
  insert into public.notifications (user_id, actor_id, kind)
  values (new.followee_id, new.follower_id, case when mutual then 'friend' else 'follow' end)
  on conflict do nothing;
  if mutual then
    -- el aviso viejo de "te siguió" de esa persona ya no hace falta
    delete from public.notifications
     where user_id = new.followee_id and actor_id = new.follower_id and kind = 'follow';
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_follow on public.follows;
create trigger trg_notify_follow after insert on public.follows
  for each row execute function public.notify_follow();

-- Lista para la campanita (con nombre/foto de quien lo hizo y títulos)
create or replace function public.my_notifications(p_limit int default 50)
returns table (id uuid, kind text, created_at timestamptz, read_at timestamptz,
               actor_id uuid, actor_handle text, actor_name text, actor_avatar text,
               project_id uuid, project_title text, track_id text, track_title text)
language sql stable security definer set search_path = public as $$
  select n.id, n.kind, n.created_at, n.read_at,
         n.actor_id, pr.handle, pr.name, pr.avatar_url,
         n.project_id, pj.title, n.track_id, tk.title
    from public.notifications n
    left join public.profiles pr on pr.id = n.actor_id
    left join public.projects pj on pj.id = n.project_id
    left join public.tracks tk on tk.id::text = n.track_id
   where n.user_id = auth.uid()
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;
revoke all on function public.my_notifications(int) from public;
grant execute on function public.my_notifications(int) to authenticated;

-- Tiempo real para que la campanita se prenda sola
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- >>>>>>>>>> migration_invites_no_revoke.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: los pases solo vencen a los 14 días
-- Generar pases nuevos ya no invalida los anteriores: podés mandar varios y cada uno
-- se puede aceptar cuando quieran dentro de sus 14 días. Idempotente.
-- =========================================================================
create or replace function public.create_invite_codes(p_count int default 3)
returns setof public.invite_codes
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  unlimited boolean := public.invite_is_unlimited();
  n int;
  latest timestamptz;
  v_handle text;
  v_name text;
  v_code text;
  i int;
begin
  if uid is null then
    raise exception 'Tenés que iniciar sesión' using errcode = '28000';
  end if;

  if unlimited then
    n := 5; -- tanda de 5
  else
    select max(created_at) into latest from public.invite_codes where creator_id = uid;
    if latest is not null and latest > now() - interval '14 days' then
      raise exception 'Todavía no se recargaron tus pases (cada 14 días)' using errcode = 'P0001';
    end if;
    n := 3;
  end if;

  select p.handle, p.name into v_handle, v_name from public.profiles p where p.id = uid;

  -- Los pases anteriores NO se invalidan: cada uno vence solo a los 14 días de creado

  for i in 1..n loop
    loop
      v_code := public.invite_new_slug();
      begin
        insert into public.invite_codes (code, creator_id, creator_handle, creator_name, expires_at)
        values (v_code, uid, v_handle, v_name, now() + interval '14 days');
        exit;
      exception when unique_violation then
        -- colisión (muy improbable): probar otro código
      end;
    end loop;
  end loop;

  return query
    select * from public.invite_codes
     where creator_id = uid and used = false and revoked = false and expires_at > now()
     order by created_at desc, code
     limit 30;
end;
$$;

-- Pases que se invalidaron por generar una tanda nueva y siguen dentro de sus 14 días: vuelven a valer
update public.invite_codes set revoked = false
 where revoked = true and used = false and expires_at > now();

-- >>>>>>>>>> migration_audio_original.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: audio para escuchar (MP3) + original para descargar
-- Los tracks se escuchan en MP3 192 kbps (audio_url) y el WAV/AIFF/FLAC original
-- queda en original_audio_url para la descarga. Idempotente.
-- =========================================================================
alter table public.tracks add column if not exists original_audio_url text;

-- >>>>>>>>>> migration_comments.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: comentarios con tiempo en los tracks (globito del reproductor)
-- "en el 1:23 subí el bajo". Avisan al dueño del proyecto en la campanita. Idempotente.
-- Requiere migration_notifications.sql.
-- =========================================================================
create table if not exists public.track_comments (
  id uuid primary key default gen_random_uuid(),
  track_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  at_sec numeric,                              -- segundo del track (null = comentario general)
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists track_comments_track_idx on public.track_comments (track_id, created_at);

alter table public.track_comments enable row level security;
drop policy if exists "Comentarios visibles" on public.track_comments;
create policy "Comentarios visibles" on public.track_comments for select to authenticated using (true);
drop policy if exists "Comentar con mi cuenta" on public.track_comments;
create policy "Comentar con mi cuenta" on public.track_comments for insert to authenticated with check (auth.uid() = user_id);
-- Borra quien lo escribió o el dueño del proyecto del track
drop policy if exists "Borrar comentario" on public.track_comments;
create policy "Borrar comentario" on public.track_comments for delete to authenticated using (
  auth.uid() = user_id
  or exists (select 1 from public.tracks t join public.projects p on p.id = t.project_id
              where t.id::text = track_comments.track_id and p.user_id = auth.uid())
);
grant select, insert, delete on public.track_comments to authenticated;

-- Lista con nombre y foto de quien comentó
create or replace function public.track_comments_list(p_track text)
returns table (id uuid, track_id text, user_id uuid, at_sec numeric, body text, created_at timestamptz,
               handle text, name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select c.id, c.track_id, c.user_id, c.at_sec, c.body, c.created_at, pr.handle, pr.name, pr.avatar_url
    from public.track_comments c
    left join public.profiles pr on pr.id = c.user_id
   where c.track_id = p_track and auth.uid() is not null
   order by c.created_at asc
   limit 500;
$$;
revoke all on function public.track_comments_list(text) from public;
grant execute on function public.track_comments_list(text) to authenticated;

-- La campanita acepta el tipo "comment"
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('like','save','follow','friend','comment'));

-- Comentario nuevo → aviso al dueño del proyecto (el aviso anterior de esa persona en ese track se renueva)
create or replace function public.notify_track_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; proj uuid;
begin
  select p.user_id, p.id into owner, proj
    from public.tracks t join public.projects p on p.id = t.project_id
   where t.id::text = new.track_id;
  if owner is not null and owner <> new.user_id then
    delete from public.notifications
     where user_id = owner and actor_id = new.user_id and kind = 'comment' and track_id = new.track_id;
    insert into public.notifications (user_id, actor_id, kind, project_id, track_id)
    values (owner, new.user_id, 'comment', proj, new.track_id) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_track_comment on public.track_comments;
create trigger trg_notify_track_comment after insert on public.track_comments
  for each row execute function public.notify_track_comment();

do $$ begin
  alter publication supabase_realtime add table public.track_comments;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- >>>>>>>>>> migration_folders.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: carpetas en la Biblioteca (como en [untitled])
-- Cada usuario arma SUS carpetas con cualquier proyecto de su Biblioteca (propios, compartidos,
-- guardados): no se toca el proyecto, se guarda "en qué carpeta lo tengo yo". Idempotente.
-- =========================================================================
create table if not exists public.project_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nueva carpeta',
  created_at timestamptz not null default now()
);
create index if not exists project_folders_user_idx on public.project_folders (user_id, created_at);
alter table public.project_folders enable row level security;
drop policy if exists "Mis carpetas" on public.project_folders;
create policy "Mis carpetas" on public.project_folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.project_folders to authenticated;

-- Qué proyecto tengo en qué carpeta (un proyecto, una carpeta por usuario)
create table if not exists public.project_folder_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  folder_id uuid not null references public.project_folders(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index if not exists project_folder_items_folder_idx on public.project_folder_items (folder_id);
alter table public.project_folder_items enable row level security;
drop policy if exists "Mis proyectos en carpetas" on public.project_folder_items;
create policy "Mis proyectos en carpetas" on public.project_folder_items
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.project_folders f where f.id = folder_id and f.user_id = auth.uid()));
grant select, insert, update, delete on public.project_folder_items to authenticated;

-- >>>>>>>>>> migration_discord.sql
-- =========================================================================
-- EL TABLERO // MIGRACIÓN: avisos de lanzamientos en Discord
-- Cuando un proyecto queda PÚBLICO y con al menos un track con audio, se manda un mensaje
-- (una sola vez por proyecto) al webhook de Discord guardado en Vault como "discord_webhook_url".
-- El secreto lo carga el dueño en Supabase → Project Settings → Vault. Idempotente.
-- =========================================================================
create extension if not exists pg_net with schema extensions;

create table if not exists public.discord_announcements (
  project_id uuid primary key references public.projects(id) on delete cascade,
  announced_at timestamptz not null default now()
);
alter table public.discord_announcements enable row level security;
revoke all on public.discord_announcements from anon, authenticated;

create or replace function public.discord_announce_if_ready(p_project uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  hook text;
  pj record;
  n_tracks int;
  inserted uuid;
begin
  select decrypted_secret into hook from vault.decrypted_secrets where name = 'discord_webhook_url' limit 1;
  if hook is null or hook = '' then return; end if;

  select p.id, p.title, p.type, p.cover_url, p.visibility, p.is_public, pr.handle, pr.name, pr.avatar_url
    into pj
    from public.projects p left join public.profiles pr on pr.id = p.user_id
   where p.id = p_project;
  if pj.id is null then return; end if;
  if not (pj.visibility = 'public' or pj.is_public = true) then return; end if;

  select count(*) into n_tracks from public.tracks where project_id = p_project and audio_url is not null;
  if n_tracks = 0 then return; end if;

  insert into public.discord_announcements (project_id) values (p_project)
  on conflict do nothing returning project_id into inserted;
  if inserted is null then return; end if; -- ya se anunció

  perform net.http_post(
    url := hook,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'username', 'El tablero.',
      'avatar_url', 'https://www.eltablero.blog/icon.png',
      'embeds', jsonb_build_array(jsonb_build_object(
        'title', pj.title,
        'url', 'https://www.eltablero.blog/project/' || pj.id::text,
        'description', '**' || coalesce(pj.handle, pj.name, 'Alguien') || '** subió ' ||
                       lower(coalesce(pj.type, 'un proyecto')) || ' · ' || n_tracks || ' ' ||
                       case when n_tracks = 1 then 'track' else 'tracks' end ||
                       E'\n[Escuchalo en El tablero →](https://www.eltablero.blog/project/' || pj.id::text || ')',
        'color', 14753096,
        'thumbnail', case when pj.cover_url is not null then jsonb_build_object('url', pj.cover_url) else null end,
        'author', jsonb_build_object('name', coalesce(pj.handle, pj.name, 'El tablero'), 'icon_url', pj.avatar_url),
        'footer', jsonb_build_object('text', 'El tablero. · nuevo lanzamiento'),
        'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ))
    )
  );
end $$;
revoke all on function public.discord_announce_if_ready(uuid) from public, anon, authenticated;

create or replace function public.trg_discord_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.discord_announce_if_ready(new.id);
  return new;
end $$;
create or replace function public.trg_discord_track() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.audio_url is not null then perform public.discord_announce_if_ready(new.project_id); end if;
  return new;
end $$;

drop trigger if exists trg_discord_project on public.projects;
create trigger trg_discord_project after insert or update of visibility, is_public on public.projects
  for each row execute function public.trg_discord_project();
drop trigger if exists trg_discord_track on public.tracks;
create trigger trg_discord_track after insert or update of audio_url on public.tracks
  for each row execute function public.trg_discord_track();

-- Lo que ya era público antes de esto no se anuncia de golpe
insert into public.discord_announcements (project_id)
select id from public.projects where visibility = 'public' or is_public = true
on conflict do nothing;

-- Mensaje de prueba (lo corre un admin desde el SQL editor: select public.discord_test();)
create or replace function public.discord_test() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare hook text;
begin
  select decrypted_secret into hook from vault.decrypted_secrets where name = 'discord_webhook_url' limit 1;
  if hook is null then return 'Falta el secreto discord_webhook_url en Vault'; end if;
  perform net.http_post(url := hook, headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('username', 'El tablero.', 'avatar_url', 'https://www.eltablero.blog/icon.png',
      'content', '👋 El tablero. ya está conectado: acá van a caer los lanzamientos nuevos.'));
  return 'enviado';
end $$;
revoke all on function public.discord_test() from public, anon, authenticated;


-- ==================== migration_activity.sql (18/11/2026, aplicada) ====================
-- ==================== ACTIVIDAD: qué está escuchando cada uno ====================
-- Una fila por usuario, que la app actualiza cada ~45 s mientras está abierta (y al cambiar de track / play-pausa).
-- "Conectado" = last_seen de hace menos de 2 minutos. Lo ven: los AMIGOS (se siguen mutuamente) si share = true,
-- y el admin (panel /admin/usuarios). Nadie lee la tabla directo: todo por funciones.
create table if not exists public.listening_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  track_id text,
  track_title text,
  artist text,
  project_id text,
  project_title text,
  cover_url text,
  is_playing boolean not null default false,
  device text,
  share boolean not null default true,
  track_started_at timestamptz,
  last_seen timestamptz not null default now()
);
alter table public.listening_activity enable row level security;

drop policy if exists "Mi actividad: ver" on public.listening_activity;
create policy "Mi actividad: ver" on public.listening_activity for select using (auth.uid() = user_id);
drop policy if exists "Mi actividad: crear" on public.listening_activity;
create policy "Mi actividad: crear" on public.listening_activity for insert with check (auth.uid() = user_id);
drop policy if exists "Mi actividad: actualizar" on public.listening_activity;
create policy "Mi actividad: actualizar" on public.listening_activity for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.listening_activity to authenticated;

-- La hora la pone el servidor (no el reloj del celu); el comienzo del track solo cambia si cambia el track
create or replace function public.listening_activity_touch()
returns trigger language plpgsql as $$
begin
  new.last_seen := now();
  if tg_op = 'INSERT' or new.track_id is distinct from old.track_id then
    new.track_started_at := case when new.track_id is null then null else now() end;
  else
    new.track_started_at := old.track_started_at;
  end if;
  return new;
end $$;
drop trigger if exists listening_activity_touch on public.listening_activity;
create trigger listening_activity_touch before insert or update on public.listening_activity
  for each row execute function public.listening_activity_touch();

-- Actividad de mis amigos (seguimiento mutuo) que comparten lo que escuchan
create or replace function public.friends_activity()
returns table (
  user_id uuid, handle text, name text, avatar_url text,
  track_id text, track_title text, artist text, project_id text, project_title text, cover_url text,
  is_playing boolean, last_seen timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.handle, p.name, p.avatar_url,
         a.track_id, a.track_title, a.artist, a.project_id, a.project_title, a.cover_url,
         coalesce(a.is_playing, false), a.last_seen
  from public.follows f1
  join public.follows f2 on f2.follower_id = f1.followee_id and f2.followee_id = f1.follower_id
  join public.profiles p on p.id = f1.followee_id
  left join public.listening_activity a on a.user_id = p.id and a.share
  where f1.follower_id = auth.uid()
  order by a.last_seen desc nulls last;
$$;
revoke all on function public.friends_activity() from public, anon;
grant execute on function public.friends_activity() to authenticated;

-- Panel del admin: todos los registrados, cuándo entraron por última vez y qué escuchan
create or replace function public.admin_users_activity()
returns table (
  user_id uuid, handle text, name text, avatar_url text, account_type text, email text,
  registered_at timestamptz, last_sign_in_at timestamptz,
  track_title text, artist text, project_title text, cover_url text,
  is_playing boolean, device text, share boolean, last_seen timestamptz
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if auth.uid() is distinct from '927df5ff-0c13-4088-abc7-52dbf9dbd41b'::uuid then
    raise exception 'solo admin';
  end if;
  return query
    select u.id, p.handle, p.name, p.avatar_url, p.account_type, u.email::text,
           u.created_at, u.last_sign_in_at,
           a.track_title, a.artist, a.project_title, a.cover_url,
           coalesce(a.is_playing, false), a.device, a.share, a.last_seen
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.listening_activity a on a.user_id = u.id
    order by a.last_seen desc nulls last, u.created_at desc;
end $$;
revoke all on function public.admin_users_activity() from public, anon;
grant execute on function public.admin_users_activity() to authenticated;


-- ==================== migration_security.sql (19/11/2026, aplicada) ====================
-- ==================== SEGURIDAD (auditoría 19/11/2026) ====================

-- 1) Perfiles: la política "ALL" se separa en crear / editar / borrar (más claro).
--    OJO: "Perfil nuevo solo con invitacion" es RESTRICTIVA (se suma con AND): sigue haciendo falta un pase,
--    pero además tiene que existir una política PERMISIVA de insert, si no nadie puede guardar su perfil.
drop policy if exists "Usuarios editan su propio perfil" on public.profiles;
drop policy if exists "Crear mi perfil" on public.profiles;
create policy "Crear mi perfil" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "Editar mi perfil" on public.profiles;
create policy "Editar mi perfil" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Borrar mi perfil" on public.profiles;
create policy "Borrar mi perfil" on public.profiles for delete using (auth.uid() = id);

-- 2) Comentarios: solo los de tracks que podés ver (antes cualquier logueado leía todos con el id del track)
create or replace function public.can_view_track(p_track text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tracks t join public.projects p on p.id = t.project_id
    where t.id::text = p_track
      and (p.is_public or p.user_id = auth.uid()
           or public.share_can_view_project(p.id)
           or public.share_track_role(t.id) is not null
           or (p.visibility = 'friends' and public.is_friend_of(p.user_id)))
  );
$$;
grant execute on function public.can_view_track(text) to authenticated;
revoke execute on function public.can_view_track(text) from anon, public;

drop policy if exists "Comentarios visibles" on public.track_comments;
create policy "Comentarios visibles" on public.track_comments for select to authenticated using (public.can_view_track(track_id));

create or replace function public.track_comments_list(p_track text)
returns table (id uuid, track_id text, user_id uuid, at_sec numeric, body text, created_at timestamptz, handle text, name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select c.id, c.track_id, c.user_id, c.at_sec, c.body, c.created_at, pr.handle, pr.name, pr.avatar_url
    from public.track_comments c
    left join public.profiles pr on pr.id = c.user_id
   where c.track_id = p_track and auth.uid() is not null and public.can_view_track(p_track)
   order by c.created_at asc
   limit 500;
$$;

-- 3) Funciones que solo sirven con sesión: fuera del rol anónimo
do $$
declare f text;
begin
  foreach f in array array[
    'add_project_collaborator(uuid,text,text,boolean)', 'consume_invite_code(text)', 'create_invite_codes(integer)',
    'create_project_share(uuid,uuid,text)', 'delete_my_account()', 'list_project_collaborators(uuid)',
    'my_notifications(integer)', 'redeem_project_share(text)', 'remove_project_collaborator(uuid,uuid)',
    'revoke_project_share(text)', 'invite_can_create_profile()', 'invite_fill_used_handle()', 'invite_is_unlimited()',
    'notify_follow()', 'notify_project_save()', 'notify_track_comment()', 'notify_track_like()',
    'privacy_sync_project()', 'share_guard_project_owner()', 'share_guard_track_project()',
    'trg_discord_project()', 'trg_discord_track()', 'track_comments_list(text)'
  ] loop
    begin
      execute format('revoke execute on function public.%s from public, anon', f);
      execute format('grant execute on function public.%s to authenticated', f);
    exception when undefined_function then null;
    end;
  end loop;
end $$;

-- 4) Prolijidad
alter function public.listening_activity_touch() set search_path = public;
alter table if exists public.r2_migration_backup enable row level security;

-- 5) Control remoto: el canal en vivo deja de ser "player:<id>" (el id de cada perfil es público,
--    cualquiera podía espiar o manejar tu reproductor). Ahora lleva una llave secreta por usuario.
create table if not exists public.player_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  key text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  rotated_at timestamptz not null default now()
);
alter table public.player_keys enable row level security;
drop policy if exists "Mi llave" on public.player_keys;
create policy "Mi llave" on public.player_keys for select using (auth.uid() = user_id);

create or replace function public.my_player_key()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare k text;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  insert into public.player_keys (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select key into k from public.player_keys where user_id = auth.uid();
  return k;
end $$;

-- Llave nueva = se desconectan todas las teles vinculadas (y los demás dispositivos se reenganchan solos)
create or replace function public.rotate_player_key()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare k text := encode(gen_random_bytes(18), 'hex');
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  insert into public.player_keys (user_id, key) values (auth.uid(), k)
    on conflict (user_id) do update set key = excluded.key, rotated_at = now();
  return k;
end $$;
revoke all on function public.my_player_key() from public, anon;
revoke all on function public.rotate_player_key() from public, anon;
grant execute on function public.my_player_key() to authenticated;
grant execute on function public.rotate_player_key() to authenticated;


-- ==================== migration_dms.sql (19/11/2026, aplicada) ====================
-- ==================== MENSAJES DIRECTOS (19/11/2026) ====================
-- Conversaciones de a 2 o grupos (hasta 10 personas). Mensajes de texto o con un track compartido.
-- Quién te puede escribir (para EMPEZAR una conversación): todos / tus seguidores / tus amigos (mutuos) / nadie.

alter table public.profiles add column if not exists dm_policy text not null default 'followers';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_dm_policy_check') then
    alter table public.profiles add constraint profiles_dm_policy_check check (dm_policy in ('everyone', 'followers', 'friends', 'nobody'));
  end if;
end $$;

create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text check (title is null or char_length(title) <= 60),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table if not exists public.dm_members (
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists dm_members_user_idx on public.dm_members (user_id);
create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  body text check (body is null or char_length(body) <= 2000),
  -- track compartido (foto del momento: título, artista, tapa, proyecto y link para abrirlo)
  track jsonb,
  created_at timestamptz not null default now(),
  check (coalesce(char_length(trim(body)), 0) > 0 or track is not null)
);
create index if not exists dm_messages_thread_idx on public.dm_messages (thread_id, created_at desc);

alter table public.dm_threads enable row level security;
alter table public.dm_members enable row level security;
alter table public.dm_messages enable row level security;

create or replace function public.is_dm_member(p_thread uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dm_members where thread_id = p_thread and user_id = auth.uid());
$$;
revoke all on function public.is_dm_member(uuid) from public, anon;
grant execute on function public.is_dm_member(uuid) to authenticated;

drop policy if exists "Ver mis conversaciones" on public.dm_threads;
create policy "Ver mis conversaciones" on public.dm_threads for select to authenticated using (public.is_dm_member(id));
drop policy if exists "Ver miembros" on public.dm_members;
create policy "Ver miembros" on public.dm_members for select to authenticated using (public.is_dm_member(thread_id));
drop policy if exists "Marcar leído" on public.dm_members;
create policy "Marcar leído" on public.dm_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Ver mensajes" on public.dm_messages;
create policy "Ver mensajes" on public.dm_messages for select to authenticated using (public.is_dm_member(thread_id));
drop policy if exists "Mandar mensaje" on public.dm_messages;
create policy "Mandar mensaje" on public.dm_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_dm_member(thread_id));
drop policy if exists "Borrar mi mensaje" on public.dm_messages;
create policy "Borrar mi mensaje" on public.dm_messages for delete to authenticated using (sender_id = auth.uid());

grant select on public.dm_threads, public.dm_members, public.dm_messages to authenticated;
grant update (last_read_at) on public.dm_members to authenticated;
grant insert, delete on public.dm_messages to authenticated;

-- Al mandar un mensaje: la conversación sube arriba y el que lo mandó ya lo leyó
create or replace function public.dm_after_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.dm_threads set last_message_at = new.created_at where id = new.thread_id;
  update public.dm_members set last_read_at = new.created_at where thread_id = new.thread_id and user_id = new.sender_id;
  return new;
end $$;
drop trigger if exists dm_after_message on public.dm_messages;
create trigger dm_after_message after insert on public.dm_messages for each row execute function public.dm_after_message();
revoke all on function public.dm_after_message() from public, anon, authenticated;

-- ¿p_from le puede escribir a p_to? (según lo que eligió p_to)
create or replace function public.dm_allowed(p_from uuid, p_to uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case coalesce((select dm_policy from public.profiles where id = p_to), 'followers')
    when 'everyone' then true
    when 'followers' then exists (select 1 from public.follows where follower_id = p_from and followee_id = p_to)
    when 'friends' then exists (select 1 from public.follows where follower_id = p_from and followee_id = p_to)
                    and exists (select 1 from public.follows where follower_id = p_to and followee_id = p_from)
    else false end;
$$;
revoke all on function public.dm_allowed(uuid, uuid) from public, anon;
grant execute on function public.dm_allowed(uuid, uuid) to authenticated;

-- Conversación de a 2 (si ya existe, la devuelve; si es nueva, chequea que el otro acepte mensajes tuyos)
create or replace function public.dm_open(p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'Tenés que iniciar sesión'; end if;
  if p_user = me then raise exception 'No te podés mandar mensajes a vos mismo'; end if;
  select t.id into v from public.dm_threads t
    join public.dm_members a on a.thread_id = t.id and a.user_id = me
    join public.dm_members b on b.thread_id = t.id and b.user_id = p_user
   where not t.is_group limit 1;
  if v is not null then return v; end if;
  if not public.dm_allowed(me, p_user) then
    raise exception 'Esa persona no recibe mensajes tuyos (lo eligió en su configuración)';
  end if;
  insert into public.dm_threads (is_group, created_by) values (false, me) returning id into v;
  insert into public.dm_members (thread_id, user_id) values (v, me), (v, p_user);
  return v;
end $$;

-- Grupo (hasta 10 contando al que lo crea). Todos tienen que aceptar mensajes del creador.
create or replace function public.dm_create_group(p_users uuid[], p_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; me uuid := auth.uid(); u uuid; others uuid[]; blocked text;
begin
  if me is null then raise exception 'Tenés que iniciar sesión'; end if;
  select array_agg(distinct x) into others from unnest(p_users) x where x is not null and x <> me;
  if others is null or array_length(others, 1) < 1 then raise exception 'Elegí al menos una persona'; end if;
  if array_length(others, 1) > 9 then raise exception 'Un grupo es de hasta 10 personas'; end if;
  select string_agg(coalesce(p.handle, '?'), ', ') into blocked
    from unnest(others) x left join public.profiles p on p.id = x
   where not public.dm_allowed(me, x);
  if blocked is not null then raise exception 'No reciben mensajes tuyos: %', blocked; end if;
  insert into public.dm_threads (is_group, title, created_by)
    values (true, nullif(trim(coalesce(p_title, '')), ''), me) returning id into v;
  insert into public.dm_members (thread_id, user_id) select v, me union select v, x from unnest(others) x;
  return v;
end $$;

-- Salir de una conversación (si queda vacía, se borra)
create or replace function public.dm_leave(p_thread uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from public.dm_members where thread_id = p_thread and user_id = auth.uid();
  if not exists (select 1 from public.dm_members where thread_id = p_thread) then
    delete from public.dm_threads where id = p_thread;
  end if;
  return true;
end $$;

-- Renombrar un grupo (cualquier miembro)
create or replace function public.dm_rename(p_thread uuid, p_title text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_dm_member(p_thread) then raise exception 'No sos parte de esta conversación'; end if;
  update public.dm_threads set title = nullif(trim(left(coalesce(p_title, ''), 60)), '') where id = p_thread and is_group;
  return found;
end $$;

-- Bandeja: mis conversaciones con los otros miembros, el último mensaje y cuántos no leí
create or replace function public.dm_inbox()
returns table (thread_id uuid, is_group boolean, title text, last_message_at timestamptz, members jsonb,
               last_body text, last_track_title text, last_sender uuid, unread int)
language sql stable security definer set search_path = public as $$
  select t.id, t.is_group, t.title, t.last_message_at,
         (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'handle', p.handle, 'name', p.name, 'avatar_url', p.avatar_url)), '[]'::jsonb)
            from public.dm_members m2 join public.profiles p on p.id = m2.user_id
           where m2.thread_id = t.id and m2.user_id <> auth.uid()),
         lm.body, lm.track ->> 'title', lm.sender_id,
         (select count(*)::int from public.dm_messages x
           where x.thread_id = t.id and x.created_at > me.last_read_at and x.sender_id is distinct from auth.uid())
    from public.dm_members me
    join public.dm_threads t on t.id = me.thread_id
    left join lateral (select body, track, sender_id from public.dm_messages where thread_id = t.id order by created_at desc limit 1) lm on true
   where me.user_id = auth.uid()
   order by t.last_message_at desc
   limit 100;
$$;

do $$
declare f text;
begin
  foreach f in array array['dm_open(uuid)', 'dm_create_group(uuid[],text)', 'dm_leave(uuid)', 'dm_rename(uuid,text)', 'dm_inbox()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- En vivo: los mensajes nuevos llegan por Realtime (respeta las reglas: cada uno recibe solo los suyos)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'dm_messages') then
    alter publication supabase_realtime add table public.dm_messages;
  end if;
end $$;


-- ==================== migration_plays_board.sql (19/11/2026, aplicada) ====================
-- ==================== REPRODUCCIONES + TABLERO DE TRACKS (19/11/2026) ====================

-- 1) Reproducciones. Se cuenta una cuando alguien con sesión escucha un track ~30 s (o entero si es corto).
--    La misma persona con el mismo track cuenta como máximo una vez cada 10 minutos (anti-spam).
create table if not exists public.track_plays (
  id bigint generated always as identity primary key,
  track_id uuid not null references public.tracks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists track_plays_track_idx on public.track_plays (track_id);
create index if not exists track_plays_user_track_idx on public.track_plays (user_id, track_id, created_at desc);
alter table public.track_plays enable row level security; -- sin políticas: solo por funciones

-- El dueño elige si el contador lo ven todos o solo él
alter table public.profiles add column if not exists show_play_counts boolean not null default true;

create or replace function public.register_play(p_track uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return false; end if;
  if not public.can_view_track(p_track::text) then return false; end if;
  if exists (select 1 from public.track_plays where user_id = me and track_id = p_track and created_at > now() - interval '10 minutes') then
    return false;
  end if;
  insert into public.track_plays (track_id, user_id) values (p_track, me);
  return true;
end $$;
revoke all on function public.register_play(uuid) from public, anon;
grant execute on function public.register_play(uuid) to authenticated;

-- Contadores visibles para quien pregunta: los del dueño que los muestra, o los tuyos
create or replace function public.track_play_counts(p_tracks uuid[])
returns table (track_id uuid, plays int) language sql stable security definer set search_path = public as $$
  select t.id, (select count(*)::int from public.track_plays tp where tp.track_id = t.id)
    from public.tracks t
    join public.projects p on p.id = t.project_id
    join public.profiles pr on pr.id = p.user_id
   where t.id = any(p_tracks)
     and public.can_view_track(t.id::text)
     and (pr.show_play_counts or p.user_id = auth.uid());
$$;
revoke all on function public.track_play_counts(uuid[]) from public;
grant execute on function public.track_play_counts(uuid[]) to anon, authenticated;

-- 2) Tablero de tracks: foto diaria a las 18:00 (hora argentina). Puntaje con CUENTAS ÚNICAS
--    (sin contar al dueño): oyentes ×1 + me gusta ×2 + comentaristas ×3. Desempate: reproducciones, más nuevo.
create table if not exists public.track_board (
  period_start timestamptz not null,
  rank int not null,
  track_id uuid not null references public.tracks(id) on delete cascade,
  score int not null,
  listeners int not null,
  likers int not null,
  commenters int not null,
  plays int not null,
  primary key (period_start, rank)
);
alter table public.track_board enable row level security; -- sin políticas: solo por funciones

-- Última "hora de corte" de las 18:00 en Buenos Aires
create or replace function public.track_board_period()
returns timestamptz language sql stable as $$
  select case
    when now() >= ((now() at time zone 'America/Argentina/Buenos_Aires')::date + time '18:00') at time zone 'America/Argentina/Buenos_Aires'
      then ((now() at time zone 'America/Argentina/Buenos_Aires')::date + time '18:00') at time zone 'America/Argentina/Buenos_Aires'
    else ((now() at time zone 'America/Argentina/Buenos_Aires')::date - 1 + time '18:00') at time zone 'America/Argentina/Buenos_Aires'
  end;
$$;

create or replace function public.compute_track_board()
returns int language plpgsql security definer set search_path = public as $$
declare v_period timestamptz := public.track_board_period(); n int;
begin
  if exists (select 1 from public.track_board where period_start = v_period) then return 0; end if;
  insert into public.track_board (period_start, rank, track_id, score, listeners, likers, commenters, plays)
  select v_period, row_number() over (order by s.score desc, s.plays desc, s.created_at desc), s.id, s.score, s.listeners, s.likers, s.commenters, s.plays
  from (
    select t.id, t.created_at,
           coalesce(l.n, 0) as listeners, coalesce(k.n, 0) as likers, coalesce(c.n, 0) as commenters, coalesce(pl.n, 0) as plays,
           coalesce(l.n, 0) + 2 * coalesce(k.n, 0) + 3 * coalesce(c.n, 0) as score
      from public.tracks t
      join public.projects p on p.id = t.project_id
      left join lateral (select count(distinct user_id)::int n from public.track_plays where track_id = t.id and user_id is distinct from p.user_id) l on true
      left join lateral (select count(*)::int n from public.track_plays where track_id = t.id) pl on true
      left join lateral (select count(distinct user_id)::int n from public.track_likes where track_id = t.id::text and user_id is distinct from p.user_id) k on true
      left join lateral (select count(distinct user_id)::int n from public.track_comments where track_id = t.id::text and user_id is distinct from p.user_id) c on true
     where (p.is_public or p.visibility = 'public')
       and coalesce(t.audio_url, '') like 'http%'
     order by score desc, plays desc, t.created_at desc
     limit 40
  ) s;
  get diagnostics n = row_count;
  delete from public.track_board where period_start < v_period - interval '30 days';
  return n;
end $$;
revoke all on function public.compute_track_board() from public, anon, authenticated;

-- Lo que muestra la app (si a las 18 no corrió el reloj, se calcula en el momento)
create or replace function public.track_board_current()
returns table (rank int, track_id uuid, project_id uuid, title text, artist text, cover_url text, project_title text,
               score int, listeners int, likers int, commenters int, period_start timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_period timestamptz := public.track_board_period();
begin
  if not exists (select 1 from public.track_board b where b.period_start = v_period) then
    perform public.compute_track_board();
  end if;
  return query
    select b.rank, t.id, p.id, t.title, t.artist, coalesce(nullif(t.cover_url, ''), p.cover_url), p.title,
           b.score, b.listeners, b.likers, b.commenters, b.period_start
      from public.track_board b
      join public.tracks t on t.id = b.track_id
      join public.projects p on p.id = t.project_id
     where b.period_start = v_period and (p.is_public or p.visibility = 'public')
     order by b.rank;
end $$;
revoke all on function public.track_board_current() from public;
grant execute on function public.track_board_current() to anon, authenticated;

-- Reloj: todos los días a las 21:00 UTC = 18:00 en Argentina
create extension if not exists pg_cron;
do $$ begin
  perform cron.unschedule('track-board-daily') where exists (select 1 from cron.job where jobname = 'track-board-daily');
  perform cron.schedule('track-board-daily', '0 21 * * *', 'select public.compute_track_board()');
end $$;


-- ==================== migration_friends.sql (19/11/2026, aplicada) ====================
-- ==================== SOLO AMIGOS (solicitudes de amistad) — 19/11/2026 ====================
-- Se reutiliza la tabla follows: A→B solo = solicitud de A a B; A→B y B→A = amigos.
-- Aceptar = el otro inserta la vuelta. Rechazar / eliminar amigo = se borran las filas (cada uno puede borrar
-- la suya y también la que le mandaron a él).

drop policy if exists "Rechazar solicitud o eliminar amigo" on public.follows;
create policy "Rechazar solicitud o eliminar amigo" on public.follows for delete using (auth.uid() = followee_id);

-- Las solicitudes pendientes no son públicas: cada uno ve las suyas; las amistades sí se ven
create or replace function public.follows_is_mutual(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.follows where follower_id = b and followee_id = a);
$$;
revoke all on function public.follows_is_mutual(uuid, uuid) from public;
grant execute on function public.follows_is_mutual(uuid, uuid) to anon, authenticated;
drop policy if exists "Follows visibles" on public.follows;
create policy "Follows visibles" on public.follows for select
  using (auth.uid() = follower_id or auth.uid() = followee_id or public.follows_is_mutual(follower_id, followee_id));

-- Listas: de otro solo se ven sus amigos; las tuyas incluyen solicitudes recibidas ("seguidor") y enviadas ("seguido")
create or replace function public.social_lists(p_user uuid)
returns table (kind text, user_id uuid, handle text, name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select * from (
    with seguidores as (select follower_id as id from public.follows where followee_id = p_user),
         seguidos   as (select followee_id as id from public.follows where follower_id = p_user)
    select case
             when s1.id is not null and s2.id is not null then 'amigo'
             when s1.id is not null then 'seguidor'
             else 'seguido'
           end as kind,
           pr.id as user_id, pr.handle, pr.name, pr.avatar_url
      from (select id from seguidores union select id from seguidos) u
      left join seguidores s1 on s1.id = u.id
      left join seguidos s2 on s2.id = u.id
      join public.profiles pr on pr.id = u.id
  ) x
  where x.kind = 'amigo' or p_user = auth.uid();
$$;

-- Mensajes: "seguidores" ya no existe como opción → pasa a "solo amigos"
update public.profiles set dm_policy = 'friends' where dm_policy = 'followers';
alter table public.profiles alter column dm_policy set default 'friends';
