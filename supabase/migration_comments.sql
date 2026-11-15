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
