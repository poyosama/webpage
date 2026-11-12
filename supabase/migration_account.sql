-- =========================================================================
-- EL TABLERO // MIGRACIÓN: borrar mi cuenta (Ajustes de cuenta → Borrar cuenta)
-- Correr UNA vez en Supabase > SQL Editor. Es idempotente.
-- Borra el usuario de auth.users; por cascada se van su perfil, sus proyectos,
-- tracks, canvas, guardados y membresías. Solo puede borrarse a sí mismo.
-- =========================================================================
create or replace function public.delete_my_account()
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Tenés que iniciar sesión';
  end if;
  delete from public.projects where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
  return true;
end;
$$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
