-- =========================================================================
-- EL TABLERO // MIGRACIÓN: proyectos privados / públicos + guardados
-- Correr UNA vez en Supabase > SQL Editor. Es idempotente.
-- =========================================================================

alter table public.projects add column if not exists is_public boolean not null default false;

-- Un proyecto nace privado; el dueño lo puede publicar para toda la plataforma.
drop policy if exists "Proyectos visibles por todos" on public.projects;
drop policy if exists "Proyectos publicos o propios" on public.projects;
create policy "Proyectos publicos o propios" on public.projects
  for select using (is_public = true or auth.uid() = user_id);

drop policy if exists "Tracks visibles por todos" on public.tracks;
drop policy if exists "Tracks de proyectos visibles" on public.tracks;
create policy "Tracks de proyectos visibles" on public.tracks
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = tracks.project_id and (p.is_public = true or p.user_id = auth.uid())
    )
  );

drop policy if exists "Videos visibles por todos" on public.project_videos;
drop policy if exists "Videos de proyectos visibles" on public.project_videos;
create policy "Videos de proyectos visibles" on public.project_videos
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_videos.project_id and (p.is_public = true or p.user_id = auth.uid())
    )
  );

-- Guardados (bookmarks) por usuario
create table if not exists public.saved_projects (
  user_id uuid references auth.users on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (user_id, project_id)
);
alter table public.saved_projects enable row level security;
drop policy if exists "Guardados propios" on public.saved_projects;
create policy "Guardados propios" on public.saved_projects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Perfiles nuevos: sin datos de relleno
alter table public.profiles alter column stickers set default array[]::text[];
alter table public.profiles alter column crew set default '';
alter table public.profiles alter column role set default 'Artista';

-- Storage: lectura pública, subida solo para usuarios logueados
insert into storage.buckets (id, name, public) values ('el-tablero-media', 'el-tablero-media', true)
on conflict (id) do update set public = true;
