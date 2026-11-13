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
