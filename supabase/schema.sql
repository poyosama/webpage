-- =========================================================================
-- EL TABLERO // SCHEMA DE SUPABASE POSTGRESQL
-- Ejecutá este script en el SQL Editor de tu proyecto en Supabase
-- =========================================================================

-- 1. TABLA: PROFILES (Perfiles de raperos y productores)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  handle text unique not null,
  name text not null,
  role text default 'Rapero · Artista',
  zone text default 'Mendoza',
  crew text default 'UG BOARD',
  bio text default '',
  color text default '#111111',
  avatar_url text,
  banner_url text,
  stickers text[] default array['RAW', 'MIC', '808']::text[],
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. TABLA: PROJECTS (Mixtapes, EPs, LPs, Singles en la Biblioteca 3D)
create table if not exists public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  artist text not null,
  type text default 'Mixtape' not null,
  year text default '2026',
  status text default 'Publicado',
  zone text default 'Mendoza',
  description text default '',
  cover_url text,
  order_index integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. TABLA: TRACKS (Canciones de cada proyecto con metadata)
create table if not exists public.tracks (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  title text not null,
  artist text not null,
  feat text,
  prod text,
  bpm integer default 140,
  musical_key text default 'F#m',
  duration text default '2:30',
  duration_sec integer default 150,
  version integer default 1,
  note text,
  glyph text default '01',
  c1 text default '#ffffff',
  c2 text default '#888888',
  accent text default '#ffffff',
  audio_freq integer default 80,
  audio_url text,
  cover_url text,
  order_index integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. TABLA: PROJECT_VIDEOS (Clips Canvas de 3-5 segundos o GIFs)
create table if not exists public.project_videos (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  url text not null,
  label text default 'canvas_loop.mp4',
  media_type text default 'video',
  duration text default '0:04',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tracks enable row level security;
alter table public.project_videos enable row level security;

-- Políticas de lectura pública (todo el mundo puede escuchar y ver en El Tablero)
create policy "Perfiles visibles por todos" on public.profiles for select using (true);
create policy "Proyectos visibles por todos" on public.projects for select using (true);
create policy "Tracks visibles por todos" on public.tracks for select using (true);
create policy "Videos visibles por todos" on public.project_videos for select using (true);

-- Políticas de modificación (solo el creador autenticado puede editar/borrar lo suyo)
create policy "Usuarios editan su propio perfil" on public.profiles for all using (auth.uid() = id);
create policy "Usuarios gestionan sus proyectos" on public.projects for all using (auth.uid() = user_id);
create policy "Usuarios gestionan tracks de sus proyectos" on public.tracks for all using (
  exists (select 1 from public.projects where projects.id = tracks.project_id and projects.user_id = auth.uid())
);
create policy "Usuarios gestionan videos de sus proyectos" on public.project_videos for all using (
  exists (select 1 from public.projects where projects.id = project_videos.project_id and projects.user_id = auth.uid())
);

-- BUCKET DE STORAGE PARA TAPAS Y AUDIO
insert into storage.buckets (id, name, public) 
values ('el-tablero-media', 'el-tablero-media', true)
on conflict (id) do nothing;

create policy "Media publica legible por todos" on storage.objects for select using (bucket_id = 'el-tablero-media');
create policy "Usuarios autenticados suben media" on storage.objects for insert with check (bucket_id = 'el-tablero-media' and auth.role() = 'authenticated');
create policy "Usuarios editan y borran su media" on storage.objects for all using (bucket_id = 'el-tablero-media' and auth.uid() = owner);
