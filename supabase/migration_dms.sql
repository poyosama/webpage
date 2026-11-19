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
