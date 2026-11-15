-- =========================================================================
-- EL TABLERO // MIGRACIÓN: los pases solo vencen a los 14 días
-- Generar pases nuevos ya no invalida los anteriores: podés mandar varios y cada uno
-- se puede aceptar cuando quieran dentro de sus 14 días. Idempotente.
-- =========================================================================
create or replace function public.create_invite_codes(p_count int default 3)
returns setof public.invite_codes
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  unlimited boolean := public.invite_is_unlimited();
  n int;
  latest timestamptz;
  v_handle text;
  v_name text;
  v_code text;
  i int;
begin
  if uid is null then
    raise exception 'Tenés que iniciar sesión' using errcode = '28000';
  end if;

  if unlimited then
    n := 5; -- tanda de 5
  else
    select max(created_at) into latest from public.invite_codes where creator_id = uid;
    if latest is not null and latest > now() - interval '14 days' then
      raise exception 'Todavía no se recargaron tus pases (cada 14 días)' using errcode = 'P0001';
    end if;
    n := 3;
  end if;

  select p.handle, p.name into v_handle, v_name from public.profiles p where p.id = uid;

  -- Los pases anteriores NO se invalidan: cada uno vence solo a los 14 días de creado

  for i in 1..n loop
    loop
      v_code := public.invite_new_slug();
      begin
        insert into public.invite_codes (code, creator_id, creator_handle, creator_name, expires_at)
        values (v_code, uid, v_handle, v_name, now() + interval '14 days');
        exit;
      exception when unique_violation then
        -- colisión (muy improbable): probar otro código
      end;
    end loop;
  end loop;

  return query
    select * from public.invite_codes
     where creator_id = uid and used = false and revoked = false and expires_at > now()
     order by created_at desc, code
     limit 30;
end;
$$;

-- Pases que se invalidaron por generar una tanda nueva y siguen dentro de sus 14 días: vuelven a valer
update public.invite_codes set revoked = false
 where revoked = true and used = false and expires_at > now();
