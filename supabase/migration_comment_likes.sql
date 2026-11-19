-- ==================== ME GUSTA EN LOS COMENTARIOS (19/11/2026) ====================
create table if not exists public.comment_likes (
  comment_id uuid not null references public.track_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists comment_likes_comment_idx on public.comment_likes (comment_id);
alter table public.comment_likes enable row level security;
drop policy if exists "Mis me gusta en comentarios" on public.comment_likes;
create policy "Mis me gusta en comentarios" on public.comment_likes for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Dar me gusta a un comentario" on public.comment_likes;
-- solo en comentarios que podés ver (la subconsulta respeta las reglas de track_comments)
create policy "Dar me gusta a un comentario" on public.comment_likes for insert to authenticated
  with check (auth.uid() = user_id and exists (select 1 from public.track_comments c where c.id = comment_id));
drop policy if exists "Sacar me gusta de un comentario" on public.comment_likes;
create policy "Sacar me gusta de un comentario" on public.comment_likes for delete to authenticated using (auth.uid() = user_id);
grant select, insert, delete on public.comment_likes to authenticated;

-- La lista de comentarios ahora trae cuántos me gusta tiene cada uno y si le diste vos
drop function if exists public.track_comments_list(text);
create function public.track_comments_list(p_track text)
returns table (id uuid, track_id text, user_id uuid, at_sec numeric, body text, created_at timestamptz,
               handle text, name text, avatar_url text, like_count int, liked boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.track_id, c.user_id, c.at_sec, c.body, c.created_at, pr.handle, pr.name, pr.avatar_url,
         (select count(*)::int from public.comment_likes l where l.comment_id = c.id),
         exists (select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = auth.uid())
    from public.track_comments c
    left join public.profiles pr on pr.id = c.user_id
   where c.track_id = p_track and auth.uid() is not null and public.can_view_track(p_track)
   order by c.created_at asc
   limit 500;
$$;
revoke all on function public.track_comments_list(text) from public, anon;
grant execute on function public.track_comments_list(text) to authenticated;

-- Aviso al autor del comentario: "A @x le gustó tu comentario en el track Y"
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('like', 'save', 'follow', 'friend', 'comment', 'comment_like'));

create or replace function public.notify_comment_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare author uuid; tr text; proj uuid;
begin
  select c.user_id, c.track_id into author, tr from public.track_comments c where c.id = new.comment_id;
  if author is null or author = new.user_id then return new; end if;
  select t.project_id into proj from public.tracks t where t.id::text = tr;
  delete from public.notifications where user_id = author and actor_id = new.user_id and kind = 'comment_like' and track_id = tr;
  insert into public.notifications (user_id, actor_id, kind, project_id, track_id)
  values (author, new.user_id, 'comment_like', proj, tr) on conflict do nothing;
  return new;
end $$;
revoke all on function public.notify_comment_like() from public, anon, authenticated;
drop trigger if exists notify_comment_like on public.comment_likes;
create trigger notify_comment_like after insert on public.comment_likes for each row execute function public.notify_comment_like();
