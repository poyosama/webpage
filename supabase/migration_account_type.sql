-- ============================================================
-- Tipo de cuenta: artista u oyente (se elige en la pantalla de registro)
-- Los oyentes NO aparecen en "Artistas en El tablero".
-- Idempotente: se puede correr más de una vez.
-- ============================================================
alter table public.profiles
  add column if not exists account_type text not null default 'artista';

alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check check (account_type in ('artista', 'oyente'));

-- Chequeo de handle disponible (case-insensitive) sin exponer nada más del perfil.
-- Pasa el id propio para que "mi handle actual" cuente como disponible.
create or replace function public.handle_available(p_handle text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
     where lower(handle) = '@' || lower(regexp_replace(coalesce(p_handle, ''), '^@+', ''))
       and id is distinct from auth.uid()
  );
$$;

revoke all on function public.handle_available(text) from public;
grant execute on function public.handle_available(text) to authenticated;
