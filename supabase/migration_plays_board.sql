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
