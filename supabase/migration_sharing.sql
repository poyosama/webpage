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
