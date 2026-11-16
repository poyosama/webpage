-- =========================================================================
-- EL TABLERO // MIGRACIÓN: carpetas de proyectos (como en [untitled])
-- Arrastrar un proyecto encima de otro en la vista de tapas crea una carpeta. Idempotente.
-- =========================================================================
create table if not exists public.project_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nueva carpeta',
  created_at timestamptz not null default now()
);
create index if not exists project_folders_user_idx on public.project_folders (user_id, created_at);
alter table public.project_folders enable row level security;
drop policy if exists "Mis carpetas" on public.project_folders;
create policy "Mis carpetas" on public.project_folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.project_folders to authenticated;

-- Cada proyecto puede estar en una carpeta de su dueño (si se borra la carpeta, el proyecto queda suelto)
alter table public.projects add column if not exists folder_id uuid references public.project_folders(id) on delete set null;
create index if not exists projects_folder_idx on public.projects (folder_id);
