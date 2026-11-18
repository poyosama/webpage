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
