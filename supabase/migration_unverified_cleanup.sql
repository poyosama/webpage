-- ==================== CUENTAS DE GOOGLE SIN PASE: SE BORRAN SOLAS (21/11/2026) ====================
-- Entrar con Google crea un registro en auth.users ANTES de que la app verifique el pase. Si no tenía pase,
-- ese registro queda colgado ("sin perfil"). Ahora: la app lo borra al rechazarla y un reloj diario limpia lo que quede.

-- ¿Esta cuenta tiene derecho a estar? (perfil, pase usado, admin o anterior al sistema de pases)
create or replace function public.account_is_verified(p_user uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.profiles where id = p_user)
      or exists (select 1 from public.invite_codes where used_by = p_user)
      or exists (select 1 from auth.users u join public.invite_admins a on a.email = lower(u.email) where u.id = p_user)
      or exists (select 1 from auth.users u, public.invite_settings s where u.id = p_user and u.created_at < s.grandfather_before);
$$;
revoke all on function public.account_is_verified(uuid) from public, anon, authenticated;

-- La app la llama cuando rechaza una cuenta sin pase (antes de cerrar sesión)
create or replace function public.discard_unverified_account()
returns boolean language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null or public.account_is_verified(auth.uid()) then return false; end if;
  delete from auth.users where id = auth.uid();
  return true;
end $$;
revoke all on function public.discard_unverified_account() from public, anon;
grant execute on function public.discard_unverified_account() to authenticated;

-- Limpieza diaria (por si la app no llegó a borrarla): cuentas sin verificar de más de 1 hora
create or replace function public.cleanup_unverified_accounts()
returns int language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  delete from auth.users u where u.created_at < now() - interval '1 hour' and not public.account_is_verified(u.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.cleanup_unverified_accounts() from public, anon, authenticated;
do $$ begin
  perform cron.unschedule('cleanup-unverified-accounts') where exists (select 1 from cron.job where jobname = 'cleanup-unverified-accounts');
  perform cron.schedule('cleanup-unverified-accounts', '17 7 * * *', 'select public.cleanup_unverified_accounts()');
end $$;

-- Panel del admin: con qué pase entró cada uno (y quién se lo dio)
drop function if exists public.admin_users_activity();
create function public.admin_users_activity()
returns table (
  user_id uuid, handle text, name text, avatar_url text, account_type text, email text,
  registered_at timestamptz, last_sign_in_at timestamptz,
  track_title text, artist text, project_title text, cover_url text,
  is_playing boolean, device text, share boolean, last_seen timestamptz,
  invite_code text, invited_by text, entry text
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if auth.uid() is distinct from '927df5ff-0c13-4088-abc7-52dbf9dbd41b'::uuid then
    raise exception 'solo admin';
  end if;
  return query
    select u.id, p.handle, p.name, p.avatar_url, p.account_type, u.email::text,
           u.created_at, u.last_sign_in_at,
           a.track_title, a.artist, a.project_title, a.cover_url,
           coalesce(a.is_playing, false), a.device, a.share, a.last_seen,
           c.code, c.creator_handle,
           case when c.code is not null then 'pase'
                when lower(u.email) in (select ia.email from public.invite_admins ia) then 'admin'
                when u.created_at < (select grandfather_before from public.invite_settings limit 1) then 'anterior'
                else 'sin_pase' end
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.listening_activity a on a.user_id = u.id
    left join lateral (select code, creator_handle from public.invite_codes where used_by = u.id limit 1) c on true
    order by a.last_seen desc nulls last, u.created_at desc;
end $$;
revoke all on function public.admin_users_activity() from public, anon;
grant execute on function public.admin_users_activity() to authenticated;
