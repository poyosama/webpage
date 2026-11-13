-- =========================================================================
-- EL TABLERO // MIGRACIÓN: tipo de cuenta en el perfil (artista / oyente)
-- Sin esta columna todos figuraban como artistas (el tipo quedaba solo en el navegador).
-- Los oyentes existentes se marcan solos la próxima vez que entran. Idempotente.
-- =========================================================================
alter table public.profiles add column if not exists account_type text not null default 'artista';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_account_type_check') then
    alter table public.profiles add constraint profiles_account_type_check check (account_type in ('artista', 'oyente'));
  end if;
end;
$$;
