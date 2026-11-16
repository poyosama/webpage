-- =========================================================================
-- EL TABLERO // MIGRACIÓN: carpetas en la Biblioteca (como en [untitled])
-- Cada usuario arma SUS carpetas con cualquier proyecto de su Biblioteca (propios, compartidos,
-- guardados): no se toca el proyecto, se guarda "en qué carpeta lo tengo yo". Idempotente.
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

-- Qué proyecto tengo en qué carpeta (un proyecto, una carpeta por usuario)
create table if not exists public.project_folder_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  folder_id uuid not null references public.project_folders(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index if not exists project_folder_items_folder_idx on public.project_folder_items (folder_id);
alter table public.project_folder_items enable row level security;
drop policy if exists "Mis proyectos en carpetas" on public.project_folder_items;
create policy "Mis proyectos en carpetas" on public.project_folder_items
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.project_folders f where f.id = folder_id and f.user_id = auth.uid()));
grant select, insert, update, delete on public.project_folder_items to authenticated;
