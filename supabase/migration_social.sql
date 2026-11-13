-- =========================================================================
-- EL TABLERO // MIGRACIÓN: seguidores y amigos
-- Seguís a alguien → figurás como seguidor en su perfil. Si te sigue de vuelta → son amigos.
-- Idempotente.
-- =========================================================================
create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;
-- Quién sigue a quién es público (como en cualquier red)
drop policy if exists "Follows visibles" on public.follows;
create policy "Follows visibles" on public.follows for select using (true);
drop policy if exists "Seguir con mi cuenta" on public.follows;
create policy "Seguir con mi cuenta" on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists "Dejar de seguir" on public.follows;
create policy "Dejar de seguir" on public.follows for delete using (auth.uid() = follower_id);

grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;

-- Amigos / seguidores / seguidos de un usuario (los tres grupos sin solaparse)
create or replace function public.social_lists(p_user uuid)
returns table (kind text, user_id uuid, handle text, name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  with seguidores as (select follower_id as id from public.follows where followee_id = p_user),
       seguidos   as (select followee_id as id from public.follows where follower_id = p_user)
  select case
           when s1.id is not null and s2.id is not null then 'amigo'
           when s1.id is not null then 'seguidor'
           else 'seguido'
         end,
         pr.id, pr.handle, pr.name, pr.avatar_url
    from (select id from seguidores union select id from seguidos) u
    left join seguidores s1 on s1.id = u.id
    left join seguidos s2 on s2.id = u.id
    join public.profiles pr on pr.id = u.id;
$$;
revoke all on function public.social_lists(uuid) from public;
grant execute on function public.social_lists(uuid) to anon, authenticated;
