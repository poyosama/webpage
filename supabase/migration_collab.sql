-- =========================================================================
-- EL TABLERO // MIGRACIÓN: colaboradores (proyectos en conjunto)
-- Requiere migration_sharing.sql (tabla project_members). Idempotente.
-- El dueño invita a otro usuario por @handle:
--   'edit' + coautor  → el proyecto es de los dos: aparece en los dos perfiles y
--                       su nombre se suma al del proyecto (poyo · dorkke)
--   'edit'            → colaborador que puede editar (subir, ordenar, editar tracks)
--   'listen'          → solo escuchar y descargar
-- =========================================================================
alter table public.project_members add column if not exists is_coauthor boolean not null default false;
alter table public.project_members add column if not exists added_by uuid references auth.users(id) on delete set null;

-- Los coautores de proyectos públicos los puede ver cualquiera (para mostrar "poyo · dorkke")
drop policy if exists "Coautores de proyectos públicos visibles" on public.project_members;
create policy "Coautores de proyectos públicos visibles" on public.project_members
  for select using (
    is_coauthor and exists (select 1 from public.projects p where p.id = project_id and p.is_public)
  );
-- Los miembros de un proyecto ven quiénes más están
drop policy if exists "Miembros ven al resto" on public.project_members;
create policy "Miembros ven al resto" on public.project_members
  for select using (public.share_can_view_project(project_id) and track_id is null);

create or replace function public.add_project_collaborator(
  p_project uuid, p_handle text, p_role text default 'edit', p_coauthor boolean default true
)
returns table (user_id uuid, handle text, name text, role text, is_coauthor boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid;
  v_handle text := '@' || regexp_replace(lower(trim(coalesce(p_handle, ''))), '^@+', '');
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if public.share_project_role(p_project) is distinct from 'owner' then
    raise exception 'Solo el dueño del proyecto puede sumar colaboradores';
  end if;
  if p_role not in ('listen', 'edit') then raise exception 'Permiso inválido'; end if;
  select id into v_uid from public.profiles where lower(profiles.handle) = v_handle;
  if v_uid is null then raise exception 'No existe ningún usuario %', v_handle; end if;
  if v_uid = auth.uid() then raise exception 'Ya sos el dueño de este proyecto'; end if;

  insert into public.project_members (project_id, track_id, user_id, role, is_coauthor, added_by)
  values (p_project, null, v_uid, p_role, coalesce(p_coauthor, false) and p_role = 'edit', auth.uid())
  on conflict (project_id, coalesce(track_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id)
  do update set role = excluded.role, is_coauthor = excluded.is_coauthor, added_by = excluded.added_by;

  return query
    select pr.id, pr.handle, pr.name, m.role, m.is_coauthor
      from public.project_members m join public.profiles pr on pr.id = m.user_id
     where m.project_id = p_project and m.user_id = v_uid and m.track_id is null;
end;
$$;

create or replace function public.list_project_collaborators(p_project uuid)
returns table (user_id uuid, handle text, name text, avatar_url text, role text, is_coauthor boolean)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.handle, pr.name, pr.avatar_url, m.role, m.is_coauthor
    from public.project_members m
    join public.profiles pr on pr.id = m.user_id
   where m.project_id = p_project
     and m.track_id is null
     and (
       public.share_can_view_project(p_project)
       or (m.is_coauthor and exists (select 1 from public.projects p where p.id = p_project and p.is_public))
     )
   order by m.is_coauthor desc, m.created_at;
$$;

create or replace function public.remove_project_collaborator(p_project uuid, p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.share_project_role(p_project) is distinct from 'owner' and p_user is distinct from auth.uid() then
    raise exception 'Solo el dueño puede sacar colaboradores';
  end if;
  delete from public.project_members where project_id = p_project and user_id = p_user and track_id is null;
  return found;
end;
$$;

-- Coautores de varios proyectos de una (para armar "poyo · dorkke" en listas)
create or replace function public.coauthors_for_projects(p_projects uuid[])
returns table (project_id uuid, handle text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select m.project_id, pr.handle, pr.name
    from public.project_members m
    join public.profiles pr on pr.id = m.user_id
   where m.project_id = any(p_projects)
     and m.track_id is null
     and m.is_coauthor
     and (
       public.share_can_view_project(m.project_id)
       or exists (select 1 from public.projects p where p.id = m.project_id and p.is_public)
     );
$$;

revoke all on function public.add_project_collaborator(uuid, text, text, boolean) from public;
revoke all on function public.list_project_collaborators(uuid) from public;
revoke all on function public.remove_project_collaborator(uuid, uuid) from public;
revoke all on function public.coauthors_for_projects(uuid[]) from public;
grant execute on function public.add_project_collaborator(uuid, text, text, boolean) to authenticated;
grant execute on function public.list_project_collaborators(uuid) to anon, authenticated;
grant execute on function public.remove_project_collaborator(uuid, uuid) to authenticated;
grant execute on function public.coauthors_for_projects(uuid[]) to anon, authenticated;
