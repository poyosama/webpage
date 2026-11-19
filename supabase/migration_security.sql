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
