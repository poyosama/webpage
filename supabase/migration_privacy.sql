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
