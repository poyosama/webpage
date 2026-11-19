-- ==================== SOLO AMIGOS (solicitudes de amistad) — 19/11/2026 ====================
-- Se reutiliza la tabla follows: A→B solo = solicitud de A a B; A→B y B→A = amigos.
-- Aceptar = el otro inserta la vuelta. Rechazar / eliminar amigo = se borran las filas (cada uno puede borrar
-- la suya y también la que le mandaron a él).

drop policy if exists "Rechazar solicitud o eliminar amigo" on public.follows;
create policy "Rechazar solicitud o eliminar amigo" on public.follows for delete using (auth.uid() = followee_id);

-- Las solicitudes pendientes no son públicas: cada uno ve las suyas; las amistades sí se ven
create or replace function public.follows_is_mutual(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.follows where follower_id = b and followee_id = a);
$$;
revoke all on function public.follows_is_mutual(uuid, uuid) from public;
grant execute on function public.follows_is_mutual(uuid, uuid) to anon, authenticated;
drop policy if exists "Follows visibles" on public.follows;
create policy "Follows visibles" on public.follows for select
  using (auth.uid() = follower_id or auth.uid() = followee_id or public.follows_is_mutual(follower_id, followee_id));

-- Listas: de otro solo se ven sus amigos; las tuyas incluyen solicitudes recibidas ("seguidor") y enviadas ("seguido")
create or replace function public.social_lists(p_user uuid)
returns table (kind text, user_id uuid, handle text, name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select * from (
    with seguidores as (select follower_id as id from public.follows where followee_id = p_user),
         seguidos   as (select followee_id as id from public.follows where follower_id = p_user)
    select case
             when s1.id is not null and s2.id is not null then 'amigo'
             when s1.id is not null then 'seguidor'
             else 'seguido'
           end as kind,
           pr.id as user_id, pr.handle, pr.name, pr.avatar_url
      from (select id from seguidores union select id from seguidos) u
      left join seguidores s1 on s1.id = u.id
      left join seguidos s2 on s2.id = u.id
      join public.profiles pr on pr.id = u.id
  ) x
  where x.kind = 'amigo' or p_user = auth.uid();
$$;

-- Mensajes: "seguidores" ya no existe como opción → pasa a "solo amigos"
update public.profiles set dm_policy = 'friends' where dm_policy = 'followers';
alter table public.profiles alter column dm_policy set default 'friends';
