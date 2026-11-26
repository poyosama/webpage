-- ==================== REPRODUCCIONES: NO CUENTA EL AUTOR (24/11/2026) ====================
-- ESTADO: aplicada el 26/11/2026 (se borraron 65 reproducciones del autor/coautores).
-- El contador muestra solo lo que escuchó el resto. No suman el dueño del proyecto ni sus coautores.

create or replace function public.track_is_mine(p_track uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tracks t join public.projects p on p.id = t.project_id
     where t.id = p_track
       and (p.user_id = auth.uid()
            or exists (select 1 from public.project_members m
                        where m.project_id = p.id and m.user_id = auth.uid() and m.is_coauthor))
  );
$$;
revoke all on function public.track_is_mine(uuid) from public, anon;
grant execute on function public.track_is_mine(uuid) to authenticated;

create or replace function public.register_play(p_track uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return false; end if;
  if not public.can_view_track(p_track::text) then return false; end if;
  if public.track_is_mine(p_track) then return false; end if; -- el autor escuchando lo suyo no suma
  if exists (select 1 from public.track_plays where user_id = me and track_id = p_track and created_at > now() - interval '10 minutes') then
    return false;
  end if;
  insert into public.track_plays (track_id, user_id) values (p_track, me);
  return true;
end $$;

-- Las que ya se habían contado del autor (dueño o coautor) se borran
delete from public.track_plays tp
 using public.tracks t, public.projects p
 where t.id = tp.track_id and p.id = t.project_id
   and (tp.user_id = p.user_id
        or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = tp.user_id and m.is_coauthor));
