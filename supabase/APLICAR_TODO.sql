-- =========================================================================
-- EL TABLERO // APLICAR TODO (pegar entero en Supabase > SQL Editor > Run)
-- Junta, en orden: migration_visibility, migration_invites, migration_sharing, migration_account, migration_likes, migration_collab, migration_social, migration_profiles.
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
